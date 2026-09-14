import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_CONFIG } from "../src/config.js";
import { Food } from "../src/core/food.js";
import { FoodSystem } from "../src/core/food-system.js";
import { SeededRandom } from "../src/core/seeded-random.js";
import { WorldMap } from "../src/core/world-map.js";

function createRandomSequence(values) {
  let calls = 0;
  return {
    nextFloat() {
      if (calls >= values.length) {
        throw new Error("Sequência aleatória esgotada.");
      }
      const value = values[calls];
      calls += 1;
      return value;
    },
    get calls() {
      return calls;
    },
  };
}

function createMapSnapshot(productivities) {
  return Object.freeze({
    columns: productivities.length,
    rows: 1,
    tiles: Object.freeze(productivities.map((productivity, column) => Object.freeze({
      column,
      row: 0,
      type: productivity === null ? "water" : "land",
      productivity: productivity ?? 0,
    }))),
  });
}

function createFoodConfig(overrides = {}) {
  return Object.freeze({
    initialCount: 1,
    spawnCount: 1,
    maxCount: 2,
    minEnergy: 10,
    maxEnergy: 50,
    ...overrides,
  });
}

function createFoodSystem(options) {
  return new FoodSystem({
    inactivityTimeoutTicks: 0,
    relocationRandom: createRandomSequence([]),
    initialInactivityRandom: createRandomSequence([]),
    spawnInactivityRandom: createRandomSequence([]),
    relocationInactivityRandom: createRandomSequence([]),
    ...options,
  });
}

function foodSnapshot({
  id,
  column,
  row,
  energy,
  createdTick = 0,
  lastConsumedTick = createdTick,
  inactivityTimeoutTicks = 0,
}) {
  return {
    id,
    column,
    row,
    initialEnergy: energy,
    remainingEnergy: energy,
    createdTick,
    lastConsumedTick,
    inactivityTimeoutTicks,
    inactivityRemainingTicks: inactivityTimeoutTicks === 0 ? null : inactivityTimeoutTicks,
  };
}

test("Food valida seus dados e expõe snapshot imutável", () => {
  const food = new Food({
    id: 1,
    column: 2,
    row: 3,
    initialEnergy: 24.5,
    createdTick: 2,
    inactivityTimeoutTicks: 10,
  });
  const snapshot = food.getSnapshot({ currentTick: 7 });

  assert.deepEqual(snapshot, {
    id: 1,
    column: 2,
    row: 3,
    initialEnergy: 24.5,
    remainingEnergy: 24.5,
    createdTick: 2,
    lastConsumedTick: 2,
    inactivityTimeoutTicks: 10,
    inactivityRemainingTicks: 5,
  });
  assert.strictEqual(
    food.getSnapshot({ currentTick: 7 }),
    snapshot,
  );
  assert(Object.isFrozen(food));
  assert(Object.isFrozen(snapshot));
  assert.throws(() => { snapshot.remainingEnergy = 0; }, TypeError);
  assert.throws(
    () => new Food({ id: 0, column: 0, row: 0, initialEnergy: 10 }),
    /ID da comida/,
  );
  assert.throws(
    () => new Food({ id: 1, column: -1, row: 0, initialEnergy: 10 }),
    /coordenadas/,
  );
  assert.throws(
    () => new Food({ id: 1, column: 0, row: 0, initialEnergy: 0 }),
    /energia inicial/,
  );
  assert.throws(
    () => new Food({
      id: 1,
      column: 0,
      row: 0,
      initialEnergy: 10,
      inactivityTimeoutTicks: -1,
    }),
    /prazo de inatividade/,
  );
});

