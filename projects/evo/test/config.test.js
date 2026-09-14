import assert from "node:assert/strict";
import test from "node:test";

import {
  CONFIG_LIMITS,
  ConfigurationError,
  createConfig,
  DEFAULT_CONFIG,
} from "../src/config.js";

test("DEFAULT_CONFIG materializa e congela todos os defaults aprovados", () => {
  assert.deepEqual(DEFAULT_CONFIG.seeds, { simulation: "evo-1", map: "evo-1" });
  assert.equal(DEFAULT_CONFIG.world.columns, 128);
  assert.equal(DEFAULT_CONFIG.world.rows, 128);
  assert.equal(DEFAULT_CONFIG.world.tileSizePx, 16);
  assert.deepEqual(DEFAULT_CONFIG.world.terrain, {
    noiseScale: 0.075,
    octaves: 4,
    persistence: 0.5,
    lacunarity: 2,
    noiseWeight: 0.7,
    archipelago: {
      secondaryIslandCount: 8,
      minLandFraction: 0.46,
      maxLandFraction: 0.49,
      minMainLandFraction: 0.5,
      maxMainLandFraction: 0.65,
      minSecondaryIslandTiles: 256,
      satelliteOrbitMinFraction: 0.72,
      satelliteOrbitMaxFraction: 0.78,
      angularJitterFraction: 0.12,
      separationTiles: 1,
      lakeMinDepthTiles: 3,
      minLakeCount: 4,
      maxLakeCount: 8,
      maxLakeTiles: 32,
      maxLayoutAttempts: 64,
    },
    minLakeTiles: 4,
    quantizationDecimals: 6,
    forceWaterBorder: true,
  });
  assert.deepEqual(DEFAULT_CONFIG.world.productivity, {
    noiseScale: 0.1,
    octaves: 3,
    persistence: 0.55,
    lacunarity: 2,
    targetTotal: 5_760,
    waterProximityRangeTiles: 6,
    waterProximityBonus: 0.35,
    islandSizeBonus: 0.5,
    quantizationDecimals: 6,
  });
  assert.equal(DEFAULT_CONFIG.time.physicsHz, 30);
  assert.equal(DEFAULT_CONFIG.time.brainHz, 10);
  assert.deepEqual(DEFAULT_CONFIG.time.speedPresets, [1, 2, 4, 8, "max"]);
  assert.equal(DEFAULT_CONFIG.ui.mapPreviewDebounceMs, 300);
  assert.equal(DEFAULT_CONFIG.generation.durationSeconds, 120);
  assert.equal(DEFAULT_CONFIG.population.size, 40);
  assert.deepEqual(DEFAULT_CONFIG.camera, {
    minZoom: 1,
    maxZoom: 8,
    buttonZoomFactor: 1.25,
    wheelSensitivity: 0.001,
    dragThresholdCssPx: 4,
  });
  assert.equal(DEFAULT_CONFIG.movement.costCoefficient, 4);
  assert.equal(DEFAULT_CONFIG.movement.costExponent, 2);
  assert.equal(DEFAULT_CONFIG.movement.turnCostAtMaxPerSecond, 1);
  assert.equal(DEFAULT_CONFIG.energy.basalMetabolismPerSecond, 0.75);
  assert.equal(DEFAULT_CONFIG.water.movementCostMultiplier, 3);
  assert.equal(DEFAULT_CONFIG.life.zeroEnergyDamagePerSecond, 20);
  assert.deepEqual(DEFAULT_CONFIG.healing, {
    energyThreshold: 80,
    energyPerLife: 2,
    maxLifePerSecond: 1,
  });
  assert.equal(DEFAULT_CONFIG.food.initialCount, 20);
  assert.equal(DEFAULT_CONFIG.food.maxCount, 300);
  assert.equal(DEFAULT_CONFIG.food.minEnergy, 10);
  assert.equal(DEFAULT_CONFIG.food.maxEnergy, 50);
  assert.equal(DEFAULT_CONFIG.food.inactivityTimeoutSeconds, 30);
  assert.equal(DEFAULT_CONFIG.food.eatDistanceTiles, 1);
  assert.equal(DEFAULT_CONFIG.food.safeEatingDistanceFactor, 0.9);
  assert.equal(DEFAULT_CONFIG.food.feedingStartEnergyThreshold, 90);
  assert.equal(DEFAULT_CONFIG.derived.foodSpawnIntervalTicks, 90);
  assert.equal(DEFAULT_CONFIG.derived.foodInactivityTimeoutTicks, 900);
  assert.equal(DEFAULT_CONFIG.derived.foodSafeEatingDistanceTiles, 0.9);
  assert.equal(DEFAULT_CONFIG.derived.brainIntervalTicks, 3);
  assert.equal(DEFAULT_CONFIG.eyes.count, 5);
  assert.deepEqual(DEFAULT_CONFIG.network.hiddenLayers, [12]);
  assert.equal(DEFAULT_CONFIG.network.activation, "tanh");
  assert.equal(DEFAULT_CONFIG.network.quantizationDecimals, 9);
  assert.deepEqual(DEFAULT_CONFIG.derived.networkLayerSizes, [16, 12, 2]);
  assert.equal(DEFAULT_CONFIG.derived.networkGeneCount, 230);
  assert.equal(DEFAULT_CONFIG.genetics.eliteCount, 4);
  assert.deepEqual(CONFIG_LIMITS, {
    eyes: { maxCount: 15 },
    network: {
      maxHiddenLayers: 4,
      maxHiddenLayerSize: 64,
      maxGeneCount: 20_000,
      activations: ["tanh", "relu", "sigmoid"],
    },
  });
  assert.equal(DEFAULT_CONFIG.genetics.mutationChancePerGene, 0.05);
  assert.equal(DEFAULT_CONFIG.genetics.uniformCrossoverParentAChance, 0.5);
  assert(Object.isFrozen(DEFAULT_CONFIG));
  assert(Object.isFrozen(DEFAULT_CONFIG.seeds));
  assert(Object.isFrozen(DEFAULT_CONFIG.world.terrain));
  assert(Object.isFrozen(DEFAULT_CONFIG.world.terrain.archipelago));
  assert(Object.isFrozen(DEFAULT_CONFIG.world.productivity));
  assert(Object.isFrozen(DEFAULT_CONFIG.time));
  assert(Object.isFrozen(DEFAULT_CONFIG.network.hiddenLayers));
  assert(Object.isFrozen(DEFAULT_CONFIG.derived.networkLayerSizes));
  assert(Object.isFrozen(CONFIG_LIMITS.network.activations));
});

