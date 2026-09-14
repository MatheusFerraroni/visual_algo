import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createConfig, DEFAULT_CONFIG } from "../src/config.js";
import { EyeSensor } from "../src/core/eye-sensor.js";
import { findFoodWithinDistance } from "../src/core/food-proximity.js";
import {
  createBeingPolicySnapshot,
  createGenerationFitnessMetrics,
  Simulation,
} from "../src/core/simulation.js";
import { SimulationClock } from "../src/core/simulation-clock.js";

function runTicks(simulation, total) {
  for (let tick = 0; tick < total; tick += 1) {
    simulation.tick();
  }
}

function createRuntimeConfig({
  populationSize = 4,
  initialFoodCount = 1,
  spawnCount = 1,
  spawnIntervalSeconds = 3,
  maxFoodCount = 300,
  minFoodEnergy = 10,
  maxFoodEnergy = 50,
  foodInactivityTimeoutSeconds = 30,
  eliteCount = 1,
  tournamentSize = 1,
  uniformCrossoverParentAChance = 0.5,
  mutationChancePerGene = 0,
  mutationStdDev = 0.15,
  durationSeconds = 4,
  simulationSeed = "evo-1",
  movementCostCoefficient = 0,
  movementCostExponent = 2,
  turnCostAtMaxPerSecond = 0,
  basalMetabolismPerSecond = 0,
  waterMovementCostMultiplier = 3,
  zeroEnergyDamagePerSecond = 20,
  healingEnergyThreshold = 80,
  healingEnergyPerLife = 2,
  healingMaxLifePerSecond = 1,
} = {}) {
  return createConfig({
    seeds: { simulation: simulationSeed },
    generation: { durationSeconds },
    population: { size: populationSize },
    being: { initialEnergy: 100 },
    movement: {
      costCoefficient: movementCostCoefficient,
      costExponent: movementCostExponent,
      turnCostAtMaxPerSecond,
    },
    energy: { basalMetabolismPerSecond },
    water: { movementCostMultiplier: waterMovementCostMultiplier },
    life: { zeroEnergyDamagePerSecond },
    healing: {
      energyThreshold: healingEnergyThreshold,
      energyPerLife: healingEnergyPerLife,
      maxLifePerSecond: healingMaxLifePerSecond,
    },
    food: {
      initialCount: initialFoodCount,
      spawnCount,
      spawnIntervalSeconds,
      maxCount: maxFoodCount,
      minEnergy: minFoodEnergy,
      maxEnergy: maxFoodEnergy,
      inactivityTimeoutSeconds: foodInactivityTimeoutSeconds,
      feedingStartEnergyThreshold: 0,
    },
    genetics: {
      eliteCount,
      tournamentSize,
      uniformCrossoverParentAChance,
      mutationChancePerGene,
      mutationStdDev,
    },
  });
}

function projectFoodVector(foods) {
  return foods.map(({ id, column, row, remainingEnergy }) => ({
    id,
    column,
    row,
    remainingEnergy,
  }));
}

test("métricas evolutivas resumem Top 10% e arquivo Top K", () => {
  const individuals = Array.from({ length: 11 }, (_, index) => ({
    id: 11 - index,
    fitness: index,
  }));
  const metrics = createGenerationFitnessMetrics(individuals, [
    { fitness: 20 },
    { fitness: 10 },
    { fitness: 5 },
  ]);

  assert.deepEqual(metrics, {
    topTenPercentCount: 2,
    topTenPercentMeanFitness: 9.5,
    globalTopKCount: 3,
    globalTopKMeanFitness: 11.666667,
  });
  assert(Object.isFrozen(metrics));
  assert.throws(() => createGenerationFitnessMetrics([], [{ fitness: 1 }]), /população/);
  assert.throws(() => createGenerationFitnessMetrics(individuals, []), /arquivo global/);
});

test("snapshot inicial é serializável, imutável e usa a seed configurada", () => {
  const simulation = new Simulation(DEFAULT_CONFIG);
  const snapshot = simulation.getSnapshot();

  assert.deepEqual(snapshot.seeds, { simulation: "evo-1", map: "evo-1" });
  assert.equal(snapshot.tick, 0);
  assert.equal(snapshot.totalTicks, 0);
  assert.equal(snapshot.generation, 1);
  assert.equal(snapshot.simulatedTimeSeconds, 0);
  assert.equal(snapshot.totalSimulatedTimeSeconds, 0);
  assert.equal(snapshot.completedGenerations, 0);
  assert.deepEqual(snapshot.generationHistory, []);
  assert.equal(snapshot.bestEver, null);
  assert.equal(snapshot.map.seed, "evo-1");
  assert.equal(snapshot.foods.length, 20);
  assert.deepEqual(snapshot.beingPolicy, createBeingPolicySnapshot(DEFAULT_CONFIG));
  assert.deepEqual(snapshot.foodPolicy, {
    initialCount: 20,
    spawnCount: 3,
    spawnIntervalTicks: 90,
    nextSpawnTick: 90,
    maxCount: 300,
    minEnergy: 10,
    maxEnergy: 50,
    inactivityTimeoutTicks: 900,
  });
  assert.equal(snapshot.beings.length, 40);
  assert.deepEqual(snapshot.population, {
    total: 40,
    aliveCount: 40,
    cumulativeDeaths: 0,
    bestBeingId: 1,
    bestAliveBeingId: 1,
    bestFitness: 0,
    meanFitness: 0,
    meanAliveEnergy: 60,
    meanAliveLife: 100,
    meanAliveAbsoluteSpeed: 0,
    aliveInWaterCount: 0,
    aliveInWaterFraction: 0,
  });
  assert.deepEqual(snapshot.currentGenerationTimeline, {
    generation: 1,
    configuredDurationSeconds: 120,
    sampleIntervalTicks: 30,
    samples: [{
      tick: 0,
      simulatedTimeSeconds: 0,
      aliveBeingCount: 40,
      availableFoodCount: 20,
      totalFoodEnergy: 836.01948,
      meanAliveEnergy: 60,
      meanAliveLife: 100,
      bestFitness: 0,
      meanFitness: 0,
      meanAliveAbsoluteSpeed: 0,
      aliveInWaterFraction: 0,
      deathsInInterval: 0,
      cumulativeDeaths: 0,
      foodsCreatedInInterval: 0,
      foodsConsumedInInterval: 0,
    }],
  });
  assert(Object.isFrozen(snapshot));
  assert(Object.isFrozen(snapshot.seeds));
  assert(Object.isFrozen(snapshot.map));
  assert(Object.isFrozen(snapshot.foods));
  assert(Object.isFrozen(snapshot.foodPolicy));
  assert(Object.isFrozen(snapshot.beingPolicy));
  assert(Object.isFrozen(snapshot.beingPolicy.movement));
  assert(Object.isFrozen(snapshot.beings));
  assert(Object.isFrozen(snapshot.population));
  assert(Object.isFrozen(snapshot.neuralInputSchema));
  assert(snapshot.neuralInputSchema.every(Object.isFrozen));
  assert(Object.isFrozen(snapshot.generationHistory));
  assert(Object.isFrozen(snapshot.currentGenerationTimeline));
  assert(Object.isFrozen(snapshot.currentGenerationTimeline.samples));
  assert(snapshot.currentGenerationTimeline.samples.every(Object.isFrozen));
  assert(snapshot.foods.every(Object.isFrozen));
  assert.doesNotThrow(() => JSON.stringify(snapshot));
  assert.throws(() => { snapshot.tick = 9; }, TypeError);
});

