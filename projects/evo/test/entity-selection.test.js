import assert from "node:assert/strict";
import test from "node:test";

import { pickEntityAt } from "../src/rendering/entity-selection.js";

function createSnapshot({ beings = [], foods = [] } = {}) {
  return {
    map: { tileSizePx: 16 },
    beings,
    foods,
  };
}

test("ser vivo tem prioridade sobre comida sobreposta", () => {
  const selection = pickEntityAt({
    snapshot: createSnapshot({
      beings: [{ id: 7, x: 1.5, y: 2.5, alive: true }],
      foods: [{ id: 2, column: 1, row: 2 }],
    }),
    worldX: 24,
    worldY: 40,
  });

  assert.deepEqual(selection, { type: "being", id: 7 });
  assert(Object.isFrozen(selection));
});

test("comida é selecionada quando não há ser vivo no raio", () => {
  const snapshot = createSnapshot({
    beings: [{ id: 1, x: 1.5, y: 2.5, alive: false }],
    foods: [
      { id: 4, column: 2, row: 2 },
      { id: 2, column: 1, row: 2 },
    ],
  });

  assert.deepEqual(pickEntityAt({ snapshot, worldX: 24, worldY: 40 }), {
    type: "food",
    id: 2,
  });
  assert.equal(pickEntityAt({ snapshot, worldX: 200, worldY: 200 }), null);
});

test("distância e menor ID desempataram entidades do mesmo tipo", () => {
  const snapshot = createSnapshot({
    beings: [
      { id: 5, x: 1, y: 1.5, alive: true },
      { id: 3, x: 2, y: 1.5, alive: true },
    ],
  });
  assert.deepEqual(pickEntityAt({ snapshot, worldX: 24, worldY: 24 }), {
    type: "being",
    id: 3,
  });
});

test("seleção rejeita snapshot e coordenadas incompatíveis", () => {
  assert.throws(
    () => pickEntityAt({ snapshot: null, worldX: 0, worldY: 0 }),
    /snapshot válido/,
  );
  assert.throws(
    () => pickEntityAt({ snapshot: createSnapshot(), worldX: Infinity, worldY: 0 }),
    /coordenadas finitas/,
  );
});
