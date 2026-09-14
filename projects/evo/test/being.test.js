import assert from "node:assert/strict";
import test from "node:test";

import { createConfig, DEFAULT_CONFIG } from "../src/config.js";
import { Being } from "../src/core/being.js";

function createBeing(overrides = {}) {
  const config = createConfig({ being: overrides });
  return new Being({
    id: 1,
    x: 2,
    y: 2,
    directionRadians: 0,
    config: config.being,
    physicsHz: config.time.physicsHz,
  });
}

function environment({
  dtSeconds = 1,
  tileType = "land",
  width = 10,
  height = 10,
  movement = DEFAULT_CONFIG.movement,
  energy = DEFAULT_CONFIG.energy,
  water = DEFAULT_CONFIG.water,
} = {}) {
  return {
    dtSeconds,
    worldWidthTiles: width,
    worldHeightTiles: height,
    getTileType: () => tileType,
    movement,
    energy,
    water,
  };
}

test("Being valida dados e expõe snapshot profundamente imutável", () => {
  const being = createBeing();
  const snapshot = being.getSnapshot();

  assert.deepEqual(snapshot, {
    id: 1,
    x: 2,
    y: 2,
    directionRadians: 0,
    speed: 0,
    turn: 0,
    life: 100,
    energy: 60,
    ageSeconds: 0,
    alive: true,
    isFeeding: false,
    feedingFoodId: null,
    absorbedEnergy: 0,
    fitness: 0,
    eyes: [],
    underBodyEye: null,
    brain: null,
  });
  assert(Object.isFrozen(being));
  assert(Object.isFrozen(snapshot));
  assert(Object.isFrozen(snapshot.eyes));
  assert.strictEqual(being.getSnapshot(), snapshot);
  assert.throws(() => { snapshot.energy = 0; }, TypeError);
  assert.throws(
    () => new Being({ id: 0, x: 0, y: 0, directionRadians: 0, config: DEFAULT_CONFIG.being, physicsHz: 30 }),
    /ID do ser/,
  );
});

test("movimento, ré, giro e reflexão seguem coordenadas contínuas", () => {
  const forward = createBeing();
  forward.applyAction({ speed: 0.5, turn: 0 }, environment());
  assert.equal(forward.getSnapshot().x, 2.5);
  assert.equal(forward.getSnapshot().energy, 58.25);

  const reverse = createBeing();
  reverse.applyAction({ speed: -1, turn: 0 }, environment());
  assert.equal(reverse.getSnapshot().x, 1);

  const turning = createBeing();
  turning.applyAction({ speed: 0, turn: 0.5 }, environment());
  assert.equal(turning.getSnapshot().directionRadians, Math.round((Math.PI / 2) * 1e9) / 1e9);
  assert.equal(turning.getSnapshot().energy, 58.75);

  const reflected = new Being({
    id: 1,
    x: 9.8,
    y: 5,
    directionRadians: 0,
    config: DEFAULT_CONFIG.being,
    physicsHz: 30,
  });
  reflected.applyAction({ speed: 1, turn: 0 }, environment());
  assert.equal(reflected.getSnapshot().x, 9.2);
  assert.equal(reflected.getSnapshot().directionRadians, Math.round(Math.PI * 1e9) / 1e9);
});

test("água triplica somente o movimento e energia zero impede ação", () => {
  const water = createBeing();
  water.applyAction({ speed: 0.5, turn: 0 }, environment({ tileType: "water" }));
  assert.equal(water.getSnapshot().energy, 56.25);

  const empty = createBeing({ initialEnergy: 0 });
  empty.applyAction({ speed: 1, turn: 1 }, environment());
  assert.equal(empty.getSnapshot().x, 2);
  assert.equal(empty.getSnapshot().directionRadians, 0);
  assert.equal(empty.getSnapshot().speed, 0);
  assert.equal(empty.getSnapshot().turn, 0);
});