test("tempos da geração e total derivam de ticks inteiros sem acumular dt", () => {
  const simulation = new Simulation(createConfig({
    movement: { costCoefficient: 0, turnCostAtMaxPerSecond: 0 },
    energy: { basalMetabolismPerSecond: 0 },
  }));
  runTicks(simulation, 3_599);
  assert.equal(simulation.getSnapshot().simulatedTimeSeconds, 3_599 / 30);
  simulation.tick();
  assert.equal(simulation.getSnapshot().simulatedTimeSeconds, 0);
  assert.equal(simulation.getSnapshot().totalSimulatedTimeSeconds, 120);
});

test("agrupar os mesmos N ticks de maneiras diferentes produz o mesmo estado", () => {
  const first = new Simulation(DEFAULT_CONFIG);
  const second = new Simulation(DEFAULT_CONFIG);

  runTicks(first, 1_337);
  for (const batch of [13, 21, 300, 1_003]) {
    runTicks(second, batch);
  }

  assert.deepEqual(first.getSnapshot(), second.getSnapshot());
});

test("observar um snapshot não altera a simulação", () => {
  const simulation = new Simulation(DEFAULT_CONFIG);
  runTicks(simulation, 90);
  const before = simulation.getSnapshot();

  JSON.stringify(before);
  Object.values(before).join("|");

  assert.deepEqual(simulation.getSnapshot(), before);
});

test("reset restaura tick e geração e reutiliza seeds e mapa configurados", () => {
  const simulation = new Simulation(DEFAULT_CONFIG);
  const map = simulation.getSnapshot().map;
  const foods = simulation.getSnapshot().foods;
  const beings = simulation.getSnapshot().beings;
  runTicks(simulation, 12);
  simulation.reset();
  const snapshot = simulation.getSnapshot();
  assert.equal(snapshot.tick, 0);
  assert.equal(snapshot.totalTicks, 0);
  assert.equal(snapshot.generation, 1);
  assert.equal(snapshot.simulatedTimeSeconds, 0);
  assert.equal(snapshot.completedGenerations, 0);
  assert.deepEqual(snapshot.generationHistory, []);
  assert.equal(snapshot.bestEver, null);
  assert.strictEqual(snapshot.map, map);
  assert.deepEqual(snapshot.foods, foods);
  assert.deepEqual(snapshot.beings, beings);
  assert.deepEqual(snapshot.seeds, DEFAULT_CONFIG.seeds);
});

test("seed da simulação e seed do mapa controlam domínios independentes", () => {
  const base = new Simulation(DEFAULT_CONFIG);
  const changedSimulation = new Simulation(createConfig({
    seeds: { simulation: "sim-2" },
  }));
  const changedMap = new Simulation(createConfig({
    seeds: { map: "map-2" },
  }));

  assert.equal(
    JSON.stringify(base.getSnapshot().map),
    JSON.stringify(changedSimulation.getSnapshot().map),
  );
  assert.notEqual(
    JSON.stringify(base.getSnapshot().map),
    JSON.stringify(changedMap.getSnapshot().map),
  );
  assert.deepEqual(
    base.getSnapshot().foods,
    changedSimulation.getSnapshot().foods,
  );
  assert.notDeepEqual(
    base.getSnapshot().foods,
    changedMap.getSnapshot().foods,
  );
  assert.deepEqual(
    base.getSnapshot().beings.map(({ x, y }) => ({ x, y })),
    changedSimulation.getSnapshot().beings.map(({ x, y }) => ({ x, y })),
  );
  assert.notDeepEqual(
    base.getSnapshot().beings.map(({ directionRadians }) => directionRadians),
    changedSimulation.getSnapshot().beings.map(({ directionRadians }) => directionRadians),
  );
  assert.notDeepEqual(
    base.getBeingGenome(1),
    changedSimulation.getBeingGenome(1),
  );
  assert.notDeepEqual(
    base.getSnapshot().beings.map(({ x, y }) => ({ x, y })),
    changedMap.getSnapshot().beings.map(({ x, y }) => ({ x, y })),
  );
  assert.deepEqual(
    base.getSnapshot().beings.map(({ directionRadians }) => directionRadians),
    changedMap.getSnapshot().beings.map(({ directionRadians }) => directionRadians),
  );
  assert.deepEqual(base.getBeingGenome(1), changedMap.getBeingGenome(1));

  runTicks(base, DEFAULT_CONFIG.derived.foodSpawnIntervalTicks);
  runTicks(changedSimulation, DEFAULT_CONFIG.derived.foodSpawnIntervalTicks);
  assert.notDeepEqual(
    base.getSnapshot().foods.slice(DEFAULT_CONFIG.food.initialCount),
    changedSimulation.getSnapshot().foods.slice(DEFAULT_CONFIG.food.initialCount),
  );
  const baseEvents = base.createRandomStream("events");
  const changedMapEvents = changedMap.createRandomStream("events");
  assert.deepEqual(
    Array.from({ length: 8 }, () => baseEvents.nextFloat()),
    Array.from({ length: 8 }, () => changedMapEvents.nextFloat()),
  );
});

