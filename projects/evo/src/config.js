export class ConfigurationError extends Error {
  constructor(path, message) {
    super(`${path}: ${message}`);
    this.name = "ConfigurationError";
    this.path = path;
  }
}

const DEFAULT_VALUES = {
  seeds: {
    simulation: "evo-1",
    map: "evo-1",
  },
  world: {
    columns: 128,
    rows: 128,
    tileSizePx: 16,
    terrain: {
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
    },
    productivity: {
      noiseScale: 0.1,
      octaves: 3,
      persistence: 0.55,
      lacunarity: 2,
      targetTotal: 5_760,
      waterProximityRangeTiles: 6,
      waterProximityBonus: 0.35,
      islandSizeBonus: 0.5,
      quantizationDecimals: 6,
    },
  },
  time: {
    physicsHz: 30,
    brainHz: 10,
    speedPresets: [1, 2, 4, 8, "max"],
    maxProcessingBudgetMs: 8,
    maxRealDeltaMs: 250,
  },
  ui: {
    mapPreviewDebounceMs: 300,
  },
  camera: {
    minZoom: 1,
    maxZoom: 8,
    buttonZoomFactor: 1.25,
    wheelSensitivity: 0.001,
    dragThresholdCssPx: 4,
  },
  generation: {
    durationSeconds: 120,
  },
  population: {
    size: 40,
  },
  being: {
    initialLife: 100,
    maxLife: 100,
    initialEnergy: 60,
    maxEnergy: 100,
  },
  movement: {
    maxSpeedTilesPerSecond: 1,
    maxTurnDegreesPerSecond: 180,
    costCoefficient: 4,
    costExponent: 2,
    turnCostAtMaxPerSecond: 1,
  },
  energy: {
    basalMetabolismPerSecond: 0.75,
  },
  water: {
    movementCostMultiplier: 3,
  },
  life: {
    zeroEnergyDamagePerSecond: 20,
  },
  healing: {
    energyThreshold: 80,
    energyPerLife: 2,
    maxLifePerSecond: 1,
  },
  food: {
    initialCount: 20,
    spawnIntervalSeconds: 3,
    spawnCount: 3,
    maxCount: 300,
    maxConsumptionPerSecond: 3,
    minEnergy: 10,
    maxEnergy: 50,
    inactivityTimeoutSeconds: 30,
    eatDistanceTiles: 1,
    safeEatingDistanceFactor: 0.9,
    feedingStartEnergyThreshold: 90,
  },
  eyes: {
    count: 5,
    fieldOfViewDegrees: 120,
    rangeTiles: 6,
  },
  network: {
    hiddenLayers: [12],
    activation: "tanh",
    initialGeneMin: -1,
    initialGeneMax: 1,
    geneMin: -5,
    geneMax: 5,
    outputCount: 2,
    quantizationDecimals: 9,
  },
  genetics: {
    eliteCount: 4,
    tournamentSize: 3,
    uniformCrossoverParentAChance: 0.5,
    mutationChancePerGene: 0.05,
    mutationStdDev: 0.15,
  },
};

export const CONFIG_LIMITS = deepFreeze({
  eyes: {
    maxCount: 15,
  },
  network: {
    maxHiddenLayers: 4,
    maxHiddenLayerSize: 64,
    maxGeneCount: 20_000,
    activations: ["tanh", "relu", "sigmoid"],
  },
});

function isPlainObject(value) {
  return value !== null
    && typeof value === "object"
    && Object.getPrototypeOf(value) === Object.prototype;
}

function clone(value) {
  if (Array.isArray(value)) {
    return value.map(clone);
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, clone(entry)]),
    );
  }

  return value;
}

function mergeKnown(base, overrides, path = "config") {
  if (!isPlainObject(overrides)) {
    throw new ConfigurationError(path, "deve ser um objeto");
  }

  const result = clone(base);

  for (const [key, override] of Object.entries(overrides)) {
    const childPath = `${path}.${key}`;

    if (!Object.hasOwn(base, key)) {
      throw new ConfigurationError(childPath, "chave desconhecida");
    }

    if (isPlainObject(base[key])) {
      result[key] = mergeKnown(base[key], override, childPath);
    } else {
      result[key] = clone(override);
    }
  }

  return result;
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}