test("seleção ponderada segue row-major, evita duplicidade e calcula energia", () => {
  const initialRandom = createRandomSequence([0.24]);
  const spawnRandom = createRandomSequence([0]);
  const system = createFoodSystem({
    mapSnapshot: createMapSnapshot([0.25, 0.75, null]),
    config: createFoodConfig(),
    spawnIntervalTicks: 1,
    initialRandom,
    spawnRandom,
  });

  const initial = system.getSnapshot();
  assert.deepEqual(initial, [
    foodSnapshot({ id: 1, column: 0, row: 0, energy: 20 }),
  ]);
  assert.strictEqual(system.getSnapshot(), initial);

  system.processTick(1);
  const afterSpawn = system.getSnapshot();
  assert.deepEqual(afterSpawn, [
    foodSnapshot({ id: 1, column: 0, row: 0, energy: 20 }),
    foodSnapshot({ id: 2, column: 1, row: 0, energy: 40, createdTick: 1 }),
  ]);
  assert.notStrictEqual(afterSpawn, initial);
  assert(Object.isFrozen(afterSpawn));
  assert(afterSpawn.every(Object.isFrozen));
  assert.equal(initialRandom.calls, 1);
  assert.equal(spawnRandom.calls, 1);
  assert.deepEqual(system.getMetricsSnapshot(), {
    availableCount: 2,
    totalRemainingEnergy: 60,
    totalCreated: 2,
    totalDepleted: 0,
  });
  assert.strictEqual(system.getMetricsSnapshot(), system.getMetricsSnapshot());
  assert(Object.isFrozen(system.getMetricsSnapshot()));
});

test("aumentar a leva inicial preserva o prefixo determinístico", () => {
  const mapSnapshot = createMapSnapshot([0.2, 0.4, 0.6, 0.8]);
  const small = createFoodSystem({
    mapSnapshot,
    config: createFoodConfig({ initialCount: 1, maxCount: 4 }),
    spawnIntervalTicks: 10,
    initialRandom: createRandomSequence([0.35]),
    spawnRandom: createRandomSequence([]),
  });
  const large = createFoodSystem({
    mapSnapshot,
    config: createFoodConfig({ initialCount: 3, maxCount: 4 }),
    spawnIntervalTicks: 10,
    initialRandom: createRandomSequence([0.35, 0.7, 0.1]),
    spawnRandom: createRandomSequence([]),
  });

  assert.deepEqual(large.getSnapshot().slice(0, 1), small.getSnapshot());
  assert.equal(small.getSpawnPolicySnapshot().initialCount, 1);
  assert.equal(large.getSpawnPolicySnapshot().initialCount, 3);
});

test("cada comida soma um acréscimo seedado ao prazo mínimo de inatividade", () => {
  const initialRandom = createRandomSequence([0, 0, 0]);
  const inactivityRandom = createRandomSequence([0, 0.5, 0.999999]);
  const system = createFoodSystem({
    mapSnapshot: createMapSnapshot([1, 1, 1]),
    config: createFoodConfig({ initialCount: 3, maxCount: 3 }),
    spawnIntervalTicks: 100,
    inactivityTimeoutTicks: 10,
    initialRandom,
    spawnRandom: createRandomSequence([]),
    initialInactivityRandom: inactivityRandom,
  });

  assert.deepEqual(
    system.getSnapshot().map(({ id, column, inactivityTimeoutTicks }) => ({
      id,
      column,
      inactivityTimeoutTicks,
    })),
    [
      { id: 1, column: 0, inactivityTimeoutTicks: 10 },
      { id: 2, column: 1, inactivityTimeoutTicks: 15 },
      { id: 3, column: 2, inactivityTimeoutTicks: 20 },
    ],
  );
  assert.equal(initialRandom.calls, 3);
  assert.equal(inactivityRandom.calls, 3);
  for (let tick = 1; tick <= 10; tick += 1) {
    system.processTick(tick);
    system.resolveConsumption([]);
  }
  assert.deepEqual(system.getSnapshot().map(({ id }) => id), [2, 3]);
});

test("falta de espaço, peso zero e capacidade encerram o lote sem sorteios extras", () => {
  const initialRandom = createRandomSequence([0]);
  const unusedSpawnRandom = createRandomSequence([]);
  const limited = createFoodSystem({
    mapSnapshot: createMapSnapshot([0.5, 0, null]),
    config: createFoodConfig({ initialCount: 3, spawnCount: 3, maxCount: 3 }),
    spawnIntervalTicks: 1,
    initialRandom,
    spawnRandom: unusedSpawnRandom,
  });

  assert.equal(limited.getSnapshot().length, 1);
  assert.equal(initialRandom.calls, 1);
  limited.processTick(1);
  assert.equal(limited.getSnapshot().length, 1);
  assert.equal(unusedSpawnRandom.calls, 0);

  const fullInitialRandom = createRandomSequence([0]);
  const fullSpawnRandom = createRandomSequence([]);
  const full = createFoodSystem({
    mapSnapshot: createMapSnapshot([1]),
    config: createFoodConfig({ maxCount: 1 }),
    spawnIntervalTicks: 1,
    initialRandom: fullInitialRandom,
    spawnRandom: fullSpawnRandom,
  });
  full.processTick(1);
  assert.equal(full.getSnapshot().length, 1);
  assert.equal(fullSpawnRandom.calls, 0);
});