test("comidas iniciais e eventos mantêm vetor dourado e calendário exato", () => {
  const simulation = new Simulation(DEFAULT_CONFIG);
  const initialFoods = simulation.getSnapshot().foods;

  assert.equal(
    createHash("sha256").update(JSON.stringify(projectFoodVector(initialFoods))).digest("hex"),
    "81a06fdf9126f090be447114e93c68dc6b54d975a06f9859d75aff2982f9a7dd",
  );
  assert.deepEqual(projectFoodVector(initialFoods.slice(0, 3)), [
    { id: 1, column: 58, row: 93, remainingEnergy: 43.37944 },
    { id: 2, column: 19, row: 62, remainingEnergy: 46.18356 },
    { id: 3, column: 94, row: 85, remainingEnergy: 37.11424 },
  ]);
  assert(initialFoods.every(({ inactivityTimeoutTicks }) => (
    inactivityTimeoutTicks >= 900 && inactivityTimeoutTicks <= 1_800
  )));
  assert(new Set(initialFoods.map(({ inactivityTimeoutTicks }) => inactivityTimeoutTicks)).size > 1);
  assert.deepEqual(
    initialFoods.slice(0, 3).map((food) => ({
      initialEnergy: food.initialEnergy,
      createdTick: food.createdTick,
      lastConsumedTick: food.lastConsumedTick,
      inactivityTimeoutTicks: food.inactivityTimeoutTicks,
      inactivityRemainingTicks: food.inactivityRemainingTicks,
    })),
    [
      { initialEnergy: 43.37944, createdTick: 0, lastConsumedTick: 0, inactivityTimeoutTicks: 1032, inactivityRemainingTicks: 1032 },
      { initialEnergy: 46.18356, createdTick: 0, lastConsumedTick: 0, inactivityTimeoutTicks: 1680, inactivityRemainingTicks: 1680 },
      { initialEnergy: 37.11424, createdTick: 0, lastConsumedTick: 0, inactivityTimeoutTicks: 1350, inactivityRemainingTicks: 1350 },
    ],
  );

  runTicks(simulation, 89);
  assert.deepEqual(
    projectFoodVector(simulation.getSnapshot().foods),
    projectFoodVector(initialFoods),
  );
  assert.equal(simulation.getSnapshot().foods[0].inactivityRemainingTicks, 943);
  simulation.tick();
  assert.equal(simulation.getSnapshot().foods.length, 23);
  assert.deepEqual(projectFoodVector(simulation.getSnapshot().foods.slice(20)), [
    { id: 21, column: 37, row: 9, remainingEnergy: 46.8858 },
    { id: 22, column: 75, row: 23, remainingEnergy: 50 },
    { id: 23, column: 36, row: 63, remainingEnergy: 35.85188 },
  ]);
});

test("configuração de comida controla leva, intervalo, lote e limite", () => {
  const config = createConfig({
    food: {
      initialCount: 2,
      spawnIntervalSeconds: 1,
      spawnCount: 4,
      maxCount: 7,
    },
  });
  const simulation = new Simulation(config);

  assert.equal(simulation.getSnapshot().foods.length, 2);
  runTicks(simulation, 30);
  assert.equal(simulation.getSnapshot().foods.length, 6);
  runTicks(simulation, 30);
  assert.equal(simulation.getSnapshot().foods.length, 7);
  assert.deepEqual(
    simulation.getSnapshot().foods.map((food) => food.id),
    [1, 2, 3, 4, 5, 6, 7],
  );
});

test("comidas ocupam tiles terrestres únicos e refletem a produtividade", () => {
  const snapshot = new Simulation(DEFAULT_CONFIG).getSnapshot();
  const positions = new Set();

  for (const food of snapshot.foods) {
    const index = (food.row * snapshot.map.columns) + food.column;
    const tile = snapshot.map.tiles[index];
    const expectedEnergy = Math.round(
      (DEFAULT_CONFIG.food.minEnergy
        + ((DEFAULT_CONFIG.food.maxEnergy - DEFAULT_CONFIG.food.minEnergy)
          * tile.productivity)) * 1_000_000,
    ) / 1_000_000;

    assert.equal(tile.type, "land");
    assert(!positions.has(index));
    assert.equal(food.initialEnergy, expectedEnergy);
    assert.equal(food.remainingEnergy, expectedEnergy);
    positions.add(index);
  }
});

test("pausa impede que o relógio alcance o evento de comida", () => {
  const simulation = new Simulation(DEFAULT_CONFIG);
  const clock = new SimulationClock(DEFAULT_CONFIG.time);
  clock.resume();

  for (let frame = 0; frame < 29; frame += 1) {
    clock.advance(100, () => simulation.tick());
  }
  assert.equal(simulation.getSnapshot().tick, 87);
  clock.pause();
  clock.advance(10_000, () => simulation.tick());
  assert.equal(simulation.getSnapshot().tick, 87);
  assert.equal(simulation.getSnapshot().foods.length, 20);

  clock.resume();
  clock.advance(100, () => simulation.tick());
  assert.equal(simulation.getSnapshot().tick, 90);
  assert.equal(simulation.getSnapshot().foods.length, 23);
});

