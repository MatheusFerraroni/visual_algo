import assert from "node:assert/strict";
import test from "node:test";

import {
  BEING_STATUS_BAR_COLORS,
  createBeingStatusBarModel,
} from "../src/rendering/being-status-bars.js";

function createModel(overrides = {}, dimensions = {}) {
  return createBeingStatusBarModel({
    being: {
      alive: true,
      x: 2,
      y: 2,
      life: 50,
      energy: 75,
      ...overrides,
    },
    tileSizePx: dimensions.tileSizePx ?? 16,
    worldHeightPx: dimensions.worldHeightPx ?? 160,
    maxLife: 100,
    maxEnergy: 100,
  });
}

test("barras modelam vida acima da energia com proporções e cores normativas", () => {
  const model = createModel();

  assert.equal(model.placement, "above");
  assert.deepEqual(model.bars.map(({ kind, ratio }) => ({ kind, ratio })), [
    { kind: "life", ratio: 0.5 },
    { kind: "energy", ratio: 0.75 },
  ]);
  assert.strictEqual(model.bars[0].color, BEING_STATUS_BAR_COLORS.life);
  assert.strictEqual(model.bars[1].color, BEING_STATUS_BAR_COLORS.energy);
  assert.equal(model.bars[0].width, 11.52);
  assert.equal(model.bars[0].height, 0.96);
  assert(model.bars[0].y < model.bars[1].y);
  assert(Object.isFrozen(model));
  assert(Object.isFrozen(model.bars));
  assert(model.bars.every(Object.isFrozen));
  assert(Object.values(BEING_STATUS_BAR_COLORS).every(Object.isFrozen));
});

test("barras limitam preenchimentos e não são criadas para seres mortos", () => {
  const model = createModel({ life: -10, energy: 150 });

  assert.equal(model.bars[0].ratio, 0);
  assert.equal(model.bars[1].ratio, 1);
  assert.equal(createModel({ alive: false }), null);
});

test("geometria usa espaço do mundo e cresce proporcionalmente com o tile", () => {
  const normal = createModel();
  const doubled = createModel({}, { tileSizePx: 32, worldHeightPx: 320 });

  for (const key of ["x", "y", "width", "height"]) {
    assert.equal(doubled.bars[0][key], normal.bars[0][key] * 2);
    assert.equal(doubled.bars[1][key], normal.bars[1][key] * 2);
  }
});

test("barras passam para baixo do corpo próximo à borda superior", () => {
  const model = createModel({ y: 0.5 });

  assert.equal(model.placement, "below");
  assert(model.bars[0].y > 0.5 * 16);
  assert(model.bars[1].y > model.bars[0].y);
});

test("modelo visual rejeita dados e dimensões inválidos", () => {
  assert.throws(
    () => createBeingStatusBarModel({ being: null }),
    /ser válido/,
  );
  assert.throws(
    () => createBeingStatusBarModel({
      being: { alive: true, x: 0, y: 0, life: 1, energy: 1 },
      tileSizePx: 0,
      worldHeightPx: 10,
      maxLife: 1,
      maxEnergy: 1,
    }),
    /devem ser positivos/,
  );
});
