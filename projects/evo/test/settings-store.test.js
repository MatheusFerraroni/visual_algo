import assert from "node:assert/strict";
import test from "node:test";

import { createConfig, DEFAULT_CONFIG } from "../src/config.js";
import {
  createDefaultSettings,
  createRandomSeed,
  SETTINGS_STORAGE_KEY,
  SettingsStore,
} from "../src/ui/settings-store.js";

class MemoryStorage {
  values = new Map();

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, value);
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

function createCrypto(...uuids) {
  let index = 0;
  return { randomUUID: () => uuids[index++] };
}

test("sem preferências cria duas seeds independentes e permite round-trip", () => {
  const storage = new MemoryStorage();
  const store = new SettingsStore({
    storage,
    cryptoObject: createCrypto("uuid-simulation", "uuid-map"),
  });
  const fresh = store.load();

  assert.equal(fresh.source, "generated");
  assert.deepEqual(fresh.config.seeds, {
    simulation: "uuid-simulation",
    map: "uuid-map",
  });
  assert.equal(store.save(fresh.config, "max", "all"), null);

  const restored = store.load();
  assert.equal(restored.source, "stored");
  assert.equal(restored.speed, "max");
  assert.equal(restored.historyView, "all");
  assert.deepEqual(restored.config.seeds, fresh.config.seeds);
  assert(Object.isFrozen(restored));
});

test("payload persiste somente controles configuráveis e preferências visuais", () => {
  const storage = new MemoryStorage();
  const store = new SettingsStore({ storage, cryptoObject: createCrypto() });
  const config = createConfig({
    seeds: { simulation: "sim", map: "map" },
    population: { size: 12 },
    generation: { durationSeconds: 45 },
    food: {
      maxCount: 420,
      minEnergy: 12,
      maxEnergy: 72,
      inactivityTimeoutSeconds: 15,
    },
    movement: {
      costCoefficient: 6,
      costExponent: 1.5,
      turnCostAtMaxPerSecond: 2,
    },
    energy: { basalMetabolismPerSecond: 1.25 },
    water: { movementCostMultiplier: 4 },
    life: { zeroEnergyDamagePerSecond: 12 },
    healing: { energyThreshold: 70, energyPerLife: 3, maxLifePerSecond: 2 },
    genetics: { eliteCount: 3 },
  });
  store.save(config, 4, "last50");
  const payload = JSON.parse(storage.getItem(SETTINGS_STORAGE_KEY));

  assert.equal(payload.version, 1);
  assert.equal(payload.config.population.size, 12);
  assert.equal(payload.config.generation.durationSeconds, 45);
  assert.equal(payload.config.food.maxCount, 420);
  assert.equal(payload.config.food.minEnergy, 12);
  assert.equal(payload.config.food.maxEnergy, 72);
  assert.equal(payload.config.food.inactivityTimeoutSeconds, 15);
  assert.deepEqual(payload.config.movement, {
    costCoefficient: 6,
    costExponent: 1.5,
    turnCostAtMaxPerSecond: 2,
  });
  assert.deepEqual(payload.config.energy, { basalMetabolismPerSecond: 1.25 });
  assert.deepEqual(payload.config.water, { movementCostMultiplier: 4 });
  assert.deepEqual(payload.config.life, { zeroEnergyDamagePerSecond: 12 });
  assert.deepEqual(payload.config.healing, {
    energyThreshold: 70,
    energyPerLife: 3,
    maxLifePerSecond: 2,
  });
  assert.equal(payload.config.genetics.eliteCount, 3);
  assert.equal(payload.speed, 4);
  assert.equal(payload.historyView, "last50");
  assert.equal(payload.config.world, undefined);
  assert.equal(payload.camera, undefined);
  assert.equal(payload.history, undefined);
});

test("payload legado sem políticas novas adota os defaults atuais", () => {
  const storage = new MemoryStorage();
  const store = new SettingsStore({ storage, cryptoObject: createCrypto() });
  store.save(createConfig({ food: { maxCount: 180 } }), 1, "last50");
  const payload = JSON.parse(storage.getItem(SETTINGS_STORAGE_KEY));
  delete payload.config.food.maxCount;
  delete payload.config.food.minEnergy;
  delete payload.config.food.maxEnergy;
  delete payload.config.food.inactivityTimeoutSeconds;
  delete payload.config.movement;
  delete payload.config.energy;
  delete payload.config.water;
  delete payload.config.life;
  delete payload.config.healing;
  storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(payload));

  const restored = store.load();
  assert.equal(restored.source, "stored");
  assert.equal(restored.config.food.maxCount, 300);
  assert.equal(restored.config.food.minEnergy, 10);
  assert.equal(restored.config.food.maxEnergy, 50);
  assert.equal(restored.config.food.inactivityTimeoutSeconds, 30);
  assert.deepEqual(restored.config.movement, DEFAULT_CONFIG.movement);
  assert.deepEqual(restored.config.energy, DEFAULT_CONFIG.energy);
  assert.deepEqual(restored.config.water, DEFAULT_CONFIG.water);
  assert.deepEqual(restored.config.life, DEFAULT_CONFIG.life);
  assert.deepEqual(restored.config.healing, DEFAULT_CONFIG.healing);
});