test("configuração dinâmica aplica comida agora e população e genética na transição", () => {
  const simulation = new Simulation(createRuntimeConfig());
  runTicks(simulation, 30);

  const pending = createRuntimeConfig({
    populationSize: 6,
    spawnCount: 2,
    eliteCount: 2,
    tournamentSize: 2,
    uniformCrossoverParentAChance: 0.75,
    mutationChancePerGene: 0.2,
    mutationStdDev: 0.3,
  });
  const firstReceipt = simulation.applyRuntimeConfig(pending);

  assert.deepEqual(firstReceipt, {
    generation: 1,
    tick: 30,
    currentPopulationSize: 4,
    nextPopulationSize: 6,
    populationChangePending: true,
    currentGenerationDurationSeconds: 4,
    nextGenerationDurationSeconds: 4,
    generationDurationChangePending: false,
    currentFoodMaxCount: 300,
    nextFoodMaxCount: 300,
    foodMaxChangePending: false,
    currentInitialFoodCount: 1,
    nextInitialFoodCount: 1,
    initialFoodChangePending: false,
    currentFoodEnergyRange: { minEnergy: 10, maxEnergy: 50 },
    nextFoodEnergyRange: { minEnergy: 10, maxEnergy: 50 },
    foodEnergyChangePending: false,
    currentFoodInactivityTimeoutSeconds: 30,
    nextFoodInactivityTimeoutSeconds: 30,
    foodInactivityChangePending: false,
    currentBeingPolicy: createBeingPolicySnapshot(pending),
    nextBeingPolicy: createBeingPolicySnapshot(pending),
    beingPolicyChangePending: false,
    spawnPolicy: {
      initialCount: 1,
      spawnCount: 2,
      spawnIntervalTicks: 90,
      nextSpawnTick: 90,
      maxCount: 300,
      minEnergy: 10,
      maxEnergy: 50,
      inactivityTimeoutTicks: 900,
    },
  });
  assert.equal(simulation.getSnapshot().population.total, 4);

  runTicks(simulation, 10);
  const rescheduled = createRuntimeConfig({
    populationSize: 6,
    spawnCount: 2,
    spawnIntervalSeconds: 1,
    eliteCount: 2,
    tournamentSize: 2,
    uniformCrossoverParentAChance: 0.75,
    mutationChancePerGene: 0.2,
    mutationStdDev: 0.3,
  });
  const secondReceipt = simulation.applyRuntimeConfig(rescheduled);
  assert.equal(secondReceipt.spawnPolicy.nextSpawnTick, 70);
  assert.equal(simulation.getSnapshot().foods.length, 1);
  runTicks(simulation, 29);
  assert.equal(simulation.getSnapshot().tick, 69);
  assert.equal(simulation.getSnapshot().foods.length, 1);
  simulation.tick();
  assert.equal(simulation.getSnapshot().foods.length, 3);

  runTicks(simulation, 50);
  const transitioned = simulation.getSnapshot();
  assert.equal(transitioned.generation, 2);
  assert.equal(transitioned.tick, 0);
  assert.equal(transitioned.population.total, 6);
  assert.equal(transitioned.foods.length, 1);
  assert.equal(simulation.getEliteArchive().length, 2);
  assert.deepEqual(simulation.getBeingGenome(1), simulation.getEliteArchive()[0].genome);
  assert.deepEqual(simulation.getBeingGenome(2), simulation.getEliteArchive()[1].genome);

  simulation.reset();
  assert.equal(simulation.getSnapshot().generation, 1);
  assert.equal(simulation.getSnapshot().population.total, 6);
});

test("configuração dinâmica falha atomicamente em campos bloqueados e relações cruzadas", () => {
  const simulation = new Simulation(createRuntimeConfig());
  runTicks(simulation, 30);
  const before = simulation.getSnapshot();

  assert.throws(
    () => simulation.applyRuntimeConfig(createRuntimeConfig({
      simulationSeed: "outra-seed",
    })),
    /aceita apenas população, política de comida, custos e sobrevivência, limite da próxima geração e genética/,
  );
  assert.throws(
    () => simulation.applyRuntimeConfig(createRuntimeConfig({
      populationSize: 6,
      eliteCount: 5,
      tournamentSize: 4,
    })),
    /Top K deve caber também na população atual/,
  );
  assert.strictEqual(simulation.getSnapshot(), before);

  runTicks(simulation, 60);
  assert.equal(simulation.getSnapshot().tick, 90);
  assert.equal(simulation.getSnapshot().foods.length, 2);
});

test("pausa aceita ajustes dinâmicos sem criar ticks ou eventos retroativos", () => {
  const config = createRuntimeConfig();
  const simulation = new Simulation(config);
  const clock = new SimulationClock(config.time);
  clock.resume();
  clock.advance(1_000, () => simulation.tick());
  assert.equal(simulation.getSnapshot().tick, 7);
  clock.pause();

  const nextConfig = createRuntimeConfig({ spawnCount: 2, spawnIntervalSeconds: 1 });
  const receipt = simulation.applyRuntimeConfig(nextConfig);
  assert.equal(receipt.spawnPolicy.nextSpawnTick, 37);
  clock.advance(10_000, () => simulation.tick());
  assert.equal(simulation.getSnapshot().tick, 7);
  assert.equal(simulation.getSnapshot().foods.length, 1);

  clock.resume();
  runTicks(simulation, 29);
  assert.equal(simulation.getSnapshot().foods.length, 1);
  simulation.tick();
  assert.equal(simulation.getSnapshot().tick, 37);
  assert.equal(simulation.getSnapshot().foods.length, 3);
});

test("limite dinâmico preserva a geração atual e passa a valer na seguinte", () => {
  const initialConfig = createRuntimeConfig({ durationSeconds: 2 });
  const simulation = new Simulation(initialConfig);
  runTicks(simulation, 10);

  const nextConfig = createRuntimeConfig({ durationSeconds: 1 / 30 });
  const receipt = simulation.applyRuntimeConfig(nextConfig);
  assert.equal(receipt.currentGenerationDurationSeconds, 2);
  assert.equal(receipt.nextGenerationDurationSeconds, 1 / 30);
  assert.equal(receipt.generationDurationChangePending, true);
  assert.equal(simulation.getSnapshot().currentGenerationTimeline.configuredDurationSeconds, 2);

  runTicks(simulation, 49);
  assert.equal(simulation.getSnapshot().generation, 1);
  simulation.tick();
  assert.equal(simulation.getSnapshot().generation, 2);
  assert.equal(simulation.getSnapshot().generationHistory[0].ticks, 60);
  assert.equal(simulation.getSnapshot().generationHistory[0].configuredDurationSeconds, 2);
  assert.equal(
    simulation.getSnapshot().currentGenerationTimeline.configuredDurationSeconds,
    1 / 30,
  );
  simulation.tick();
  assert.equal(simulation.getSnapshot().generation, 3);

  simulation.reset();
  assert.equal(simulation.getSnapshot().generation, 1);
  assert.equal(
    simulation.getSnapshot().currentGenerationTimeline.configuredDurationSeconds,
    1 / 30,
  );
});

test("máximo de comidas dinâmico fica pendente até a próxima geração", () => {
  const control = new Simulation(createRuntimeConfig({
    durationSeconds: 2,
    spawnCount: 4,
    spawnIntervalSeconds: 1,
    maxFoodCount: 5,
  }));
  const changed = new Simulation(createRuntimeConfig({
    durationSeconds: 2,
    spawnCount: 4,
    spawnIntervalSeconds: 1,
    maxFoodCount: 5,
  }));
  runTicks(control, 30);
  runTicks(changed, 30);
  assert.equal(changed.getSnapshot().foods.length, 5);

  const nextConfig = createRuntimeConfig({
    durationSeconds: 2,
    spawnCount: 4,
    spawnIntervalSeconds: 1,
    maxFoodCount: 2,
  });
  const receipt = changed.applyRuntimeConfig(nextConfig);
  assert.equal(receipt.currentFoodMaxCount, 5);
  assert.equal(receipt.nextFoodMaxCount, 2);
  assert.equal(receipt.foodMaxChangePending, true);
  assert.equal(changed.getSnapshot().foodPolicy.maxCount, 5);
  assert.equal(changed.getSnapshot().foods.length, 5);

  runTicks(control, 29);
  runTicks(changed, 29);
  assert.deepEqual(changed.getSnapshot(), control.getSnapshot());
  changed.tick();
  assert.equal(changed.getSnapshot().generation, 2);
  assert.equal(changed.getSnapshot().foodPolicy.maxCount, 2);
  assert.equal(changed.getSnapshot().foods.length, 1);
  runTicks(changed, 30);
  assert.equal(changed.getSnapshot().foods.length, 2);

  changed.reset();
  assert.equal(changed.getSnapshot().generation, 1);
  assert.equal(changed.getSnapshot().foodPolicy.maxCount, 2);
});

