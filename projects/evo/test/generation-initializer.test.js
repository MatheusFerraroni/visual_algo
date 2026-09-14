import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { DEFAULT_CONFIG } from "../src/config.js";
import {
  GenerationInitializationError,
  GenerationInitializer,
} from "../src/core/generation-initializer.js";
import { WorldMap } from "../src/core/world-map.js";

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

test("evo-1 gera 40 posições únicas, centrais e na ilha principal", () => {
  const map = WorldMap.generate(DEFAULT_CONFIG.world, DEFAULT_CONFIG.seeds.map);
  const points = GenerationInitializer.createSpawnPoints({
    worldMap: map,
    mapSeed: DEFAULT_CONFIG.seeds.map,
    generation: 1,
    count: 40,
  });
  const mainIndexes = new Set(map.getMainIslandTiles().map(
    (tile) => (tile.row * DEFAULT_CONFIG.world.columns) + tile.column,
  ));
  const indexes = points.map(
    (point) => (point.row * DEFAULT_CONFIG.world.columns) + point.column,
  );

  assert.equal(new Set(indexes).size, 40);
  assert(indexes.every((index) => mainIndexes.has(index)));
  assert(points.every((point) => point.x === point.column + 0.5
    && point.y === point.row + 0.5));
  assert(Object.isFrozen(points));
  assert(points.every(Object.isFrozen));
  assert.equal(
    hash(points),
    "f596eb6904512a1006c07802783353ab26e49cd300fb3c795ebee1ed9d121085",
  );
});

test("mesma seed repete posições, gerações mudam e a população preserva prefixo", () => {
  const map = WorldMap.generate(DEFAULT_CONFIG.world, "evo-1");
  const createPoints = (generation, count) => GenerationInitializer.createSpawnPoints({
    worldMap: map,
    mapSeed: "evo-1",
    generation,
    count,
  });

  assert.deepEqual(createPoints(1, 40), createPoints(1, 40));
  assert.deepEqual(createPoints(1, 20), createPoints(1, 40).slice(0, 20));
  assert.notDeepEqual(createPoints(1, 40), createPoints(2, 40));
});

test("inicialização falha quando a ilha principal não comporta a população", () => {
  const tile = Object.freeze({ column: 0, row: 0, type: "land" });
  const tinyWorld = {
    getMainIslandTiles: () => Object.freeze([tile]),
  };

  assert.throws(
    () => GenerationInitializer.createSpawnPoints({
      worldMap: tinyWorld,
      mapSeed: "tiny",
      generation: 1,
      count: 2,
    }),
    (error) => error instanceof GenerationInitializationError
      && /menos que os 2 seres/.test(error.message),
  );
});