function assert(condition, path, message) {
  if (!condition) {
    throw new ConfigurationError(path, message);
  }
}

function assertFiniteNumber(value, path, { min = -Infinity, max = Infinity } = {}) {
  assert(Number.isFinite(value), path, "deve ser um número finito");
  assert(value >= min && value <= max, path, `deve estar entre ${min} e ${max}`);
}

function assertPositiveNumber(value, path) {
  assertFiniteNumber(value, path);
  assert(value > 0, path, "deve ser maior que zero");
}

function assertPositiveInteger(value, path) {
  assert(Number.isInteger(value) && value > 0, path, "deve ser um inteiro maior que zero");
}

function calculateNetworkGeneCount(layerSizes) {
  let total = 0;
  for (let index = 1; index < layerSizes.length; index += 1) {
    total += (layerSizes[index - 1] + 1) * layerSizes[index];
  }
  return total;
}

function validate(config) {
  for (const name of ["simulation", "map"]) {
    const seed = config.seeds[name];
    assert(
      (typeof seed === "string")
        || (typeof seed === "number" && Number.isFinite(seed)),
      `config.seeds.${name}`,
      "deve ser texto ou número finito",
    );
    assert(String(seed).trim().length > 0, `config.seeds.${name}`, "não pode ser vazia");
  }

  assertPositiveInteger(config.world.columns, "config.world.columns");
  assertPositiveInteger(config.world.rows, "config.world.rows");
  assertPositiveInteger(config.world.tileSizePx, "config.world.tileSizePx");
  assert(config.world.columns >= 3, "config.world.columns", "deve comportar uma borda de água");
  assert(config.world.rows >= 3, "config.world.rows", "deve comportar uma borda de água");

  const terrain = config.world.terrain;
  assertPositiveNumber(terrain.noiseScale, "config.world.terrain.noiseScale");
  assertPositiveInteger(terrain.octaves, "config.world.terrain.octaves");
  assertFiniteNumber(terrain.persistence, "config.world.terrain.persistence", { min: Number.EPSILON, max: 1 });
  assert(terrain.lacunarity > 1, "config.world.terrain.lacunarity", "deve ser maior que um");
  assertFiniteNumber(terrain.lacunarity, "config.world.terrain.lacunarity");
  assertFiniteNumber(terrain.noiseWeight, "config.world.terrain.noiseWeight", { min: 0, max: 1 });
  const archipelago = terrain.archipelago;
  assertPositiveInteger(
    archipelago.secondaryIslandCount,
    "config.world.terrain.archipelago.secondaryIslandCount",
  );
  assertFiniteNumber(
    archipelago.minLandFraction,
    "config.world.terrain.archipelago.minLandFraction",
    { min: Number.EPSILON, max: 1 },
  );
  assertFiniteNumber(
    archipelago.maxLandFraction,
    "config.world.terrain.archipelago.maxLandFraction",
    { min: Number.EPSILON, max: 1 },
  );
  assert(
    archipelago.minLandFraction <= archipelago.maxLandFraction,
    "config.world.terrain.archipelago.minLandFraction",
    "não pode exceder a fração máxima de terra",
  );
  assertFiniteNumber(
    archipelago.minMainLandFraction,
    "config.world.terrain.archipelago.minMainLandFraction",
    { min: Number.EPSILON, max: 1 },
  );
  assertFiniteNumber(
    archipelago.maxMainLandFraction,
    "config.world.terrain.archipelago.maxMainLandFraction",
    { min: Number.EPSILON, max: 1 },
  );
  assert(
    archipelago.minMainLandFraction <= archipelago.maxMainLandFraction,
    "config.world.terrain.archipelago.minMainLandFraction",
    "não pode exceder a fração máxima da ilha principal",
  );
  assertPositiveInteger(
    archipelago.minSecondaryIslandTiles,
    "config.world.terrain.archipelago.minSecondaryIslandTiles",
  );
  assertFiniteNumber(
    archipelago.satelliteOrbitMinFraction,
    "config.world.terrain.archipelago.satelliteOrbitMinFraction",
    { min: Number.EPSILON, max: 1 },
  );
  assertFiniteNumber(
    archipelago.satelliteOrbitMaxFraction,
    "config.world.terrain.archipelago.satelliteOrbitMaxFraction",
    { min: Number.EPSILON, max: 1 },
  );
  assert(
    archipelago.satelliteOrbitMinFraction <= archipelago.satelliteOrbitMaxFraction,
    "config.world.terrain.archipelago.satelliteOrbitMinFraction",
    "não pode exceder a órbita máxima",
  );
  assertFiniteNumber(
    archipelago.angularJitterFraction,
    "config.world.terrain.archipelago.angularJitterFraction",
    { min: 0, max: 0.49 },
  );
  assert(
    Number.isInteger(archipelago.separationTiles) && archipelago.separationTiles >= 1,
    "config.world.terrain.archipelago.separationTiles",
    "deve ser um inteiro maior ou igual a um",
  );
  assertPositiveInteger(
    archipelago.lakeMinDepthTiles,
    "config.world.terrain.archipelago.lakeMinDepthTiles",
  );
  assertPositiveInteger(
    archipelago.minLakeCount,
    "config.world.terrain.archipelago.minLakeCount",
  );
  assertPositiveInteger(
    archipelago.maxLakeCount,
    "config.world.terrain.archipelago.maxLakeCount",
  );
  assert(
    archipelago.minLakeCount <= archipelago.maxLakeCount,
    "config.world.terrain.archipelago.minLakeCount",
    "não pode exceder a quantidade máxima de lagos",
  );
  assertPositiveInteger(
    archipelago.maxLakeTiles,
    "config.world.terrain.archipelago.maxLakeTiles",
  );
  assert(
    terrain.minLakeTiles <= archipelago.maxLakeTiles,
    "config.world.terrain.minLakeTiles",
    "não pode exceder o tamanho máximo de lago",
  );
  assertPositiveInteger(
    archipelago.maxLayoutAttempts,
    "config.world.terrain.archipelago.maxLayoutAttempts",
  );
  assertPositiveInteger(terrain.minLakeTiles, "config.world.terrain.minLakeTiles");
  assert(
    Number.isInteger(terrain.quantizationDecimals)
      && terrain.quantizationDecimals >= 0
      && terrain.quantizationDecimals <= 12,
    "config.world.terrain.quantizationDecimals",
    "deve ser um inteiro entre 0 e 12",
  );
  assert(typeof terrain.forceWaterBorder === "boolean", "config.world.terrain.forceWaterBorder", "deve ser booleano");

  const productivity = config.world.productivity;
  assertPositiveNumber(productivity.noiseScale, "config.world.productivity.noiseScale");
  assertPositiveInteger(productivity.octaves, "config.world.productivity.octaves");
  assertFiniteNumber(productivity.persistence, "config.world.productivity.persistence", { min: Number.EPSILON, max: 1 });
  assert(productivity.lacunarity > 1, "config.world.productivity.lacunarity", "deve ser maior que um");
  assertFiniteNumber(productivity.lacunarity, "config.world.productivity.lacunarity");
  assertPositiveNumber(productivity.targetTotal, "config.world.productivity.targetTotal");
  assertPositiveInteger(
    productivity.waterProximityRangeTiles,
    "config.world.productivity.waterProximityRangeTiles",
  );
  assertFiniteNumber(
    productivity.waterProximityBonus,
    "config.world.productivity.waterProximityBonus",
    { min: 0, max: 1 },
  );
  assertFiniteNumber(
    productivity.islandSizeBonus,
    "config.world.productivity.islandSizeBonus",
    { min: 0, max: 1 },
  );
  assert(
    Number.isInteger(productivity.quantizationDecimals)
      && productivity.quantizationDecimals >= 0
      && productivity.quantizationDecimals <= 12,
    "config.world.productivity.quantizationDecimals",
    "deve ser um inteiro entre 0 e 12",
  );
  const minimumLandTiles = Math.ceil(
    config.world.columns * config.world.rows * archipelago.minLandFraction,
  );
  const minimumSecondaryLandTiles = archipelago.secondaryIslandCount
    * archipelago.minSecondaryIslandTiles;
  assert(
    minimumSecondaryLandTiles < minimumLandTiles,
    "config.world.terrain.archipelago.minSecondaryIslandTiles",
    "não cabe na fração mínima de terra configurada",
  );
  assert(
    (minimumLandTiles - minimumSecondaryLandTiles) / minimumLandTiles
      >= archipelago.minMainLandFraction,
    "config.world.terrain.archipelago.minMainLandFraction",
    "é incompatível com o tamanho mínimo das ilhas secundárias",
  );
  assert(
    productivity.targetTotal <= minimumLandTiles,
    "config.world.productivity.targetTotal",
    "não pode exceder a quantidade mínima de tiles terrestres",
  );

  assertPositiveInteger(config.time.physicsHz, "config.time.physicsHz");
  assertPositiveInteger(config.time.brainHz, "config.time.brainHz");
  assert(
    config.time.physicsHz % config.time.brainHz === 0,
    "config.time.brainHz",
    "deve dividir exatamente a frequência física",
  );
  assert(Array.isArray(config.time.speedPresets), "config.time.speedPresets", "deve ser uma lista");
  assert(config.time.speedPresets.length > 0, "config.time.speedPresets", "não pode ser vazia");
  assert(
    config.time.speedPresets.filter((preset) => preset === "max").length === 1,
    "config.time.speedPresets",
    "deve conter o modo max exatamente uma vez",
  );
  for (const [index, preset] of config.time.speedPresets.entries()) {
    assert(
      preset === "max" || (Number.isFinite(preset) && preset > 0),
      `config.time.speedPresets.${index}`,
      "deve ser max ou um multiplicador positivo",
    );
  }
  assertPositiveNumber(config.time.maxProcessingBudgetMs, "config.time.maxProcessingBudgetMs");
  assertPositiveNumber(config.time.maxRealDeltaMs, "config.time.maxRealDeltaMs");
  assertPositiveInteger(config.ui.mapPreviewDebounceMs, "config.ui.mapPreviewDebounceMs");

  assertFiniteNumber(config.camera.minZoom, "config.camera.minZoom", { min: 1 });
  assertFiniteNumber(config.camera.maxZoom, "config.camera.maxZoom", { min: config.camera.minZoom });
  assert(config.camera.maxZoom > config.camera.minZoom, "config.camera.maxZoom", "deve ser maior que o zoom mínimo");
  assertFiniteNumber(config.camera.buttonZoomFactor, "config.camera.buttonZoomFactor", { min: 1 });
  assert(config.camera.buttonZoomFactor > 1, "config.camera.buttonZoomFactor", "deve ser maior que um");
  assertPositiveNumber(config.camera.wheelSensitivity, "config.camera.wheelSensitivity");
  assertFiniteNumber(config.camera.dragThresholdCssPx, "config.camera.dragThresholdCssPx", { min: 0 });

  assertPositiveNumber(config.generation.durationSeconds, "config.generation.durationSeconds");
  assert(
    Number.isInteger(config.generation.durationSeconds * config.time.physicsHz),
    "config.generation.durationSeconds",
    "deve corresponder a uma quantidade inteira de ticks",
  );
  assertPositiveInteger(config.population.size, "config.population.size");

  assertPositiveNumber(config.being.maxLife, "config.being.maxLife");
  assertFiniteNumber(config.being.initialLife, "config.being.initialLife", { min: 0, max: config.being.maxLife });
  assertPositiveNumber(config.being.maxEnergy, "config.being.maxEnergy");
  assertFiniteNumber(config.being.initialEnergy, "config.being.initialEnergy", { min: 0, max: config.being.maxEnergy });

  assertPositiveNumber(config.movement.maxSpeedTilesPerSecond, "config.movement.maxSpeedTilesPerSecond");
  assertPositiveNumber(config.movement.maxTurnDegreesPerSecond, "config.movement.maxTurnDegreesPerSecond");
  assertFiniteNumber(config.movement.costCoefficient, "config.movement.costCoefficient", { min: 0 });
  assertPositiveNumber(config.movement.costExponent, "config.movement.costExponent");
  assertFiniteNumber(config.movement.turnCostAtMaxPerSecond, "config.movement.turnCostAtMaxPerSecond", { min: 0 });
  assertFiniteNumber(config.energy.basalMetabolismPerSecond, "config.energy.basalMetabolismPerSecond", { min: 0 });
  assertPositiveNumber(config.water.movementCostMultiplier, "config.water.movementCostMultiplier");
  assertFiniteNumber(config.life.zeroEnergyDamagePerSecond, "config.life.zeroEnergyDamagePerSecond", { min: 0 });

  assertFiniteNumber(config.healing.energyThreshold, "config.healing.energyThreshold", { min: 0, max: config.being.maxEnergy });
  assertPositiveNumber(config.healing.energyPerLife, "config.healing.energyPerLife");
  assertFiniteNumber(config.healing.maxLifePerSecond, "config.healing.maxLifePerSecond", { min: 0 });

  assertPositiveInteger(config.food.initialCount, "config.food.initialCount");
  assertPositiveNumber(config.food.spawnIntervalSeconds, "config.food.spawnIntervalSeconds");
  assert(
    Number.isSafeInteger(config.food.spawnIntervalSeconds * config.time.physicsHz),
    "config.food.spawnIntervalSeconds",
    "deve corresponder a uma quantidade inteira de ticks físicos",
  );
  assertPositiveInteger(config.food.spawnCount, "config.food.spawnCount");
  assertPositiveInteger(config.food.maxCount, "config.food.maxCount");
  assert(config.food.initialCount <= config.food.maxCount, "config.food.initialCount", "não pode exceder o máximo de comidas");
  assertPositiveNumber(config.food.maxConsumptionPerSecond, "config.food.maxConsumptionPerSecond");
  assertPositiveNumber(config.food.minEnergy, "config.food.minEnergy");
  assertPositiveNumber(config.food.maxEnergy, "config.food.maxEnergy");
  assert(config.food.minEnergy <= config.food.maxEnergy, "config.food.minEnergy", "não pode exceder a energia máxima");
  assertFiniteNumber(
    config.food.inactivityTimeoutSeconds,
    "config.food.inactivityTimeoutSeconds",
    { min: 0 },
  );
  assert(
    Number.isSafeInteger(config.food.inactivityTimeoutSeconds * config.time.physicsHz),
    "config.food.inactivityTimeoutSeconds",
    "deve corresponder a uma quantidade inteira de ticks físicos",
  );
  assert(
    Number.isSafeInteger(
      config.food.inactivityTimeoutSeconds * config.time.physicsHz * 2,
    ),
    "config.food.inactivityTimeoutSeconds",
    "deve comportar o acréscimo aleatório de até o mesmo prazo",
  );
  assertPositiveNumber(config.food.eatDistanceTiles, "config.food.eatDistanceTiles");
  assertFiniteNumber(
    config.food.safeEatingDistanceFactor,
    "config.food.safeEatingDistanceFactor",
    { min: Number.EPSILON, max: 1 },
  );
  assertFiniteNumber(
    config.food.feedingStartEnergyThreshold,
    "config.food.feedingStartEnergyThreshold",
    { min: 0, max: config.being.maxEnergy },
  );

  assertPositiveInteger(config.eyes.count, "config.eyes.count");
  assert(
    config.eyes.count <= CONFIG_LIMITS.eyes.maxCount,
    "config.eyes.count",
    `não pode exceder ${CONFIG_LIMITS.eyes.maxCount}`,
  );
  assertFiniteNumber(config.eyes.fieldOfViewDegrees, "config.eyes.fieldOfViewDegrees", { min: Number.EPSILON, max: 360 });
  assertPositiveNumber(config.eyes.rangeTiles, "config.eyes.rangeTiles");

  assert(Array.isArray(config.network.hiddenLayers), "config.network.hiddenLayers", "deve ser uma lista");
  assert(
    config.network.hiddenLayers.length <= CONFIG_LIMITS.network.maxHiddenLayers,
    "config.network.hiddenLayers",
    `deve ter no máximo ${CONFIG_LIMITS.network.maxHiddenLayers} camadas`,
  );
  for (const [index, size] of config.network.hiddenLayers.entries()) {
    assertPositiveInteger(size, `config.network.hiddenLayers.${index}`);
    assert(
      size <= CONFIG_LIMITS.network.maxHiddenLayerSize,
      `config.network.hiddenLayers.${index}`,
      `não pode exceder ${CONFIG_LIMITS.network.maxHiddenLayerSize} neurônios`,
    );
  }
  assert(
    CONFIG_LIMITS.network.activations.includes(config.network.activation),
    "config.network.activation",
    `deve ser uma das ativações: ${CONFIG_LIMITS.network.activations.join(", ")}`,
  );
  assert(config.network.outputCount === 2, "config.network.outputCount", "deve ser exatamente 2");
  assertFiniteNumber(config.network.initialGeneMin, "config.network.initialGeneMin");
  assertFiniteNumber(config.network.initialGeneMax, "config.network.initialGeneMax");
  assertFiniteNumber(config.network.geneMin, "config.network.geneMin");
  assertFiniteNumber(config.network.geneMax, "config.network.geneMax");
  assert(config.network.initialGeneMin < config.network.initialGeneMax, "config.network.initialGeneMin", "deve ser menor que o máximo inicial");
  assert(config.network.geneMin < config.network.geneMax, "config.network.geneMin", "deve ser menor que o máximo do gene");
  assert(config.network.initialGeneMin >= config.network.geneMin, "config.network.initialGeneMin", "deve respeitar o limite mínimo do gene");
  assert(config.network.initialGeneMax <= config.network.geneMax, "config.network.initialGeneMax", "deve respeitar o limite máximo do gene");
  assert(
    Number.isInteger(config.network.quantizationDecimals)
      && config.network.quantizationDecimals >= 0
      && config.network.quantizationDecimals <= 12,
    "config.network.quantizationDecimals",
    "deve ser um inteiro entre 0 e 12",
  );

  const networkLayerSizes = [
    (config.eyes.count * 2) + 6,
    ...config.network.hiddenLayers,
    config.network.outputCount,
  ];
  assert(
    calculateNetworkGeneCount(networkLayerSizes) <= CONFIG_LIMITS.network.maxGeneCount,
    "config.network.hiddenLayers",
    `a topologia não pode exceder ${CONFIG_LIMITS.network.maxGeneCount} genes`,
  );

  assertPositiveInteger(config.genetics.eliteCount, "config.genetics.eliteCount");
  assert(
    config.genetics.eliteCount <= config.population.size,
    "config.genetics.eliteCount",
    "não pode exceder o tamanho da população",
  );
  assertPositiveInteger(config.genetics.tournamentSize, "config.genetics.tournamentSize");
  assert(
    config.genetics.tournamentSize <= config.population.size,
    "config.genetics.tournamentSize",
    "não pode exceder o tamanho da população",
  );
  assertFiniteNumber(config.genetics.uniformCrossoverParentAChance, "config.genetics.uniformCrossoverParentAChance", { min: 0, max: 1 });
  assertFiniteNumber(config.genetics.mutationChancePerGene, "config.genetics.mutationChancePerGene", { min: 0, max: 1 });
  assertFiniteNumber(config.genetics.mutationStdDev, "config.genetics.mutationStdDev", { min: 0 });
}