test("createConfig aplica overrides conhecidos e recalcula valores derivados", () => {
  const config = createConfig({
    seeds: { simulation: 42, map: "arquipelago" },
    world: {
      columns: 20,
      tileSizePx: 16,
      terrain: { archipelago: { minSecondaryIslandTiles: 20 } },
      productivity: { targetTotal: 1_000 },
    },
    time: { physicsHz: 60, brainHz: 12 },
    generation: { durationSeconds: 90 },
    population: { size: 11 },
    genetics: { eliteCount: 2 },
    eyes: { count: 7 },
  });

  assert.equal(config.seeds.simulation, "42");
  assert.equal(config.seeds.map, "arquipelago");
  assert.equal(config.world.rows, 128);
  assert.equal(config.derived.worldWidthPx, 320);
  assert.equal(config.derived.worldHeightPx, 2_048);
  assert.equal(config.derived.dtSeconds, 1 / 60);
  assert.equal(config.derived.generationMaxTicks, 5_400);
  assert.equal(config.derived.foodSpawnIntervalTicks, 180);
  assert.equal(config.derived.foodInactivityTimeoutTicks, 1_800);
  assert.equal(config.derived.brainIntervalTicks, 5);
  assert.equal(config.derived.networkInputCount, 20);
  assert.deepEqual(config.derived.networkLayerSizes, [20, 12, 2]);
  assert.equal(config.derived.networkGeneCount, 278);
  assert.equal(config.genetics.eliteCount, 2);
  assert(Object.isFrozen(config.derived));
});

test("createConfig rejeita chaves desconhecidas com o caminho completo", () => {
  assert.throws(
    () => createConfig({ world: { unknown: true } }),
    (error) => error instanceof ConfigurationError
      && error.path === "config.world.unknown",
  );
});