test("energia e inatividade dinâmicas preservam a geração atual e valem na seguinte", () => {
  const simulation = new Simulation(createRuntimeConfig({
    durationSeconds: 1,
    foodInactivityTimeoutSeconds: 10,
  }));
  runTicks(simulation, 10);
  const currentFood = simulation.getSnapshot().foods[0];
  const nextConfig = createRuntimeConfig({
    durationSeconds: 1,
    minFoodEnergy: 20,
    maxFoodEnergy: 80,
    foodInactivityTimeoutSeconds: 0,
  });
  const receipt = simulation.applyRuntimeConfig(nextConfig);

  assert.deepEqual(receipt.currentFoodEnergyRange, { minEnergy: 10, maxEnergy: 50 });
  assert.deepEqual(receipt.nextFoodEnergyRange, { minEnergy: 20, maxEnergy: 80 });
  assert.equal(receipt.foodEnergyChangePending, true);
  assert.equal(receipt.currentFoodInactivityTimeoutSeconds, 10);
  assert.equal(receipt.nextFoodInactivityTimeoutSeconds, 0);
  assert.equal(receipt.foodInactivityChangePending, true);
  assert.deepEqual(simulation.getSnapshot().foodPolicy, {
    initialCount: 1,
    spawnCount: 1,
    spawnIntervalTicks: 90,
    nextSpawnTick: 90,
    maxCount: 300,
    minEnergy: 10,
    maxEnergy: 50,
    inactivityTimeoutTicks: 300,
  });
  assert.equal(simulation.getSnapshot().foods[0].initialEnergy, currentFood.initialEnergy);
  assert.equal(simulation.getSnapshot().foods[0].createdTick, 0);

  runTicks(simulation, 20);
  assert.equal(simulation.getSnapshot().generation, 2);
  assert.equal(simulation.getSnapshot().foodPolicy.minEnergy, 20);
  assert.equal(simulation.getSnapshot().foodPolicy.maxEnergy, 80);
  assert.equal(simulation.getSnapshot().foodPolicy.inactivityTimeoutTicks, 0);
  assert.equal(simulation.getSnapshot().foods[0].inactivityRemainingTicks, null);

  simulation.reset();
  assert.equal(simulation.getSnapshot().generation, 1);
  assert.equal(simulation.getSnapshot().foodPolicy.minEnergy, 20);
  assert.equal(simulation.getSnapshot().foodPolicy.maxEnergy, 80);
  assert.equal(simulation.getSnapshot().foodPolicy.inactivityTimeoutTicks, 0);
});

test("comida inicial e custos permanecem pendentes até a próxima geração", () => {
  const initialConfig = createRuntimeConfig({ durationSeconds: 2, initialFoodCount: 1 });
  const control = new Simulation(initialConfig);
  const changed = new Simulation(initialConfig);
  runTicks(control, 10);
  runTicks(changed, 10);
  const beforeApply = changed.getSnapshot();

  const nextConfig = createRuntimeConfig({
    durationSeconds: 2,
    initialFoodCount: 3,
    movementCostCoefficient: 7,
    movementCostExponent: 1.5,
    turnCostAtMaxPerSecond: 2,
    basalMetabolismPerSecond: 1.25,
    waterMovementCostMultiplier: 4,
    zeroEnergyDamagePerSecond: 12,
    healingEnergyThreshold: 70,
    healingEnergyPerLife: 3,
    healingMaxLifePerSecond: 2,
  });
  const receipt = changed.applyRuntimeConfig(nextConfig);

  assert.equal(receipt.currentInitialFoodCount, 1);
  assert.equal(receipt.nextInitialFoodCount, 3);
  assert.equal(receipt.initialFoodChangePending, true);
  assert.equal(receipt.beingPolicyChangePending, true);
  assert.strictEqual(receipt.currentBeingPolicy, beforeApply.beingPolicy);
  assert.deepEqual(receipt.nextBeingPolicy, createBeingPolicySnapshot(nextConfig));
  assert(Object.isFrozen(receipt.nextBeingPolicy));
  assert.deepEqual(changed.getSnapshot(), beforeApply);

  runTicks(control, 49);
  runTicks(changed, 49);
  assert.deepEqual(changed.getSnapshot(), control.getSnapshot());
  control.tick();
  changed.tick();

  const controlNext = control.getSnapshot();
  const changedNext = changed.getSnapshot();
  assert.equal(changedNext.generation, 2);
  assert.equal(changedNext.foodPolicy.initialCount, 3);
  assert.equal(changedNext.foods.length, 3);
  assert.deepEqual(changedNext.foods.slice(0, 1), controlNext.foods);
  assert.deepEqual(changedNext.beingPolicy, createBeingPolicySnapshot(nextConfig));

  changed.reset();
  assert.equal(changed.getSnapshot().generation, 1);
  assert.equal(changed.getSnapshot().foods.length, 3);
  assert.deepEqual(changed.getSnapshot().beingPolicy, createBeingPolicySnapshot(nextConfig));
});

test("realocações entram como criações na timeline sem contar como esgotadas", () => {
  const simulation = new Simulation(createRuntimeConfig({
    durationSeconds: 3,
    foodInactivityTimeoutSeconds: 1,
  }));
  const initialFood = simulation.getSnapshot().foods[0];
  const sampleTick = Math.ceil(initialFood.inactivityTimeoutTicks / 30) * 30;

  runTicks(simulation, sampleTick);
  const snapshot = simulation.getSnapshot();
  assert.equal(snapshot.generation, 1);
  assert.equal(snapshot.foods.length, 1);
  assert.equal(snapshot.foods[0].id, 2);
  assert.notDeepEqual(
    [snapshot.foods[0].column, snapshot.foods[0].row],
    [initialFood.column, initialFood.row],
  );
  assert.equal(snapshot.foods[0].createdTick, initialFood.inactivityTimeoutTicks);
  assert.equal(snapshot.currentGenerationTimeline.samples.at(-1).foodsCreatedInInterval, 1);
  assert.equal(snapshot.currentGenerationTimeline.samples.at(-1).foodsConsumedInInterval, 0);
});