test("evento cria lote parcial e exige ticks consecutivos", () => {
  const spawnRandom = createRandomSequence([0, 0]);
  const system = createFoodSystem({
    mapSnapshot: createMapSnapshot([0.2, 0.8]),
    config: createFoodConfig({ initialCount: 0, spawnCount: 3, maxCount: 3 }),
    spawnIntervalTicks: 1,
    initialRandom: createRandomSequence([]),
    spawnRandom,
  });

  system.processTick(1);
  assert.equal(system.getSnapshot().length, 2);
  assert.equal(spawnRandom.calls, 2);
  assert.deepEqual(system.getMetricsSnapshot(), {
    availableCount: 2,
    totalRemainingEnergy: 60,
    totalCreated: 2,
    totalDepleted: 0,
  });
  assert.throws(() => system.processTick(3), /ticks inteiros, positivos e consecutivos/);
});

test("política dinâmica preserva ou reagenda o próximo spawn sem sortear", () => {
  const spawnRandom = createRandomSequence([0, 0, 0, 0]);
  const system = createFoodSystem({
    mapSnapshot: createMapSnapshot([0.2, 0.3, 0.5, 0.7]),
    config: createFoodConfig({ initialCount: 0, spawnCount: 1, maxCount: 4 }),
    spawnIntervalTicks: 4,
    initialRandom: createRandomSequence([]),
    spawnRandom,
  });

  system.processTick(1);
  system.updateSpawnPolicy({ spawnCount: 2, spawnIntervalTicks: 4 });
  assert.deepEqual(system.getSpawnPolicySnapshot(), {
    initialCount: 0,
    spawnCount: 2,
    spawnIntervalTicks: 4,
    nextSpawnTick: 4,
    maxCount: 4,
    minEnergy: 10,
    maxEnergy: 50,
    inactivityTimeoutTicks: 0,
  });
  assert.equal(spawnRandom.calls, 0);
  system.processTick(2);
  system.updateSpawnPolicy({ spawnCount: 2, spawnIntervalTicks: 3 });
  assert.deepEqual(system.getSpawnPolicySnapshot(), {
    initialCount: 0,
    spawnCount: 2,
    spawnIntervalTicks: 3,
    nextSpawnTick: 5,
    maxCount: 4,
    minEnergy: 10,
    maxEnergy: 50,
    inactivityTimeoutTicks: 0,
  });
  system.processTick(3);
  system.processTick(4);
  assert.equal(system.getSnapshot().length, 0);
  system.processTick(5);
  assert.equal(system.getSnapshot().length, 2);
  assert.equal(spawnRandom.calls, 2);
  assert.throws(
    () => system.updateSpawnPolicy({ spawnCount: 0, spawnIntervalTicks: 3 }),
    /quantidade por spawn/,
  );
});

test("número da geração altera a leva inicial derivada da seed do mapa", () => {
  const map = WorldMap.generate(DEFAULT_CONFIG.world, DEFAULT_CONFIG.seeds.map).getSnapshot();
  const createForGeneration = (generation) => createFoodSystem({
    mapSnapshot: map,
    config: DEFAULT_CONFIG.food,
    spawnIntervalTicks: DEFAULT_CONFIG.derived.foodSpawnIntervalTicks,
    initialRandom: SeededRandom
      .fromSeed(DEFAULT_CONFIG.seeds.map)
      .fork(`generation:${generation}:initial-food`),
    spawnRandom: SeededRandom
      .fromSeed(DEFAULT_CONFIG.seeds.simulation)
      .fork(`generation:${generation}:food-spawn`),
  });

  assert.notDeepEqual(createForGeneration(1).getSnapshot(), createForGeneration(2).getSnapshot());
});