test("createConfig rejeita combinações incompatíveis", () => {
  assert.throws(
    () => createConfig({ time: { physicsHz: 30, brainHz: 7 } }),
    /deve dividir exatamente a frequência física/,
  );
  assert.throws(
    () => createConfig({ being: { initialEnergy: 101 } }),
    /config\.being\.initialEnergy/,
  );
  assert.throws(
    () => createConfig({ seeds: { map: "   " } }),
    /não pode ser vazia/,
  );
  assert.throws(
    () => createConfig({
      world: { terrain: { archipelago: { minLandFraction: 0.6, maxLandFraction: 0.5 } } },
    }),
    /não pode exceder a fração máxima de terra/,
  );
  assert.throws(
    () => createConfig({
      world: { terrain: { archipelago: { minLakeCount: 9, maxLakeCount: 8 } } },
    }),
    /não pode exceder a quantidade máxima de lagos/,
  );
  assert.throws(
    () => createConfig({ world: { terrain: { minLakeTiles: 0 } } }),
    /config\.world\.terrain\.minLakeTiles/,
  );
  assert.throws(
    () => createConfig({ world: { productivity: { waterProximityBonus: 1.1 } } }),
    /config\.world\.productivity\.waterProximityBonus/,
  );
  assert.throws(
    () => createConfig({ world: { productivity: { islandSizeBonus: 1.1 } } }),
    /config\.world\.productivity\.islandSizeBonus/,
  );
  assert.throws(
    () => createConfig({
      world: { terrain: { archipelago: { minSecondaryIslandTiles: 2_000 } } },
    }),
    /não cabe na fração mínima de terra/,
  );
  assert.throws(
    () => createConfig({ world: { productivity: { targetTotal: 12_000 } } }),
    /não pode exceder a quantidade mínima de tiles terrestres/,
  );
  assert.throws(
    () => createConfig({ food: { spawnIntervalSeconds: 0.01 } }),
    /quantidade inteira de ticks físicos/,
  );
  assert.throws(
    () => createConfig({ food: { initialCount: 21, maxCount: 20 } }),
    /não pode exceder o máximo de comidas/,
  );
  assert.throws(
    () => createConfig({ food: { minEnergy: 51, maxEnergy: 50 } }),
    /não pode exceder a energia máxima/,
  );
  assert.throws(
    () => createConfig({ food: { safeEatingDistanceFactor: 0 } }),
    /config\.food\.safeEatingDistanceFactor/,
  );
  assert.throws(
    () => createConfig({ food: { safeEatingDistanceFactor: 1.01 } }),
    /config\.food\.safeEatingDistanceFactor/,
  );
  assert.throws(
    () => createConfig({ food: { feedingStartEnergyThreshold: 101 } }),
    /config\.food\.feedingStartEnergyThreshold/,
  );
  assert.throws(
    () => createConfig({ food: { inactivityTimeoutSeconds: -1 } }),
    /config\.food\.inactivityTimeoutSeconds/,
  );
  assert.throws(
    () => createConfig({ food: { inactivityTimeoutSeconds: 0.01 } }),
    /quantidade inteira de ticks físicos/,
  );
  assert.throws(
    () => createConfig({
      food: {
        inactivityTimeoutSeconds: Math.floor(Number.MAX_SAFE_INTEGER / 60) + 1,
      },
    }),
    /acréscimo aleatório/,
  );
  assert.throws(
    () => createConfig({ movement: { costCoefficient: -1 } }),
    /config\.movement\.costCoefficient/,
  );
  assert.throws(
    () => createConfig({ movement: { costExponent: 0 } }),
    /config\.movement\.costExponent/,
  );
  assert.throws(
    () => createConfig({ movement: { turnCostAtMaxPerSecond: -1 } }),
    /config\.movement\.turnCostAtMaxPerSecond/,
  );
  assert.throws(
    () => createConfig({ energy: { basalMetabolismPerSecond: -1 } }),
    /config\.energy\.basalMetabolismPerSecond/,
  );
  assert.throws(
    () => createConfig({ water: { movementCostMultiplier: 0 } }),
    /config\.water\.movementCostMultiplier/,
  );
  assert.throws(
    () => createConfig({ life: { zeroEnergyDamagePerSecond: -1 } }),
    /config\.life\.zeroEnergyDamagePerSecond/,
  );
  assert.throws(
    () => createConfig({ healing: { energyThreshold: 101 } }),
    /config\.healing\.energyThreshold/,
  );
  assert.throws(
    () => createConfig({ healing: { energyPerLife: 0 } }),
    /config\.healing\.energyPerLife/,
  );
  assert.throws(
    () => createConfig({ healing: { maxLifePerSecond: -1 } }),
    /config\.healing\.maxLifePerSecond/,
  );
  assert.equal(
    createConfig({ food: { inactivityTimeoutSeconds: 0 } })
      .derived.foodInactivityTimeoutTicks,
    0,
  );
  assert.throws(() => createConfig({ eyes: { count: 16 } }), /não pode exceder 15/);
  assert.throws(
    () => createConfig({ network: { hiddenLayers: [65] } }),
    /não pode exceder 64 neurônios/,
  );
  assert.throws(
    () => createConfig({ network: { hiddenLayers: [1, 1, 1, 1, 1] } }),
    /no máximo 4 camadas/,
  );
  assert.throws(
    () => createConfig({ network: { activation: "linear" } }),
    /deve ser uma das ativações/,
  );
  assert.throws(
    () => createConfig({ network: { outputCount: 3 } }),
    /exatamente 2/,
  );
  assert.throws(
    () => createConfig({
      population: { size: 2 },
      genetics: { eliteCount: 2, tournamentSize: 3 },
    }),
    /não pode exceder o tamanho da população/,
  );
  assert.throws(
    () => createConfig({ population: { size: 2 }, genetics: { eliteCount: 3 } }),
    /config\.genetics\.eliteCount/,
  );
  assert.throws(
    () => createConfig({ genetics: { eliteCount: 0 } }),
    /config\.genetics\.eliteCount/,
  );
  const maximumTopology = createConfig({
    eyes: { count: 15 },
    network: { hiddenLayers: [64, 64, 64, 64] },
  });
  assert.equal(maximumTopology.derived.networkGeneCount, 14_978);
  assert(maximumTopology.derived.networkGeneCount <= CONFIG_LIMITS.network.maxGeneCount);
});

test("uma configuração derivada não altera DEFAULT_CONFIG", () => {
  createConfig({ population: { size: 12 } });
  assert.equal(DEFAULT_CONFIG.population.size, 40);
});
