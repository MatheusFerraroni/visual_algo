import assert from "node:assert/strict";
import test from "node:test";

import { findFoodWithinDistance } from "../src/core/food-proximity.js";

const foods = Object.freeze([
  Object.freeze({ id: 3, column: 2, row: 1 }),
  Object.freeze({ id: 1, column: 0, row: 1 }),
  Object.freeze({ id: 2, column: 1, row: 3 }),
]);

test("busca de comida usa distância euclidiana inclusiva em 360 graus", () => {
  assert.equal(findFoodWithinDistance({
    foods,
    x: 1.5,
    y: 1.5,
    maxDistanceTiles: 1,
  }).id, 1);
  assert.equal(findFoodWithinDistance({
    foods,
    x: 1.6,
    y: 1.5,
    maxDistanceTiles: 0.9,
  }).id, 3);
  assert.equal(findFoodWithinDistance({
    foods: [foods[0]],
    x: 1.599,
    y: 1.5,
    maxDistanceTiles: 0.9,
  }), null);
});

test("busca escolhe a comida mais próxima, desempata por ID e pode prender um alvo", () => {
  assert.equal(findFoodWithinDistance({
    foods,
    x: 1.5,
    y: 1.5,
    maxDistanceTiles: 2,
  }).id, 1);
  assert.equal(findFoodWithinDistance({
    foods,
    x: 1.5,
    y: 1.5,
    maxDistanceTiles: 2,
    foodId: 3,
  }).id, 3);
  assert.equal(findFoodWithinDistance({
    foods,
    x: 1.5,
    y: 1.5,
    maxDistanceTiles: 1,
    foodId: 2,
  }), null);
});

test("busca de comida falha fechada para argumentos inválidos", () => {
  assert.throws(
    () => findFoodWithinDistance({ foods: null, x: 0, y: 0, maxDistanceTiles: 1 }),
    /lista de comidas/,
  );
  assert.throws(
    () => findFoodWithinDistance({ foods, x: 0, y: 0, maxDistanceTiles: 0 }),
    /distância máxima/,
  );
  assert.throws(
    () => findFoodWithinDistance({ foods, x: 0, y: 0, maxDistanceTiles: 1, foodId: 0 }),
    /ID da comida/,
  );
});