test("consumo proporcional conserva energia e independe da ordem das solicitações", () => {
  const createSystem = () => createFoodSystem({
    mapSnapshot: createMapSnapshot([1]),
    config: createFoodConfig({ initialCount: 1, maxCount: 1, minEnergy: 1, maxEnergy: 1 }),
    spawnIntervalTicks: 1,
    initialRandom: createRandomSequence([0]),
    spawnRandom: createRandomSequence([0]),
  });
  const requests = [
    { beingId: 3, foodId: 1, requestedEnergy: 0.6 },
    { beingId: 1, foodId: 1, requestedEnergy: 0.6 },
    { beingId: 2, foodId: 1, requestedEnergy: 0.6 },
  ];
  const first = createSystem();
  const second = createSystem();
  const firstGrants = first.resolveConsumption(requests);
  const secondGrants = second.resolveConsumption([...requests].reverse());

  assert.deepEqual(firstGrants, [
    { beingId: 1, foodId: 1, energy: 0.333334 },
    { beingId: 2, foodId: 1, energy: 0.333333 },
    { beingId: 3, foodId: 1, energy: 0.333333 },
  ]);
  assert.deepEqual(secondGrants, firstGrants);
  assert.equal(firstGrants.reduce((total, grant) => total + grant.energy, 0), 1);
  assert.deepEqual(first.getSnapshot(), []);
});

test("consumo parcial invalida snapshot e comida removida libera o tile", () => {
  const system = createFoodSystem({
    mapSnapshot: createMapSnapshot([1]),
    config: createFoodConfig({ initialCount: 1, spawnCount: 1, maxCount: 1, minEnergy: 2, maxEnergy: 2 }),
    spawnIntervalTicks: 1,
    initialRandom: createRandomSequence([0]),
    spawnRandom: createRandomSequence([0]),
  });
  const initial = system.getSnapshot();
  const initialMetrics = system.getMetricsSnapshot();
  assert.deepEqual(initialMetrics, {
    availableCount: 1,
    totalRemainingEnergy: 2,
    totalCreated: 1,
    totalDepleted: 0,
  });

  system.resolveConsumption([{ beingId: 1, foodId: 1, requestedEnergy: 0.5 }]);
  assert.notStrictEqual(system.getSnapshot(), initial);
  assert.equal(system.getSnapshot()[0].remainingEnergy, 1.5);
  assert.deepEqual(system.getMetricsSnapshot(), {
    availableCount: 1,
    totalRemainingEnergy: 1.5,
    totalCreated: 1,
    totalDepleted: 0,
  });
  assert.notStrictEqual(system.getMetricsSnapshot(), initialMetrics);
  system.resolveConsumption([{ beingId: 1, foodId: 1, requestedEnergy: 1.5 }]);
  assert.equal(system.getSnapshot().length, 0);
  assert.deepEqual(system.getMetricsSnapshot(), {
    availableCount: 0,
    totalRemainingEnergy: 0,
    totalCreated: 1,
    totalDepleted: 1,
  });
  system.processTick(1);
  assert.deepEqual(system.getSnapshot(), [
    foodSnapshot({ id: 2, column: 0, row: 0, energy: 2, createdTick: 1 }),
  ]);
  assert.deepEqual(system.getMetricsSnapshot(), {
    availableCount: 1,
    totalRemainingEnergy: 2,
    totalCreated: 2,
    totalDepleted: 1,
  });
});

test("inatividade realoca no tick limite com novo ID e outro tile", () => {
  const relocationRandom = createRandomSequence([0]);
  const spawnRandom = createRandomSequence([0]);
  const system = createFoodSystem({
    mapSnapshot: createMapSnapshot([0.2, 0.8]),
    config: createFoodConfig({ initialCount: 1, maxCount: 2 }),
    spawnIntervalTicks: 3,
    inactivityTimeoutTicks: 2,
    initialRandom: createRandomSequence([0]),
    spawnRandom,
    relocationRandom,
    initialInactivityRandom: createRandomSequence([0]),
    spawnInactivityRandom: createRandomSequence([0]),
    relocationInactivityRandom: createRandomSequence([0]),
  });

  system.processTick(1);
  system.resolveConsumption([]);
  assert.equal(system.getSnapshot()[0].inactivityRemainingTicks, 1);
  system.processTick(2);
  system.resolveConsumption([]);

  assert.deepEqual(system.getSnapshot(), [{
    id: 2,
    column: 1,
    row: 0,
    initialEnergy: 42,
    remainingEnergy: 42,
    createdTick: 2,
    lastConsumedTick: 2,
    inactivityTimeoutTicks: 2,
    inactivityRemainingTicks: 2,
  }]);
  assert.equal(relocationRandom.calls, 1);
  assert.equal(spawnRandom.calls, 0);
  assert.deepEqual(system.getMetricsSnapshot(), {
    availableCount: 1,
    totalRemainingEnergy: 42,
    totalCreated: 2,
    totalDepleted: 0,
  });
  system.processTick(3);
  assert.equal(spawnRandom.calls, 1);
});