test("timeline amostra tick zero, segundos inteiros e terminal não alinhado", () => {
  const simulation = new Simulation(createRuntimeConfig({
    durationSeconds: 1.1,
    spawnCount: 2,
    spawnIntervalSeconds: 1,
  }));
  const initialTimeline = simulation.getSnapshot().currentGenerationTimeline;
  assert.deepEqual(initialTimeline.samples.map(({ tick }) => tick), [0]);
  runTicks(simulation, 29);
  assert.strictEqual(simulation.getSnapshot().currentGenerationTimeline, initialTimeline);
  simulation.tick();
  const sampled = simulation.getSnapshot();
  assert.deepEqual(
    sampled.currentGenerationTimeline.samples.map(({ tick }) => tick),
    [0, 30],
  );
  const secondSample = sampled.currentGenerationTimeline.samples[1];
  assert.equal(
    secondSample.foodsCreatedInInterval,
    2,
  );
  assert.equal(
    secondSample.totalFoodEnergy,
    Math.round(sampled.foods.reduce(
      (total, food) => total + food.remainingEnergy,
      0,
    ) * 1_000_000) / 1_000_000,
  );
  assert.equal(secondSample.meanAliveEnergy, sampled.population.meanAliveEnergy);
  assert.equal(secondSample.meanAliveLife, sampled.population.meanAliveLife);
  assert.equal(
    secondSample.meanAliveAbsoluteSpeed,
    sampled.population.meanAliveAbsoluteSpeed,
  );
  assert.equal(secondSample.aliveInWaterFraction, sampled.population.aliveInWaterFraction);
  runTicks(simulation, 3);

  const record = simulation.getSnapshot().generationHistory[0];
  assert.equal(record.ticks, 33);
  assert.deepEqual(record.timeline.samples.map(({ tick }) => tick), [0, 30, 33]);
  assert(Object.isFrozen(record.timeline));
  assert(Object.isFrozen(record.timeline.samples));
  assert(record.timeline.samples.every(Object.isFrozen));
  assert.equal(record.timeline.samples[0].deathsInInterval, 0);
  assert.equal(record.timeline.samples[0].foodsCreatedInInterval, 0);
  assert.equal(record.timeline.samples[0].foodsConsumedInInterval, 0);
});

test("extinção fora do segundo inteiro registra lacunas e mortes do intervalo", () => {
  const simulation = new Simulation(createConfig({
    being: { initialEnergy: 0, initialLife: 1 },
  }));
  simulation.tick();
  assert.equal(simulation.getSnapshot().generation, 1);
  simulation.tick();

  const terminal = simulation.getSnapshot().generationHistory[0].timeline.samples.at(-1);
  assert.equal(terminal.tick, 2);
  assert.equal(terminal.aliveBeingCount, 0);
  assert.equal(terminal.deathsInInterval, 40);
  assert.equal(terminal.cumulativeDeaths, 40);
  assert.equal(terminal.meanAliveEnergy, null);
  assert.equal(terminal.meanAliveLife, null);
  assert.equal(terminal.meanAliveAbsoluteSpeed, null);
  assert.equal(terminal.aliveInWaterFraction, null);
});

test("as mesmas alterações dinâmicas nos mesmos ticks mantêm determinismo", () => {
  const first = new Simulation(createRuntimeConfig());
  const second = new Simulation(createRuntimeConfig());
  const nextConfig = createRuntimeConfig({
    populationSize: 5,
    initialFoodCount: 3,
    spawnCount: 2,
    spawnIntervalSeconds: 1,
    eliteCount: 2,
    tournamentSize: 2,
    uniformCrossoverParentAChance: 0.35,
    mutationChancePerGene: 0.4,
    mutationStdDev: 0.25,
    movementCostCoefficient: 3,
    movementCostExponent: 1.5,
    turnCostAtMaxPerSecond: 0.75,
    basalMetabolismPerSecond: 0.5,
    waterMovementCostMultiplier: 2,
    zeroEnergyDamagePerSecond: 15,
    healingEnergyThreshold: 75,
    healingEnergyPerLife: 2.5,
    healingMaxLifePerSecond: 1.5,
  });

  for (const simulation of [first, second]) {
    runTicks(simulation, 33);
    simulation.applyRuntimeConfig(nextConfig);
    runTicks(simulation, 147);
  }

  assert.deepEqual(first.getSnapshot(), second.getSnapshot());
  assert.deepEqual(first.getEliteArchive(), second.getEliteArchive());
  assert.deepEqual(first.getBeingGenome(5), second.getBeingGenome(5));
});

test("streams da simulação permanecem independentes", () => {
  const first = new Simulation(DEFAULT_CONFIG);
  const second = new Simulation(DEFAULT_CONFIG);

  const firstMap = first.createRandomStream("map");
  first.createRandomStream("genetics").nextFloat();
  const secondMap = second.createRandomStream("map");

  assert.deepEqual(
    Array.from({ length: 10 }, () => firstMap.nextFloat()),
    Array.from({ length: 10 }, () => secondMap.nextFloat()),
  );
});