export function createConfig(overrides = {}) {
  const config = mergeKnown(DEFAULT_VALUES, overrides);
  config.seeds.simulation = String(config.seeds.simulation);
  config.seeds.map = String(config.seeds.map);
  validate(config);

  const networkInputCount = (config.eyes.count * 2) + 6;
  const networkLayerSizes = [
    networkInputCount,
    ...config.network.hiddenLayers,
    config.network.outputCount,
  ];
  config.derived = {
    worldWidthPx: config.world.columns * config.world.tileSizePx,
    worldHeightPx: config.world.rows * config.world.tileSizePx,
    dtSeconds: 1 / config.time.physicsHz,
    generationMaxTicks: config.generation.durationSeconds * config.time.physicsHz,
    foodSpawnIntervalTicks: config.food.spawnIntervalSeconds * config.time.physicsHz,
    foodInactivityTimeoutTicks:
      config.food.inactivityTimeoutSeconds * config.time.physicsHz,
    foodSafeEatingDistanceTiles:
      config.food.eatDistanceTiles * config.food.safeEatingDistanceFactor,
    brainIntervalTicks: config.time.physicsHz / config.time.brainHz,
    networkInputCount,
    networkLayerSizes,
    networkGeneCount: calculateNetworkGeneCount(networkLayerSizes),
  };

  return deepFreeze(config);
}

export const DEFAULT_CONFIG = createConfig();
