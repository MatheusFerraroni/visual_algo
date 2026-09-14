import { DEFAULT_CONFIG } from "../config.js";
import { FoodSystem } from "./food-system.js";
import { GeneticAlgorithm, updateEliteArchive } from "./genetic-algorithm.js";
import { PopulationSystem } from "./population-system.js";
import { SeededRandom } from "./seeded-random.js";
import { WorldMap } from "./world-map.js";
import { NOOP_PERFORMANCE_PROFILER } from "../debug/performance-profiler.js";

function quantize(value, decimals = 6) {
  const factor = 10 ** decimals;
  const result = Math.round(value * factor) / factor;
  return Object.is(result, -0) ? 0 : result;
}

function rankByFitness(individuals) {
  return [...individuals].sort(
    (first, second) => (second.fitness - first.fitness) || (first.id - second.id),
  );
}

export function createBeingPolicySnapshot(config) {
  if (!config || !Object.isFrozen(config)
    || !config.movement || !config.energy || !config.water
    || !config.life || !config.healing) {
    throw new TypeError("A política dos seres exige uma configuração validada e imutável.");
  }
  return Object.freeze({
    movement: config.movement,
    energy: config.energy,
    water: config.water,
    life: config.life,
    healing: config.healing,
  });
}

export function createGenerationFitnessMetrics(individuals, eliteArchive) {
  if (!Array.isArray(individuals) || individuals.length === 0) {
    throw new TypeError("As métricas evolutivas exigem uma população não vazia.");
  }
  if (!Array.isArray(eliteArchive) || eliteArchive.length === 0) {
    throw new TypeError("As métricas evolutivas exigem um arquivo global não vazio.");
  }
  for (const [index, individual] of individuals.entries()) {
    if (!individual || !Number.isSafeInteger(individual.id) || individual.id <= 0
      || !Number.isFinite(individual.fitness)) {
      throw new TypeError(`O indivíduo ${index} é inválido para as métricas evolutivas.`);
    }
  }
  for (const [index, elite] of eliteArchive.entries()) {
    if (!elite || !Number.isFinite(elite.fitness)) {
      throw new TypeError(`A elite global ${index} é inválida para as métricas evolutivas.`);
    }
  }

  const ranked = rankByFitness(individuals);
  const topTenPercentCount = Math.max(1, Math.ceil(ranked.length * 0.1));
  const topTenPercentMeanFitness = quantize(
    ranked.slice(0, topTenPercentCount)
      .reduce((total, individual) => total + individual.fitness, 0)
      / topTenPercentCount,
  );
  const globalTopKMeanFitness = quantize(
    eliteArchive.reduce((total, elite) => total + elite.fitness, 0)
      / eliteArchive.length,
  );

  return Object.freeze({
    topTenPercentCount,
    topTenPercentMeanFitness,
    globalTopKCount: eliteArchive.length,
    globalTopKMeanFitness,
  });
}

function getLockedConfig(config) {
  const { food } = config;
  return {
    seeds: config.seeds,
    world: config.world,
    time: config.time,
    ui: config.ui,
    camera: config.camera,
    being: config.being,
    movement: {
      maxSpeedTilesPerSecond: config.movement.maxSpeedTilesPerSecond,
      maxTurnDegreesPerSecond: config.movement.maxTurnDegreesPerSecond,
    },
    food: {
      maxConsumptionPerSecond: food.maxConsumptionPerSecond,
      eatDistanceTiles: food.eatDistanceTiles,
      safeEatingDistanceFactor: food.safeEatingDistanceFactor,
      feedingStartEnergyThreshold: food.feedingStartEnergyThreshold,
    },
    eyes: config.eyes,
    network: config.network,
  };
}

function assertRuntimeCompatible(currentConfig, nextConfig) {
  if (!nextConfig || typeof nextConfig !== "object"
    || !Object.isFrozen(nextConfig)
    || !nextConfig.derived) {
    throw new TypeError("A configuração dinâmica deve ter sido validada por createConfig().");
  }
  if (JSON.stringify(getLockedConfig(currentConfig))
    !== JSON.stringify(getLockedConfig(nextConfig))) {
    throw new RangeError(
      "A execução aceita apenas população, política de comida, custos e sobrevivência, limite da próxima geração e genética.",
    );
  }
}

