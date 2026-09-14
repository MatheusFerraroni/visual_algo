import { createConfig, DEFAULT_CONFIG } from "../config.js";

export const SETTINGS_STORAGE_KEY = "evo.settings.v1";
export const SETTINGS_VERSION = 1;
export const DEFAULT_HISTORY_VIEW = "last50";
export const DEFAULT_SPEED = 1;

const HISTORY_VIEWS = Object.freeze(["last50", "all"]);

function normalizeHistoryView(historyView) {
  return historyView === "last2" ? "last50" : historyView;
}

function freezeSettings({ config, speed, historyView, source, warning = null }) {
  return Object.freeze({ config, speed, historyView, source, warning });
}

function extractConfigOverrides(config) {
  return {
    seeds: {
      simulation: config.seeds.simulation,
      map: config.seeds.map,
    },
    population: {
      size: config.population.size,
    },
    generation: {
      durationSeconds: config.generation.durationSeconds,
    },
    movement: {
      costCoefficient: config.movement.costCoefficient,
      costExponent: config.movement.costExponent,
      turnCostAtMaxPerSecond: config.movement.turnCostAtMaxPerSecond,
    },
    energy: {
      basalMetabolismPerSecond: config.energy.basalMetabolismPerSecond,
    },
    water: {
      movementCostMultiplier: config.water.movementCostMultiplier,
    },
    life: {
      zeroEnergyDamagePerSecond: config.life.zeroEnergyDamagePerSecond,
    },
    healing: {
      energyThreshold: config.healing.energyThreshold,
      energyPerLife: config.healing.energyPerLife,
      maxLifePerSecond: config.healing.maxLifePerSecond,
    },
    food: {
      initialCount: config.food.initialCount,
      spawnCount: config.food.spawnCount,
      spawnIntervalSeconds: config.food.spawnIntervalSeconds,
      maxCount: config.food.maxCount,
      minEnergy: config.food.minEnergy,
      maxEnergy: config.food.maxEnergy,
      inactivityTimeoutSeconds: config.food.inactivityTimeoutSeconds,
    },
    eyes: {
      count: config.eyes.count,
      fieldOfViewDegrees: config.eyes.fieldOfViewDegrees,
      rangeTiles: config.eyes.rangeTiles,
    },
    time: {
      brainHz: config.time.brainHz,
    },
    network: {
      hiddenLayers: [...config.network.hiddenLayers],
      activation: config.network.activation,
      initialGeneMin: config.network.initialGeneMin,
      initialGeneMax: config.network.initialGeneMax,
      geneMin: config.network.geneMin,
      geneMax: config.network.geneMax,
    },
    genetics: {
      eliteCount: config.genetics.eliteCount,
      tournamentSize: config.genetics.tournamentSize,
      uniformCrossoverParentAChance: config.genetics.uniformCrossoverParentAChance,
      mutationChancePerGene: config.genetics.mutationChancePerGene,
      mutationStdDev: config.genetics.mutationStdDev,
    },
  };
}

function validateUiSettings(config, speed, historyView) {
  if (!config.time.speedPresets.includes(speed)) {
    throw new RangeError("A velocidade salva não pertence aos presets configurados.");
  }
  if (!HISTORY_VIEWS.includes(historyView)) {
    throw new RangeError("O modo salvo do histórico é inválido.");
  }
}

function formatUuid(bytes) {
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

export function createRandomSeed(cryptoObject = globalThis.crypto) {
  if (typeof cryptoObject?.randomUUID === "function") {
    return cryptoObject.randomUUID();
  }
  if (typeof cryptoObject?.getRandomValues === "function") {
    return formatUuid(cryptoObject.getRandomValues(new Uint8Array(16)));
  }
  throw new Error("Este navegador não oferece geração criptográfica de UUID.");
}

export class SettingsStore {
  #storage;
  #cryptoObject;

  constructor({ storage = null, cryptoObject = globalThis.crypto } = {}) {
    this.#storage = storage;
    this.#cryptoObject = cryptoObject;
  }

  load() {
    if (this.#storage === null) {
      return freezeSettings({
        ...this.createFresh(),
        source: "generated",
        warning: "O armazenamento local não está disponível; as preferências valerão somente nesta aba.",
      });
    }

    let raw;
    try {
      raw = this.#storage.getItem(SETTINGS_STORAGE_KEY);
    } catch {
      return freezeSettings({
        ...this.createFresh(),
        source: "generated",
        warning: "Não foi possível ler o armazenamento local; novas seeds foram usadas nesta aba.",
      });
    }
    if (raw === null) {
      return freezeSettings({ ...this.createFresh(), source: "generated" });
    }

    try {
      const payload = JSON.parse(raw);
      if (!payload || payload.version !== SETTINGS_VERSION || !payload.config) {
        throw new TypeError("Versão de preferências incompatível.");
      }
      const config = createConfig(payload.config);
      const historyView = normalizeHistoryView(payload.historyView);
      validateUiSettings(config, payload.speed, historyView);
      return freezeSettings({
        config,
        speed: payload.speed,
        historyView,
        source: "stored",
      });
    } catch {
      const clearWarning = this.clear();
      return freezeSettings({
        ...this.createFresh(),
        source: "generated",
        warning: clearWarning
          ?? "As preferências salvas eram inválidas e foram substituídas por novas seeds.",
      });
    }
  }

  createFresh() {
    const config = createConfig({
      seeds: {
        simulation: createRandomSeed(this.#cryptoObject),
        map: createRandomSeed(this.#cryptoObject),
      },
    });
    return Object.freeze({
      config,
      speed: DEFAULT_SPEED,
      historyView: DEFAULT_HISTORY_VIEW,
    });
  }

  save(config, speed, historyView) {
    try {
      const normalizedConfig = createConfig(extractConfigOverrides(config));
      validateUiSettings(normalizedConfig, speed, historyView);
      if (this.#storage === null) {
        throw new Error("Armazenamento indisponível.");
      }
      this.#storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
        version: SETTINGS_VERSION,
        config: extractConfigOverrides(normalizedConfig),
        speed,
        historyView,
      }));
      return null;
    } catch {
      return "Não foi possível salvar as preferências no navegador.";
    }
  }

  clear() {
    try {
      this.#storage?.removeItem(SETTINGS_STORAGE_KEY);
      return null;
    } catch {
      return "Os padrões foram aplicados, mas não foi possível limpar as preferências salvas.";
    }
  }
}

export function createDefaultSettings() {
  return Object.freeze({
    config: DEFAULT_CONFIG,
    speed: DEFAULT_SPEED,
    historyView: DEFAULT_HISTORY_VIEW,
  });
}