test("consumo no tick limite reinicia a inatividade antes da expiração", () => {
  const system = createFoodSystem({
    mapSnapshot: createMapSnapshot([0.5, 1]),
    config: createFoodConfig({
      initialCount: 1,
      maxCount: 1,
      minEnergy: 2,
      maxEnergy: 2,
    }),
    spawnIntervalTicks: 100,
    inactivityTimeoutTicks: 2,
    initialRandom: createRandomSequence([0]),
    spawnRandom: createRandomSequence([]),
    relocationRandom: createRandomSequence([0]),
    initialInactivityRandom: createRandomSequence([0]),
    relocationInactivityRandom: createRandomSequence([0]),
  });

  system.processTick(1);
  system.resolveConsumption([]);
  system.processTick(2);
  system.resolveConsumption([{ beingId: 1, foodId: 1, requestedEnergy: 0.5 }]);
  assert.equal(system.getSnapshot()[0].id, 1);
  assert.equal(system.getSnapshot()[0].lastConsumedTick, 2);
  assert.equal(system.getSnapshot()[0].inactivityRemainingTicks, 2);
  system.processTick(3);
  system.resolveConsumption([]);
  assert.equal(system.getSnapshot()[0].id, 1);
  system.processTick(4);
  system.resolveConsumption([]);
  assert.equal(system.getSnapshot()[0].id, 2);
});

test("timeout zero desativa expiração e falta de destino não consome aleatoriedade", () => {
  const disabledInactivityRandom = createRandomSequence([]);
  const disabled = createFoodSystem({
    mapSnapshot: createMapSnapshot([1]),
    config: createFoodConfig({ maxCount: 1 }),
    spawnIntervalTicks: 100,
    initialRandom: createRandomSequence([0]),
    spawnRandom: createRandomSequence([]),
    initialInactivityRandom: disabledInactivityRandom,
  });
  for (let tick = 1; tick <= 3; tick += 1) {
    disabled.processTick(tick);
    disabled.resolveConsumption([]);
  }
  assert.equal(disabled.getSnapshot()[0].id, 1);
  assert.equal(disabledInactivityRandom.calls, 0);

  const relocationRandom = createRandomSequence([]);
  const relocationInactivityRandom = createRandomSequence([]);
  const noDestination = createFoodSystem({
    mapSnapshot: createMapSnapshot([1]),
    config: createFoodConfig({ maxCount: 1 }),
    spawnIntervalTicks: 100,
    inactivityTimeoutTicks: 1,
    initialRandom: createRandomSequence([0]),
    spawnRandom: createRandomSequence([]),
    relocationRandom,
    initialInactivityRandom: createRandomSequence([0]),
    relocationInactivityRandom,
  });
  noDestination.processTick(1);
  noDestination.resolveConsumption([]);
  assert.deepEqual(noDestination.getSnapshot(), []);
  assert.equal(relocationRandom.calls, 0);
  assert.equal(relocationInactivityRandom.calls, 0);
});

test("expirações simultâneas são realocadas em ordem crescente de ID", () => {
  const relocationRandom = createRandomSequence([0, 0]);
  const system = createFoodSystem({
    mapSnapshot: createMapSnapshot([1, 1, 1, 1]),
    config: createFoodConfig({ initialCount: 2, maxCount: 2 }),
    spawnIntervalTicks: 100,
    inactivityTimeoutTicks: 1,
    initialRandom: createRandomSequence([0, 0]),
    spawnRandom: createRandomSequence([]),
    relocationRandom,
    initialInactivityRandom: createRandomSequence([0, 0]),
    relocationInactivityRandom: createRandomSequence([0, 0]),
  });

  system.processTick(1);
  system.resolveConsumption([]);
  assert.deepEqual(
    system.getSnapshot().map(({ id, column }) => ({ id, column })),
    [{ id: 3, column: 1 }, { id: 4, column: 0 }],
  );
  assert.equal(relocationRandom.calls, 2);
});