test("políticas configuráveis alteram custos, fome e cura pelas fórmulas normativas", () => {
  const config = createConfig({
    movement: {
      costCoefficient: 8,
      costExponent: 1,
      turnCostAtMaxPerSecond: 2,
    },
    energy: { basalMetabolismPerSecond: 1 },
    water: { movementCostMultiplier: 2 },
    life: { zeroEnergyDamagePerSecond: 12 },
    healing: { energyThreshold: 70, energyPerLife: 3, maxLifePerSecond: 3 },
  });
  const moving = createBeing();
  moving.applyAction(
    { speed: 0.5, turn: 0.5 },
    environment({ movement: config.movement, energy: config.energy, water: config.water }),
  );
  assert.equal(moving.getSnapshot().energy, 54);

  const swimming = createBeing();
  swimming.applyAction(
    { speed: 0.5, turn: 0.5 },
    environment({
      tileType: "water",
      movement: config.movement,
      energy: config.energy,
      water: config.water,
    }),
  );
  assert.equal(swimming.getSnapshot().energy, 50);

  const hungry = createBeing({ initialEnergy: 0 });
  hungry.finishTick({ life: config.life, healing: config.healing });
  assert.equal(hungry.getSnapshot().life, 99.6);

  const healing = createBeing({ initialLife: 90, initialEnergy: 100 });
  healing.finishTick({ life: config.life, healing: config.healing });
  assert.equal(healing.getSnapshot().life, 90.1);
  assert.equal(healing.getSnapshot().energy, 99.7);
});

test("fome, cura, idade e fitness usam ticks e energia quantizada", () => {
  const hungry = createBeing({ initialEnergy: 0 });
  hungry.finishTick({ life: DEFAULT_CONFIG.life, healing: DEFAULT_CONFIG.healing });
  assert.equal(hungry.getSnapshot().life, 99.333333);
  assert.equal(hungry.getSnapshot().ageSeconds, 0.033333);
  assert.equal(hungry.getSnapshot().fitness, 0.033333);

  const healing = createBeing({ initialLife: 90, initialEnergy: 100 });
  healing.finishTick({ life: DEFAULT_CONFIG.life, healing: DEFAULT_CONFIG.healing });
  assert.equal(healing.getSnapshot().life, 90.033333);
  assert.equal(healing.getSnapshot().energy, 99.933334);
});

test("consumo escolhe a comida mais próxima e desempata pelo menor ID", () => {
  const being = new Being({
    id: 7,
    x: 1.5,
    y: 1.5,
    directionRadians: 0,
    config: DEFAULT_CONFIG.being,
    physicsHz: 30,
  });
  const foods = [
    Object.freeze({ id: 2, column: 0, row: 1, remainingEnergy: 10 }),
    Object.freeze({ id: 1, column: 2, row: 1, remainingEnergy: 10 }),
  ];
  const request = being.createConsumptionRequest(foods, DEFAULT_CONFIG.food, 1 / 30);

  assert.deepEqual(request, { beingId: 7, foodId: 1, requestedEnergy: 0.1 });
  assert.equal(being.getSnapshot().isFeeding, true);
  assert.equal(being.getSnapshot().feedingFoodId, 1);
  being.applyConsumptionGrant({ foodId: 1, energy: 0.1 });
  assert.equal(being.getSnapshot().energy, 60.1);
  assert.equal(being.getSnapshot().absorbedEnergy, 0.1);
  assert.equal(being.getSnapshot().fitness, 0.1);
});

