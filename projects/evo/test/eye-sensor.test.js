import assert from "node:assert/strict";
import test from "node:test";

import { EyeSensor } from "../src/core/eye-sensor.js";

function createMap(rows) {
  const height = rows.length;
  const width = rows[0].length;
  const tiles = rows.flatMap((row, rowIndex) => [...row].map((type, column) => Object.freeze({
    column,
    row: rowIndex,
    type: type === "W" ? "water" : "land",
    elevation: 0,
    productivity: 0,
  })));
  const snapshot = Object.freeze({ columns: width, rows: height });
  return Object.freeze({
    getSnapshot: () => snapshot,
    getTile: (column, row) => (
      column < 0 || row < 0 || column >= width || row >= height
        ? null
        : tiles[(row * width) + column]
    ),
  });
}

const LAND_MAP = createMap([
  "LLLLLL",
  "LLLLLL",
  "LLLLLL",
  "LLLLLL",
  "LLLLLL",
  "LLLLLL",
]);

test("setores seguem esquerda-direita e fronteira interna pertence à direita", () => {
  const sensor = new EyeSensor({ count: 2, fieldOfViewDegrees: 90, rangeTiles: 5 });
  const eyes = sensor.observe({
    position: { x: 2.5, y: 2.5, directionRadians: 0 },
    foods: [
      { id: 3, column: 3, row: 1 },
      { id: 2, column: 3, row: 2 },
    ],
    worldMap: LAND_MAP,
  });

  assert.equal(eyes[0].detectedFoodId, 3);
  assert.equal(eyes[1].detectedFoodId, 2);
  assert.equal(eyes[0].foodDistanceTiles, 1.414214);
  assert.equal(eyes[1].foodDistanceTiles, 1);
  assert(Object.isFrozen(eyes));
  assert(eyes.every(Object.isFrozen));
});

test("comida mais próxima vence e distância igual usa menor ID", () => {
  const sensor = new EyeSensor({ count: 1, fieldOfViewDegrees: 120, rangeTiles: 6 });
  const [eye] = sensor.observe({
    position: { x: 1.5, y: 2.5, directionRadians: 0 },
    foods: [
      { id: 9, column: 3, row: 1 },
      { id: 4, column: 3, row: 3 },
      { id: 1, column: 5, row: 2 },
    ],
    worldMap: LAND_MAP,
  });

  assert.equal(eye.detectedFoodId, 4);
  assert.equal(eye.foodDistanceTiles, 2.236068);
  assert.equal(eye.foodProximity, 0.627322);
});

test("raio em terra encontra primeira água, a borda e respeita alcance", () => {
  const bordered = createMap([
    "WWWWW",
    "WLLLW",
    "WLLLW",
    "WLLLW",
    "WWWWW",
  ]);
  const sensor = new EyeSensor({ count: 1, fieldOfViewDegrees: 30, rangeTiles: 5 });
  const [water] = sensor.observe({
    position: { x: 2.5, y: 2.5, directionRadians: 0 },
    foods: [],
    worldMap: bordered,
  });
  assert.equal(water.boundaryDistanceTiles, 1.5);
  assert.equal(water.boundaryProximity, 0.7);

  const [border] = sensor.observe({
    position: { x: 2.5, y: 2.5, directionRadians: 0 },
    foods: [],
    worldMap: createMap(["LLLLL", "LLLLL", "LLLLL", "LLLLL", "LLLLL"]),
  });
  assert.equal(border.boundaryDistanceTiles, 2.5);
  assert.equal(border.boundaryProximity, 0.5);

  const shortSensor = new EyeSensor({ count: 1, fieldOfViewDegrees: 30, rangeTiles: 1 });
  const [limited] = shortSensor.observe({
    position: { x: 2.5, y: 2.5, directionRadians: 0 },
    foods: [],
    worldMap: bordered,
  });
  assert.equal(limited.boundaryDistanceTiles, null);
  assert.equal(limited.boundaryProximity, 0);
});

test("raio em água encontra a primeira terra em vez de zerar a distância", () => {
  const sensor = new EyeSensor({ count: 1, fieldOfViewDegrees: 30, rangeTiles: 5 });
  const [eye] = sensor.observe({
    position: { x: 0.5, y: 1.5, directionRadians: 0 },
    foods: [],
    worldMap: createMap(["WWWWW", "WWLWW", "WWWWW"]),
  });

  assert.equal(eye.boundaryDistanceTiles, 1.5);
  assert.equal(eye.boundaryProximity, 0.7);
});

test("costa diagonal usa a primeira célula atravessada no canto", () => {
  const sensor = new EyeSensor({ count: 1, fieldOfViewDegrees: 30, rangeTiles: 4 });
  const [eye] = sensor.observe({
    position: { x: 0.5, y: 0.5, directionRadians: Math.PI / 4 },
    foods: [],
    worldMap: createMap(["WWW", "WLW", "WWW"]),
  });

  assert.equal(eye.boundaryDistanceTiles, 0.707107);
  assert.equal(eye.boundaryProximity, 0.823223);
  assert(Object.isFrozen(eye));
});

test("posição sobre a borda externa detecta distância zero", () => {
  const sensor = new EyeSensor({ count: 1, fieldOfViewDegrees: 30, rangeTiles: 4 });
  const [eye] = sensor.observe({
    position: { x: 0, y: 1.5, directionRadians: 0 },
    foods: [],
    worldMap: createMap(["LLL", "LLL", "LLL"]),
  });

  assert.equal(eye.boundaryDistanceTiles, 0);
  assert.equal(eye.boundaryProximity, 1);
});

test("olho inferior identifica deterministicamente o terreno sob o ser", () => {
  const sensor = new EyeSensor({ count: 1, fieldOfViewDegrees: 30, rangeTiles: 4 });
  const map = createMap([
    "LLL",
    "LWL",
    "LLL",
  ]);

  const water = sensor.observeUnderBody({
    position: { x: 1.5, y: 1.5 },
    worldMap: map,
  });
  const land = sensor.observeUnderBody({
    position: { x: 2.5, y: 1.5 },
    worldMap: map,
  });

  assert.deepEqual(water, { terrainType: "water", waterProximity: 1 });
  assert.deepEqual(land, { terrainType: "land", waterProximity: 0 });
  assert(Object.isFrozen(water));
  assert(Object.isFrozen(land));
});