test("tempo máximo da geração é restaurado e validado pelo contrato de ticks", () => {
  const storage = new MemoryStorage();
  const store = new SettingsStore({ storage, cryptoObject: createCrypto() });
  const config = createConfig({ generation: { durationSeconds: 90 } });
  assert.equal(store.save(config, 1, "last50"), null);
  assert.equal(store.load().config.generation.durationSeconds, 90);

  const previous = storage.getItem(SETTINGS_STORAGE_KEY);
  const invalidPayload = JSON.parse(previous);
  invalidPayload.config.generation.durationSeconds = 1.01;
  storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(invalidPayload));
  const freshStore = new SettingsStore({
    storage,
    cryptoObject: createCrypto("fresh-duration-sim", "fresh-duration-map"),
  });
  const restored = freshStore.load();
  assert.equal(restored.source, "generated");
  assert.equal(restored.config.generation.durationSeconds, 120);
  assert.equal(storage.getItem(SETTINGS_STORAGE_KEY), null);
});

test("payload inválido é removido e substituído por configuração nova", () => {
  const storage = new MemoryStorage();
  storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ version: 99 }));
  storage.setItem("outro-app", "preservar");
  const store = new SettingsStore({
    storage,
    cryptoObject: createCrypto("fresh-sim", "fresh-map"),
  });

  const result = store.load();
  assert.equal(result.source, "generated");
  assert.deepEqual(result.config.seeds, { simulation: "fresh-sim", map: "fresh-map" });
  assert.match(result.warning, /inválidas/);
  assert.equal(storage.getItem(SETTINGS_STORAGE_KEY), null);
  assert.equal(storage.getItem("outro-app"), "preservar");
});

test("falhas de armazenamento não impedem a configuração da sessão", () => {
  const storage = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
    removeItem() { throw new Error("blocked"); },
  };
  const store = new SettingsStore({
    storage,
    cryptoObject: createCrypto("session-sim", "session-map"),
  });

  const result = store.load();
  assert.equal(result.config.seeds.simulation, "session-sim");
  assert.match(result.warning, /Não foi possível ler/);
  assert.match(store.save(result.config, 1, "last50"), /Não foi possível salvar/);
  assert.match(store.clear(), /não foi possível limpar/);
});

test("fallback criptográfico produz UUID v4 e padrões não são persistidos", () => {
  const cryptoObject = {
    getRandomValues(bytes) {
      bytes.forEach((_, index) => { bytes[index] = index; });
      return bytes;
    },
  };
  assert.match(
    createRandomSeed(cryptoObject),
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  assert.deepEqual(createDefaultSettings(), {
    config: DEFAULT_CONFIG,
    speed: 1,
    historyView: "last50",
  });
});

test("modo legado last2 é migrado para last50 sem perder a configuração", () => {
  const storage = new MemoryStorage();
  const store = new SettingsStore({ storage, cryptoObject: createCrypto() });
  store.save(createConfig({ seeds: { simulation: "sim", map: "map" } }), 2, "last50");
  const payload = JSON.parse(storage.getItem(SETTINGS_STORAGE_KEY));
  payload.historyView = "last2";
  storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(payload));

  const restored = store.load();
  assert.equal(restored.source, "stored");
  assert.equal(restored.historyView, "last50");
  assert.equal(restored.speed, 2);
  assert.deepEqual(restored.config.seeds, { simulation: "sim", map: "map" });
});

test("valores visuais inválidos não sobrescrevem o último payload válido", () => {
  const storage = new MemoryStorage();
  const store = new SettingsStore({ storage, cryptoObject: createCrypto() });
  store.save(DEFAULT_CONFIG, 1, "last50");
  const previous = storage.getItem(SETTINGS_STORAGE_KEY);

  assert.match(store.save(DEFAULT_CONFIG, 3, "last50"), /Não foi possível salvar/);
  assert.equal(storage.getItem(SETTINGS_STORAGE_KEY), previous);

  const invalidDuration = {
    ...DEFAULT_CONFIG,
    generation: { durationSeconds: 1.01 },
  };
  assert.match(
    store.save(invalidDuration, 1, "last50"),
    /Não foi possível salvar/,
  );
  assert.equal(storage.getItem(SETTINGS_STORAGE_KEY), previous);

  const invalidFoodEnergy = {
    ...DEFAULT_CONFIG,
    food: { ...DEFAULT_CONFIG.food, minEnergy: 60, maxEnergy: 50 },
  };
  assert.match(
    store.save(invalidFoodEnergy, 1, "last50"),
    /Não foi possível salvar/,
  );
  assert.equal(storage.getItem(SETTINGS_STORAGE_KEY), previous);
});