export class Simulation {
  #config;
  #profiler;
  #seeds;
  #rootRandom;
  #worldMap;
  #foodSystem;
  #populationSystem;
  #tick = 0;
  #totalTicks = 0;
  #generation = 1;
  #completedGenerations = 0;
  #generationHistory = Object.freeze([]);
  #bestEver = null;
  #eliteArchive = Object.freeze([]);
  #activeGenerationMaxTicks = 0;
  #activeBeingPolicy = null;
  #generationTimelineSamples = Object.freeze([]);
  #currentGenerationTimeline = null;
  #lastTimelineCounters = null;
  #snapshot = null;

  constructor(config = DEFAULT_CONFIG, { profiler = NOOP_PERFORMANCE_PROFILER } = {}) {
    this.#config = config;
    this.#profiler = profiler;
    this.#seeds = Object.freeze({
      simulation: config.seeds.simulation,
      map: config.seeds.map,
    });
    this.#worldMap = WorldMap.generate(config.world, config.seeds.map, { profiler });
    this.reset();
  }

  reset() {
    this.#rootRandom = SeededRandom.fromSeed(this.#config.seeds.simulation);
    this.#tick = 0;
    this.#totalTicks = 0;
    this.#generation = 1;
    this.#completedGenerations = 0;
    this.#generationHistory = Object.freeze([]);
    this.#bestEver = null;
    this.#eliteArchive = Object.freeze([]);
    this.#initializeGeneration(null, "execution");
    this.#snapshot = null;
  }

  #initializeGeneration(initialGenomes = null, stageGroup = "execution") {
    const stageId = stageGroup === "execution"
      ? "execution.generation-initialize"
      : "evolution.next-systems";
    this.#profiler.measure(stageId, () => {
      const systems = this.#createGenerationSystems(
        this.#generation,
        initialGenomes,
        stageGroup,
      );
      this.#foodSystem = systems.foodSystem;
      this.#populationSystem = systems.populationSystem;
      this.#activeGenerationMaxTicks = this.#config.derived.generationMaxTicks;
      this.#activeBeingPolicy = createBeingPolicySnapshot(this.#config);
      this.#startGenerationTimeline();
    });
  }

  #createGenerationSystems(generation, initialGenomes, stageGroup) {
    const foodStage = stageGroup === "execution"
      ? "execution.food-initialize"
      : "evolution.next-food";
    const populationStage = stageGroup === "execution"
      ? "execution.population-initialize"
      : "evolution.next-population";
    const foodSystem = this.#profiler.measure(foodStage, () => new FoodSystem({
      mapSnapshot: this.#worldMap.getSnapshot(),
      config: this.#config.food,
      spawnIntervalTicks: this.#config.derived.foodSpawnIntervalTicks,
      inactivityTimeoutTicks: this.#config.derived.foodInactivityTimeoutTicks,
      initialRandom: SeededRandom
        .fromSeed(this.#config.seeds.map)
        .fork(`generation:${generation}:initial-food`),
      spawnRandom: this.#rootRandom.fork(
        `generation:${generation}:food-spawn`,
      ),
      relocationRandom: this.#rootRandom.fork(
        `generation:${generation}:food-relocation`,
      ),
      initialInactivityRandom: SeededRandom
        .fromSeed(this.#config.seeds.map)
        .fork(`generation:${generation}:initial-food-inactivity`),
      spawnInactivityRandom: this.#rootRandom.fork(
        `generation:${generation}:food-spawn-inactivity`,
      ),
      relocationInactivityRandom: this.#rootRandom.fork(
        `generation:${generation}:food-relocation-inactivity`,
      ),
      profiler: this.#profiler,
    }));
    const populationSystem = this.#profiler.measure(
      populationStage,
      () => new PopulationSystem({
        worldMap: this.#worldMap,
        config: this.#config,
        generation,
        mapSeed: this.#config.seeds.map,
        simulationSeed: this.#config.seeds.simulation,
        initialFoods: foodSystem.getSnapshot(),
        initialGenomes,
        profiler: this.#profiler,
        stageGroup,
      }),
    );
    return { foodSystem, populationSystem };
  }

  tick() {
    return this.#profiler.measure("simulation.tick", () => {
      const completedTick = this.#tick + 1;
      this.#profiler.measure(
        "food.process-tick",
        () => this.#foodSystem.processTick(completedTick),
      );
      this.#profiler.measure(
        "population.process-tick",
        () => this.#populationSystem.processTick(completedTick, this.#foodSystem),
      );
      this.#tick = completedTick;
      this.#totalTicks += 1;

      const completionReason = this.#profiler.measure("simulation.summary", () => {
        const populationSummary = this.#populationSystem.getSummary();
        if (populationSummary.aliveCount === 0) {
          return "extinction";
        }
        return this.#tick >= this.#activeGenerationMaxTicks ? "time-limit" : null;
      });
      if (this.#tick % this.#config.time.physicsHz === 0 || completionReason !== null) {
        this.#profiler.measure("simulation.timeline", () => this.#recordGenerationSample());
      }
      if (completionReason !== null) {
        this.#profiler.measure(
          "evolution.transition",
          () => this.#advanceGeneration(completionReason),
        );
      }
      this.#snapshot = null;
    });
  }

  createRandomStream(label) {
    return this.#rootRandom.fork(label);
  }

  applyRuntimeConfig(config) {
    assertRuntimeCompatible(this.#config, config);
    const currentPopulationSize = this.#populationSystem.getSummary().total;
    const nextPopulationSize = config.population.size;
    const currentFoodPolicy = this.#foodSystem.getSpawnPolicySnapshot();
    const currentFoodMaxCount = currentFoodPolicy.maxCount;
    const currentBeingPolicy = this.#activeBeingPolicy;
    const nextBeingPolicy = createBeingPolicySnapshot(config);
    if (nextPopulationSize > this.#worldMap.getMainIslandTiles().length) {
      throw new RangeError("A ilha principal não comporta a população desejada.");
    }
    if (config.genetics.eliteCount > currentPopulationSize) {
      throw new RangeError("O Top K deve caber também na população atual.");
    }
    if (config.genetics.tournamentSize > currentPopulationSize) {
      throw new RangeError("O torneio deve caber também na população atual.");
    }

    const spawnPolicy = this.#foodSystem.updateSpawnPolicy({
      spawnCount: config.food.spawnCount,
      spawnIntervalTicks: config.derived.foodSpawnIntervalTicks,
    });
    this.#config = config;
    this.#snapshot = null;
    return Object.freeze({
      generation: this.#generation,
      tick: this.#tick,
      currentPopulationSize,
      nextPopulationSize,
      populationChangePending: currentPopulationSize !== nextPopulationSize,
      currentGenerationDurationSeconds:
        this.#activeGenerationMaxTicks / this.#config.time.physicsHz,
      nextGenerationDurationSeconds: config.generation.durationSeconds,
      generationDurationChangePending:
        this.#activeGenerationMaxTicks !== config.derived.generationMaxTicks,
      currentFoodMaxCount,
      nextFoodMaxCount: config.food.maxCount,
      foodMaxChangePending: currentFoodMaxCount !== config.food.maxCount,
      currentInitialFoodCount: currentFoodPolicy.initialCount,
      nextInitialFoodCount: config.food.initialCount,
      initialFoodChangePending:
        currentFoodPolicy.initialCount !== config.food.initialCount,
      currentFoodEnergyRange: Object.freeze({
        minEnergy: currentFoodPolicy.minEnergy,
        maxEnergy: currentFoodPolicy.maxEnergy,
      }),
      nextFoodEnergyRange: Object.freeze({
        minEnergy: config.food.minEnergy,
        maxEnergy: config.food.maxEnergy,
      }),
      foodEnergyChangePending:
        currentFoodPolicy.minEnergy !== config.food.minEnergy
        || currentFoodPolicy.maxEnergy !== config.food.maxEnergy,
      currentFoodInactivityTimeoutSeconds:
        currentFoodPolicy.inactivityTimeoutTicks / config.time.physicsHz,
      nextFoodInactivityTimeoutSeconds: config.food.inactivityTimeoutSeconds,
      foodInactivityChangePending:
        currentFoodPolicy.inactivityTimeoutTicks
        !== config.derived.foodInactivityTimeoutTicks,
      currentBeingPolicy,
      nextBeingPolicy,
      beingPolicyChangePending:
        JSON.stringify(currentBeingPolicy) !== JSON.stringify(nextBeingPolicy),
      spawnPolicy,
    });
  }

  getBeingGenome(beingId) {
    return this.#populationSystem.getGenome(beingId);
  }

  getEliteArchive() {
    return this.#eliteArchive;
  }

  getSnapshot() {
    if (this.#snapshot === null) {
      this.#snapshot = this.#profiler.measure("simulation.snapshot-build", () => Object.freeze({
          seeds: this.#seeds,
          tick: this.#tick,
          totalTicks: this.#totalTicks,
          generation: this.#generation,
          simulatedTimeSeconds: this.#tick / this.#config.time.physicsHz,
          totalSimulatedTimeSeconds: this.#totalTicks / this.#config.time.physicsHz,
          completedGenerations: this.#completedGenerations,
          generationHistory: this.#generationHistory,
          bestEver: this.#bestEver,
          currentGenerationTimeline: this.#currentGenerationTimeline,
          beingPolicy: this.#activeBeingPolicy,
          foodPolicy: this.#foodSystem.getSpawnPolicySnapshot(),
          map: this.#worldMap.getSnapshot(),
          foods: this.#foodSystem.getSnapshot(),
          beings: this.#populationSystem.getSnapshot(),
          neuralInputSchema: this.#populationSystem.getInputSchema(),
          population: this.#populationSystem.getSummary(),
        }));
    }
    return this.#snapshot;
  }

  #advanceGeneration(completionReason) {
    const summary = this.#populationSystem.getSummary();
    const completedGeneration = this.#generation;
    const nextGeneration = completedGeneration + 1;
    if (!Number.isSafeInteger(nextGeneration)) {
      throw new RangeError("A contagem de gerações excedeu o limite inteiro seguro.");
    }
    const candidates = this.#profiler.measure(
      "evolution.candidates",
      () => this.#populationSystem.getEvolutionCandidates(),
    );
    const eliteArchive = this.#profiler.measure("evolution.elite-archive", () => updateEliteArchive({
      archive: this.#eliteArchive,
      individuals: candidates,
      generation: completedGeneration,
      capacity: this.#config.genetics.eliteCount,
      geneMin: this.#config.network.geneMin,
      geneMax: this.#config.network.geneMax,
    }));
    const fitnessMetrics = this.#profiler.measure(
      "evolution.metrics",
      () => createGenerationFitnessMetrics(candidates, eliteArchive),
    );
    const record = Object.freeze({
      generation: completedGeneration,
      completionReason,
      ticks: this.#tick,
      simulatedTimeSeconds: this.#tick / this.#config.time.physicsHz,
      configuredDurationSeconds:
        this.#activeGenerationMaxTicks / this.#config.time.physicsHz,
      survivorCount: summary.aliveCount,
      bestBeingId: summary.bestBeingId,
      bestFitness: summary.bestFitness,
      meanFitness: summary.meanFitness,
      ...fitnessMetrics,
      timeline: this.#currentGenerationTimeline,
    });
    const evolved = this.#profiler.measure("evolution.reproduction", () => GeneticAlgorithm.createNextGeneration({
      individuals: candidates,
      eliteCandidates: eliteArchive,
      generation: nextGeneration,
      simulationSeed: this.#config.seeds.simulation,
      genetics: this.#config.genetics,
      geneMin: this.#config.network.geneMin,
      geneMax: this.#config.network.geneMax,
      quantizationDecimals: this.#config.network.quantizationDecimals,
      targetPopulationSize: this.#config.population.size,
      profiler: this.#profiler,
    }));
    const systems = this.#profiler.measure(
      "evolution.next-systems",
      () => this.#createGenerationSystems(
        nextGeneration,
        evolved.map((individual) => individual.genome),
        "evolution",
      ),
    );

    this.#profiler.measure("evolution.history-timeline", () => {
      this.#completedGenerations += 1;
      this.#generationHistory = Object.freeze([
        ...this.#generationHistory,
        record,
      ]);
      this.#eliteArchive = eliteArchive;
      if (this.#bestEver === null || record.bestFitness > this.#bestEver.fitness) {
        this.#bestEver = Object.freeze({
          generation: completedGeneration,
          beingId: record.bestBeingId,
          fitness: record.bestFitness,
        });
      }
      this.#generation = nextGeneration;
      this.#tick = 0;
      this.#foodSystem = systems.foodSystem;
      this.#populationSystem = systems.populationSystem;
      this.#activeGenerationMaxTicks = this.#config.derived.generationMaxTicks;
      this.#activeBeingPolicy = createBeingPolicySnapshot(this.#config);
      this.#startGenerationTimeline();
    });
  }

  #startGenerationTimeline() {
    const foodMetrics = this.#foodSystem.getMetricsSnapshot();
    const populationSummary = this.#populationSystem.getSummary();
    this.#generationTimelineSamples = Object.freeze([]);
    this.#lastTimelineCounters = {
      aliveCount: populationSummary.aliveCount,
      totalCreated: foodMetrics.totalCreated,
      totalDepleted: foodMetrics.totalDepleted,
    };
    this.#recordGenerationSample({ initial: true });
  }

  #recordGenerationSample({ initial = false } = {}) {
    const foodMetrics = this.#foodSystem.getMetricsSnapshot();
    const populationSummary = this.#populationSystem.getSummary();
    const previous = this.#lastTimelineCounters;
    const sample = Object.freeze({
      tick: this.#tick,
      simulatedTimeSeconds: this.#tick / this.#config.time.physicsHz,
      aliveBeingCount: populationSummary.aliveCount,
      availableFoodCount: foodMetrics.availableCount,
      totalFoodEnergy: foodMetrics.totalRemainingEnergy,
      meanAliveEnergy: populationSummary.meanAliveEnergy,
      meanAliveLife: populationSummary.meanAliveLife,
      bestFitness: populationSummary.bestFitness,
      meanFitness: populationSummary.meanFitness,
      meanAliveAbsoluteSpeed: populationSummary.meanAliveAbsoluteSpeed,
      aliveInWaterFraction: populationSummary.aliveInWaterFraction,
      deathsInInterval: initial
        ? 0
        : previous.aliveCount - populationSummary.aliveCount,
      cumulativeDeaths: populationSummary.cumulativeDeaths,
      foodsCreatedInInterval: initial
        ? 0
        : foodMetrics.totalCreated - previous.totalCreated,
      foodsConsumedInInterval: initial
        ? 0
        : foodMetrics.totalDepleted - previous.totalDepleted,
    });
    this.#lastTimelineCounters = {
      aliveCount: populationSummary.aliveCount,
      totalCreated: foodMetrics.totalCreated,
      totalDepleted: foodMetrics.totalDepleted,
    };
    this.#generationTimelineSamples = Object.freeze([
      ...this.#generationTimelineSamples,
      sample,
    ]);
    this.#currentGenerationTimeline = Object.freeze({
      generation: this.#generation,
      configuredDurationSeconds:
        this.#activeGenerationMaxTicks / this.#config.time.physicsHz,
      sampleIntervalTicks: this.#config.time.physicsHz,
      samples: this.#generationTimelineSamples,
    });
  }
}