test("os 40 seres mantêm cérebro dourado e decisões a 10 Hz", () => {
  const simulation = new Simulation(DEFAULT_CONFIG);
  const initial = simulation.getSnapshot().beings;

  assert.equal(
    createHash("sha256").update(JSON.stringify(initial)).digest("hex"),
    "9cec816f3da271de4faaf2ed1048d7c9d595a6f6882de97147d9385949797a6a",
  );
  assert.equal(
    createHash("sha256").update(JSON.stringify(simulation.getBeingGenome(1))).digest("hex"),
    "ef0a9439fcff8cdd73d9df47cf07718144755827a6bd7955e13defa3fbc41ebd",
  );
  assert.equal(initial[0].eyes.length, 5);
  assert.deepEqual(initial[0].underBodyEye, { terrainType: "land", waterProximity: 0 });
  assert.deepEqual(initial[0].brain.outputs, [0, 0]);
  assert.equal(initial[0].brain.geneCount, 230);
  assert.equal(
    initial[0].brain.inputs[DEFAULT_CONFIG.eyes.count * 2],
    Number(findFoodWithinDistance({
      foods: simulation.getSnapshot().foods,
      x: initial[0].x,
      y: initial[0].y,
      maxDistanceTiles: DEFAULT_CONFIG.derived.foodSafeEatingDistanceTiles,
    }) !== null),
  );
  assert.equal(initial[0].brain.inputs[(DEFAULT_CONFIG.eyes.count * 2) + 1], 0);
  assert(Object.isFrozen(initial[0].eyes));
  assert(Object.isFrozen(initial[0].brain.inputs));
  simulation.tick();
  const firstAction = simulation.getSnapshot().beings[0];
  simulation.tick();
  const secondAction = simulation.getSnapshot().beings[0];
  simulation.tick();
  const thirdAction = simulation.getSnapshot().beings[0];
  assert.equal(secondAction.speed, firstAction.speed);
  assert.equal(secondAction.turn, firstAction.turn);
  assert.equal(thirdAction.speed, firstAction.speed);
  assert.equal(thirdAction.turn, firstAction.turn);
  simulation.tick();
  const nextDecision = simulation.getSnapshot().beings[0];
  assert.notDeepEqual(
    { speed: nextDecision.speed, turn: nextDecision.turn },
    { speed: firstAction.speed, turn: firstAction.turn },
  );
});

test("sensores visuais acompanham a pose atual entre decisões neurais", () => {
  const simulation = new Simulation(DEFAULT_CONFIG);
  simulation.tick();
  simulation.tick();
  const snapshot = simulation.getSnapshot();
  const being = snapshot.beings[0];
  const mapAdapter = Object.freeze({
    getSnapshot: () => snapshot.map,
    getTile: (column, row) => (
      column < 0 || row < 0 || column >= snapshot.map.columns || row >= snapshot.map.rows
        ? null
        : snapshot.map.tiles[(row * snapshot.map.columns) + column]
    ),
  });
  const sensor = new EyeSensor(DEFAULT_CONFIG.eyes);

  assert.deepEqual(being.eyes, sensor.observe({
    position: being,
    foods: snapshot.foods,
    worldMap: mapAdapter,
  }));
  assert.deepEqual(being.underBodyEye, sensor.observeUnderBody({
    position: being,
    worldMap: mapAdapter,
  }));
});

test("frequências configuráveis decidem somente em divisores dos ticks físicos", () => {
  const slow = new Simulation(createConfig({ time: { brainHz: 1 } }));
  slow.tick();
  const firstSlowAction = slow.getSnapshot().beings[0].brain.outputs;
  runTicks(slow, 29);
  assert.strictEqual(slow.getSnapshot().beings[0].brain.outputs, firstSlowAction);
  slow.tick();
  assert.notDeepEqual(slow.getSnapshot().beings[0].brain.outputs, firstSlowAction);

  const everyTick = new Simulation(createConfig({ time: { brainHz: 30 } }));
  everyTick.tick();
  const firstFastAction = everyTick.getSnapshot().beings[0].brain.outputs;
  everyTick.tick();
  assert.notDeepEqual(everyTick.getSnapshot().beings[0].brain.outputs, firstFastAction);
});

test("extinção registra a geração e inicializa imediatamente a seguinte", () => {
  const simulation = new Simulation(createConfig({
    being: { initialEnergy: 0 },
  }));
  const initialMap = simulation.getSnapshot().map;
  const initialFoods = simulation.getSnapshot().foods;
  const initialPositions = simulation.getSnapshot().beings.map(({ x, y }) => ({ x, y }));

  runTicks(simulation, 149);
  assert.equal(simulation.getSnapshot().generation, 1);
  assert.equal(simulation.tick(), undefined);
  const transitioned = simulation.getSnapshot();
  assert.equal(transitioned.generation, 2);
  assert.equal(transitioned.tick, 0);
  assert.equal(transitioned.totalTicks, 150);
  assert.equal(transitioned.population.aliveCount, 40);
  assert.strictEqual(transitioned.map, initialMap);
  assert.notDeepEqual(transitioned.foods, initialFoods);
  assert.notDeepEqual(
    transitioned.beings.map(({ x, y }) => ({ x, y })),
    initialPositions,
  );
  assert.equal(transitioned.completedGenerations, 1);
  assert.equal(transitioned.generationHistory.length, 1);
  assert.deepEqual(
    {
      ...transitioned.generationHistory[0],
      timeline: undefined,
    },
    {
      generation: 1,
      completionReason: "extinction",
      ticks: 150,
      simulatedTimeSeconds: 5,
      configuredDurationSeconds: 120,
      survivorCount: 0,
      bestBeingId: 1,
      bestFitness: 5,
      meanFitness: 5,
      topTenPercentCount: 4,
      topTenPercentMeanFitness: 5,
      globalTopKCount: 4,
      globalTopKMeanFitness: 5,
      timeline: undefined,
    },
  );
  assert.strictEqual(
    transitioned.generationHistory[0].timeline.samples.at(-1).tick,
    150,
  );
  assert.deepEqual(transitioned.bestEver, {
    generation: 1,
    beingId: 1,
    fitness: 5,
  });
  simulation.tick();
  assert.equal(simulation.getSnapshot().generation, 2);
  assert.equal(simulation.getSnapshot().tick, 1);
});

test("limite de 3.600 ticks transiciona sem pausar a execução", () => {
  const simulation = new Simulation(createConfig({
    movement: { costCoefficient: 0, turnCostAtMaxPerSecond: 0 },
    energy: { basalMetabolismPerSecond: 0 },
  }));

  runTicks(simulation, 3_599);
  assert.equal(simulation.getSnapshot().generation, 1);
  simulation.tick();
  const snapshot = simulation.getSnapshot();
  assert.equal(snapshot.generation, 2);
  assert.equal(snapshot.tick, 0);
  assert.equal(snapshot.totalTicks, 3_600);
  assert.equal(snapshot.generationHistory[0].completionReason, "time-limit");
  assert.equal(snapshot.generationHistory[0].survivorCount, 40);
  assert.equal(snapshot.population.aliveCount, 40);
});