test("refeição inicia somente abaixo do limiar e continua até a energia máxima", () => {
  const food = Object.freeze({ id: 4, column: 2, row: 1, remainingEnergy: 100 });
  const belowThresholdConfig = createConfig({ being: { initialEnergy: 89.999999 } });
  const feeding = new Being({
    id: 1,
    x: 1.5,
    y: 1.5,
    directionRadians: 0,
    config: belowThresholdConfig.being,
    physicsHz: 30,
  });
  const atThresholdConfig = createConfig({ being: { initialEnergy: 90 } });
  const blocked = new Being({
    id: 2,
    x: 1.5,
    y: 1.5,
    directionRadians: 0,
    config: atThresholdConfig.being,
    physicsHz: 30,
  });

  assert.equal(blocked.createConsumptionRequest([food], DEFAULT_CONFIG.food, 1 / 30), null);
  while (feeding.energy < DEFAULT_CONFIG.being.maxEnergy) {
    const request = feeding.createConsumptionRequest([food], DEFAULT_CONFIG.food, 1 / 30);
    assert.equal(request.foodId, food.id);
    feeding.applyConsumptionGrant({ foodId: food.id, energy: request.requestedEnergy });
  }

  assert.equal(feeding.getSnapshot().energy, 100);
  assert.equal(feeding.getSnapshot().isFeeding, false);
  assert.equal(feeding.getSnapshot().feedingFoodId, null);
  assert.equal(feeding.createConsumptionRequest([food], DEFAULT_CONFIG.food, 1 / 30), null);
});

test("refeição mantém a comida alvo e troca somente quando ainda está abaixo do limiar", () => {
  const being = createBeing();
  const first = Object.freeze({ id: 8, column: 2, row: 1, remainingEnergy: 10 });
  const nearerAfterStart = Object.freeze({ id: 2, column: 1, row: 1, remainingEnergy: 10 });

  assert.equal(
    being.createConsumptionRequest([first], DEFAULT_CONFIG.food, 1 / 30).foodId,
    first.id,
  );
  assert.equal(
    being.createConsumptionRequest([first, nearerAfterStart], DEFAULT_CONFIG.food, 1 / 30).foodId,
    first.id,
  );
  assert.equal(
    being.createConsumptionRequest([nearerAfterStart], DEFAULT_CONFIG.food, 1 / 30).foodId,
    nearerAfterStart.id,
  );
  being.reconcileFeedingTarget([], DEFAULT_CONFIG.food);
  assert.equal(being.getSnapshot().isFeeding, false);

  const nearThresholdConfig = createConfig({ being: { initialEnergy: 89.9 } });
  const aboveThreshold = new Being({
    id: 3,
    x: 1.5,
    y: 1.5,
    directionRadians: 0,
    config: nearThresholdConfig.being,
    physicsHz: 30,
  });
  const request = aboveThreshold.createConsumptionRequest([first], DEFAULT_CONFIG.food, 1 / 30);
  aboveThreshold.applyConsumptionGrant({ foodId: first.id, energy: request.requestedEnergy });
  assert.equal(aboveThreshold.getSnapshot().energy, 90);
  assert.equal(
    aboveThreshold.createConsumptionRequest([nearerAfterStart], DEFAULT_CONFIG.food, 1 / 30),
    null,
  );
  assert.equal(aboveThreshold.getSnapshot().isFeeding, false);
});

test("refeição termina fora do alcance, com concessão inválida ou morte", () => {
  const target = Object.freeze({ id: 5, column: 2, row: 1, remainingEnergy: 10 });
  const being = createBeing();
  being.createConsumptionRequest([target], DEFAULT_CONFIG.food, 1 / 30);
  assert.throws(
    () => being.applyConsumptionGrant({ foodId: 6, energy: 0.1 }),
    /não pertence à refeição ativa/,
  );
  being.applyAction({ speed: -1, turn: 0 }, environment({ dtSeconds: 2 }));
  assert.equal(being.createConsumptionRequest([target], DEFAULT_CONFIG.food, 1 / 30), null);
  assert.equal(being.getSnapshot().isFeeding, false);

  const dyingConfig = createConfig({ being: { initialLife: 0.1, initialEnergy: 0 } });
  const dying = new Being({
    id: 7,
    x: 1.5,
    y: 1.5,
    directionRadians: 0,
    config: dyingConfig.being,
    physicsHz: 30,
  });
  dying.createConsumptionRequest([target], DEFAULT_CONFIG.food, 1 / 30);
  dying.finishTick({ life: DEFAULT_CONFIG.life, healing: DEFAULT_CONFIG.healing });
  assert.equal(dying.getSnapshot().alive, false);
  assert.equal(dying.getSnapshot().isFeeding, false);
  assert.equal(dying.getSnapshot().feedingFoodId, null);
});