test("genomas evoluídos da geração 2 mantêm hash dourado para evo-1", () => {
  const simulation = new Simulation(DEFAULT_CONFIG);
  while (simulation.getSnapshot().generation === 1) {
    simulation.tick();
  }
  const snapshot = simulation.getSnapshot();
  const genomes = snapshot.beings.map((being) => simulation.getBeingGenome(being.id));

  assert.equal(snapshot.totalTicks, 1_969);
  assert.equal(
    createHash("sha256").update(JSON.stringify(genomes)).digest("hex"),
    "bf8cba135287edbaf9e2b84490a366ebc82e9cbe084d894afed68473a87734c8",
  );
  assert.deepEqual(genomes[0], new Simulation(DEFAULT_CONFIG).getBeingGenome(29));
});

test("reset repete a geração 2 e agrupamentos preservam o estado evoluído", () => {
  const config = createConfig({ generation: { durationSeconds: 1 } });
  const first = new Simulation(config);
  const second = new Simulation(config);

  runTicks(first, 95);
  for (const batch of [7, 31, 2, 55]) {
    runTicks(second, batch);
  }
  assert.deepEqual(first.getSnapshot(), second.getSnapshot());

  const repeated = new Simulation(config);
  runTicks(repeated, 30);
  const evolvedGenome = repeated.getBeingGenome(1);
  repeated.reset();
  runTicks(repeated, 30);
  assert.equal(repeated.getSnapshot().generation, 2);
  assert.deepEqual(repeated.getBeingGenome(1), evolvedGenome);
});

test("os K melhores genomas históricos permanecem intactos no pool", () => {
  const simulation = new Simulation(createConfig({
    generation: { durationSeconds: 1 / 30 },
    population: { size: 4 },
    genetics: { eliteCount: 2, tournamentSize: 3 },
  }));

  for (let generation = 2; generation <= 8; generation += 1) {
    simulation.tick();
    const archive = simulation.getEliteArchive();
    assert.equal(simulation.getSnapshot().generation, generation);
    assert.equal(archive.length, 2);
    assert(Object.isFrozen(archive));
    assert.deepEqual(simulation.getBeingGenome(1), archive[0].genome);
    assert.deepEqual(simulation.getBeingGenome(2), archive[1].genome);
  }

  simulation.reset();
  assert.deepEqual(simulation.getEliteArchive(), []);
});

test("aumentar ou reduzir Top K afeta apenas transições futuras e mantém elites exatas", () => {
  const createConfigForK = (eliteCount) => createRuntimeConfig({
    durationSeconds: 1 / 30,
    eliteCount,
  });
  const simulation = new Simulation(createConfigForK(1));

  simulation.tick();
  const firstEliteGenome = simulation.getEliteArchive()[0].genome;
  assert.equal(simulation.getSnapshot().generation, 2);
  assert.equal(simulation.getEliteArchive().length, 1);

  simulation.applyRuntimeConfig(createConfigForK(2));
  assert.equal(simulation.getEliteArchive().length, 1);
  simulation.tick();
  assert.equal(simulation.getSnapshot().generation, 3);
  assert.equal(simulation.getEliteArchive().length, 2);
  assert.equal(simulation.getSnapshot().generationHistory.at(-1).globalTopKCount, 2);
  assert.deepEqual(simulation.getBeingGenome(1), simulation.getEliteArchive()[0].genome);
  assert.deepEqual(simulation.getBeingGenome(2), simulation.getEliteArchive()[1].genome);
  assert(simulation.getEliteArchive().some(({ genome }) => (
    JSON.stringify(genome) === JSON.stringify(firstEliteGenome)
  )));

  simulation.applyRuntimeConfig(createConfigForK(1));
  assert.equal(simulation.getEliteArchive().length, 2);
  simulation.tick();
  assert.equal(simulation.getEliteArchive().length, 1);
  assert.equal(simulation.getSnapshot().generationHistory.at(-1).globalTopKCount, 1);
  assert.deepEqual(simulation.getBeingGenome(1), simulation.getEliteArchive()[0].genome);

  simulation.applyRuntimeConfig(createConfigForK(2));
  simulation.tick();
  assert.equal(simulation.getEliteArchive().length, 2);
  assert.deepEqual(simulation.getBeingGenome(1), simulation.getEliteArchive()[0].genome);
  assert.deepEqual(simulation.getBeingGenome(2), simulation.getEliteArchive()[1].genome);
});

test("histórico preserva todas as gerações e o melhor histórico", () => {
  const simulation = new Simulation(createConfig({
    generation: { durationSeconds: 1 / 30 },
    population: { size: 3 },
    genetics: { eliteCount: 1 },
    being: { initialEnergy: 100 },
  }));

  runTicks(simulation, 55);
  const snapshot = simulation.getSnapshot();
  assert.equal(snapshot.generation, 56);
  assert.equal(snapshot.completedGenerations, 55);
  assert.equal(snapshot.generationHistory.length, 55);
  assert.equal(snapshot.generationHistory[0].generation, 1);
  assert.equal(snapshot.generationHistory.at(-1).generation, 55);
  assert(snapshot.generationHistory.every(Object.isFrozen));
  assert(snapshot.generationHistory.every((record) => Object.isFrozen(record.timeline)));
  assert(snapshot.generationHistory.every((record) => record.topTenPercentCount === 1));
  assert(snapshot.generationHistory.every((record) => record.globalTopKCount === 1));
  assert(snapshot.generationHistory.every((record) => record.timeline.samples.length === 2));
  assert.equal(new Set(snapshot.generationHistory.map((record) => record.timeline)).size, 55);
  assert(Object.isFrozen(snapshot.bestEver));
  assert.deepEqual(snapshot.bestEver, {
    generation: 1,
    beingId: 1,
    fitness: 0.033333,
  });
  simulation.reset();
  assert.deepEqual(simulation.getSnapshot().generationHistory, []);
  assert.deepEqual(
    simulation.getSnapshot().currentGenerationTimeline.samples.map(({ tick }) => tick),
    [0],
  );
});

test("relógio processa múltiplas transições no mesmo frame sem pausar", () => {
  const config = createConfig({
    generation: { durationSeconds: 1 / 30 },
    population: { size: 3 },
    genetics: { eliteCount: 1 },
  });
  const simulation = new Simulation(config);
  const clock = new SimulationClock(config.time);
  clock.setSpeed(8);
  clock.resume();

  const processed = clock.advance(100, () => simulation.tick());
  assert.equal(processed, 24);
  assert.equal(simulation.getSnapshot().generation, 25);
  assert.equal(simulation.getSnapshot().completedGenerations, 24);
  assert.equal(clock.paused, false);
});
