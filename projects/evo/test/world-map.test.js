import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createConfig, DEFAULT_CONFIG } from "../src/config.js";
import { Tile } from "../src/core/tile.js";
import { MapGenerationError, WorldMap } from "../src/core/world-map.js";

function hashSnapshot(snapshot) {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

function getLandComponentSizes(snapshot) {
  const land = new Set(
    snapshot.tiles
      .filter((tile) => tile.type === "land")
      .map((tile) => (tile.row * snapshot.columns) + tile.column),
  );
  const visited = new Set();
  const sizes = [];

  for (const start of land) {
    if (visited.has(start)) {
      continue;
    }
    const queue = [start];
    visited.add(start);

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor];
      const column = index % snapshot.columns;
      const row = Math.floor(index / snapshot.columns);
      const neighbors = [];
      if (column > 0) neighbors.push(index - 1);
      if (column + 1 < snapshot.columns) neighbors.push(index + 1);
      if (row > 0) neighbors.push(index - snapshot.columns);
      if (row + 1 < snapshot.rows) neighbors.push(index + snapshot.columns);

      for (const neighbor of neighbors) {
        if (land.has(neighbor) && !visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    sizes.push(queue.length);
  }

  return sizes.sort((first, second) => second - first);
}

function getLakeComponentSizes(snapshot) {
  const water = new Set(
    snapshot.tiles
      .filter((tile) => tile.type === "water")
      .map((tile) => (tile.row * snapshot.columns) + tile.column),
  );
  const visited = new Set();
  const sizes = [];

  for (const start of water) {
    if (visited.has(start)) {
      continue;
    }
    const queue = [start];
    let touchesBorder = false;
    visited.add(start);

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor];
      const column = index % snapshot.columns;
      const row = Math.floor(index / snapshot.columns);
      touchesBorder ||= column === 0 || row === 0
        || column === snapshot.columns - 1 || row === snapshot.rows - 1;
      const neighbors = [];
      if (column > 0) neighbors.push(index - 1);
      if (column + 1 < snapshot.columns) neighbors.push(index + 1);
      if (row > 0) neighbors.push(index - snapshot.columns);
      if (row + 1 < snapshot.rows) neighbors.push(index + snapshot.columns);

      for (const neighbor of neighbors) {
        if (water.has(neighbor) && !visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    if (!touchesBorder) {
      sizes.push(queue.length);
    }
  }

  return sizes.sort((first, second) => second - first);
}

function getWaterDistances(snapshot) {
  const distances = new Int32Array(snapshot.tiles.length);
  distances.fill(-1);
  const queue = [];

  for (let index = 0; index < snapshot.tiles.length; index += 1) {
    if (snapshot.tiles[index].type === "water") {
      distances[index] = 0;
      queue.push(index);
    }
  }

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor];
    const column = index % snapshot.columns;
    const row = Math.floor(index / snapshot.columns);
    const neighbors = [];
    if (column > 0) neighbors.push(index - 1);
    if (column + 1 < snapshot.columns) neighbors.push(index + 1);
    if (row > 0) neighbors.push(index - snapshot.columns);
    if (row + 1 < snapshot.rows) neighbors.push(index + snapshot.columns);

    for (const neighbor of neighbors) {
      if (distances[neighbor] === -1) {
        distances[neighbor] = distances[index] + 1;
        queue.push(neighbor);
      }
    }
  }

  return distances;
}

function mean(values) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

test("Tile valida seus dados e permanece imutável", () => {
  const tile = new Tile({
    column: 2,
    row: 3,
    type: "land",
    elevation: 0.7,
    productivity: 0.4,
  });

  assert(Object.isFrozen(tile));
  assert.throws(() => { tile.type = "water"; }, TypeError);
  assert.throws(
    () => new Tile({ column: 0, row: 0, type: "water", elevation: 0.2, productivity: 0.1 }),
    /produtividade zero/,
  );
});

test("mapa evo-1 mantém topologia, produtividade e hash dourados", () => {
  const map = WorldMap.generate(DEFAULT_CONFIG.world, "evo-1");
  const snapshot = map.getSnapshot();

  assert.equal(snapshot.landCount, 7_829);
  assert.equal(snapshot.waterCount, 8_555);
  assert.equal(snapshot.landFraction, 0.477844);
  assert.equal(snapshot.islandCount, 9);
  assert.equal(snapshot.largestIslandLandCount, 4_378);
  assert.equal(snapshot.lakeCount, 5);
  assert.equal(snapshot.lakeTileCount, 110);
  assert.equal(snapshot.layoutAttempt, 0);
  assert.equal(snapshot.totalProductivity, 5_760);
  assert.equal(snapshot.meanLandProductivity, 0.735726);
  assert.deepEqual(
    getLandComponentSizes(snapshot),
    [4_378, 459, 455, 454, 442, 428, 420, 404, 389],
  );
  assert.deepEqual(getLakeComponentSizes(snapshot), [32, 24, 20, 18, 16]);
  assert.deepEqual(snapshot.islands, [
    { rank: 1, landCount: 4_378, landFraction: 0.559203, totalProductivity: 2_798.116803, meanProductivity: 0.639131 },
    { rank: 2, landCount: 459, landFraction: 0.058628, totalProductivity: 392.547623, meanProductivity: 0.855224 },
    { rank: 3, landCount: 455, landFraction: 0.058117, totalProductivity: 389.332321, meanProductivity: 0.855675 },
    { rank: 4, landCount: 454, landFraction: 0.05799, totalProductivity: 388.528072, meanProductivity: 0.855789 },
    { rank: 5, landCount: 442, landFraction: 0.056457, totalProductivity: 378.863762, meanProductivity: 0.857158 },
    { rank: 6, landCount: 428, landFraction: 0.054669, totalProductivity: 367.557351, meanProductivity: 0.858779 },
    { rank: 7, landCount: 420, landFraction: 0.053647, totalProductivity: 361.081172, meanProductivity: 0.859717 },
    { rank: 8, landCount: 404, landFraction: 0.051603, totalProductivity: 348.094768, meanProductivity: 0.861621 },
    { rank: 9, landCount: 389, landFraction: 0.049687, totalProductivity: 335.878128, meanProductivity: 0.86344 },
  ]);
  assert.equal(
    hashSnapshot(snapshot),
    "6fd3dc0a302594b07940f04e93dc7ae1c87c82aab9d2abaadefd85b31b2fe643",
  );

  for (const tile of snapshot.tiles) {
    if (tile.column === 0 || tile.row === 0
      || tile.column === snapshot.columns - 1 || tile.row === snapshot.rows - 1) {
      assert.equal(tile.type, "water");
    }
    if (tile.type === "water") {
      assert.equal(tile.productivity, 0);
    }
    assert(Math.abs((tile.elevation * 1_000_000) - Math.round(tile.elevation * 1_000_000)) < 1e-8);
    assert(Math.abs((tile.productivity * 1_000_000) - Math.round(tile.productivity * 1_000_000)) < 1e-8);
  }
});

test("consultas respeitam limites, ordem row-major e snapshots cacheados", () => {
  const map = WorldMap.generate(DEFAULT_CONFIG.world, "evo-1");
  const snapshot = map.getSnapshot();

  assert.equal(map.getTile(0, 0).column, 0);
  assert.equal(map.getTile(127, 127).row, 127);
  assert.equal(map.getTile(-1, 0), null);
  assert.equal(map.getTile(0, 128), null);
  assert.equal(map.getTile(1.5, 2), null);
  assert.deepEqual(
    snapshot.tiles.slice(127, 130).map(({ column, row }) => [column, row]),
    [[127, 0], [0, 1], [1, 1]],
  );
  assert.strictEqual(map.getSnapshot(), snapshot);
  const mainIslandTiles = map.getMainIslandTiles();
  assert.equal(mainIslandTiles.length, snapshot.largestIslandLandCount);
  assert(Object.isFrozen(mainIslandTiles));
  assert(mainIslandTiles.every((tile) => tile.type === "land"));
  assert.deepEqual(
    [...mainIslandTiles].sort(
      (first, second) => ((first.row * snapshot.columns) + first.column)
        - ((second.row * snapshot.columns) + second.column),
    ),
    mainIslandTiles,
  );
  assert(Object.isFrozen(snapshot));
  assert(Object.isFrozen(snapshot.islands));
  assert(Object.isFrozen(snapshot.islands[0]));
  assert(Object.isFrozen(snapshot.tiles));
  assert(Object.isFrozen(snapshot.tiles[0]));
  assert.doesNotThrow(() => JSON.stringify(snapshot));
  assert.throws(() => { snapshot.tiles[0].type = "land"; }, TypeError);
});

test("mesma seed repete o mapa e seeds diferentes geram mapas diferentes", () => {
  const first = WorldMap.generate(DEFAULT_CONFIG.world, "evo-1").getSnapshot();
  const repeated = WorldMap.generate(DEFAULT_CONFIG.world, "evo-1").getSnapshot();
  const other = WorldMap.generate(DEFAULT_CONFIG.world, "map-2").getSnapshot();

  assert.deepEqual(first, repeated);
  assert.notEqual(hashSnapshot(first), hashSnapshot(other));
});

test("100 seeds preservam arquipélago equilibrado e lagos internos relevantes", () => {
  const settings = DEFAULT_CONFIG.world.terrain.archipelago;
  for (let index = 0; index < 100; index += 1) {
    const snapshot = WorldMap.generate(
      DEFAULT_CONFIG.world,
      `archipelago-acceptance-${index}`,
    ).getSnapshot();
    const componentSizes = getLandComponentSizes(snapshot);
    const lakeSizes = getLakeComponentSizes(snapshot);

    assert.equal(snapshot.islandCount, settings.secondaryIslandCount + 1);
    assert.equal(componentSizes.length, snapshot.islandCount);
    assert.equal(componentSizes[0], snapshot.largestIslandLandCount);
    assert(componentSizes.slice(1).every(
      (size) => size >= settings.minSecondaryIslandTiles,
    ));
    assert(snapshot.landFraction >= settings.minLandFraction);
    assert(snapshot.landFraction <= settings.maxLandFraction);
    assert(snapshot.islands[0].landFraction >= settings.minMainLandFraction);
    assert(snapshot.islands[0].landFraction <= settings.maxMainLandFraction);
    const centerTile = snapshot.tiles[
      (Math.floor(snapshot.rows / 2) * snapshot.columns) + Math.floor(snapshot.columns / 2)
    ];
    assert.equal(centerTile.type, "land");
    assert(snapshot.lakeCount >= settings.minLakeCount);
    assert.equal(lakeSizes.length, snapshot.lakeCount);
    assert.equal(lakeSizes.reduce((total, size) => total + size, 0), snapshot.lakeTileCount);
    assert(lakeSizes.every((size) => size >= 4));
  }
});

test("ilhas menores recebem produtividade média progressivamente maior", () => {
  const snapshot = WorldMap.generate(DEFAULT_CONFIG.world, "evo-1").getSnapshot();

  for (let index = 1; index < snapshot.islands.length; index += 1) {
    const larger = snapshot.islands[index - 1];
    const smaller = snapshot.islands[index];
    assert(larger.landCount >= smaller.landCount);
    assert(larger.meanProductivity <= smaller.meanProductivity);
  }
  assert(snapshot.islands.at(-1).meanProductivity > snapshot.islands[0].meanProductivity);
  assert.equal(
    snapshot.islands.reduce((total, island) => total + island.totalProductivity, 0)
      .toFixed(6),
    "5760.000000",
  );
});

test("proximidade de mares e lagos aumenta a produtividade terrestre", () => {
  const snapshot = WorldMap.generate(DEFAULT_CONFIG.world, "evo-1").getSnapshot();
  const distances = getWaterDistances(snapshot);
  const coastal = [];
  const nearWater = [];
  const inland = [];

  for (let index = 0; index < snapshot.tiles.length; index += 1) {
    const tile = snapshot.tiles[index];
    if (tile.type !== "land") {
      continue;
    }
    if (distances[index] === 1) {
      coastal.push(tile.productivity);
    } else if (distances[index] <= DEFAULT_CONFIG.world.productivity.waterProximityRangeTiles) {
      nearWater.push(tile.productivity);
    } else {
      inland.push(tile.productivity);
    }
  }

  assert(coastal.length > 0);
  assert(nearWater.length > 0);
  assert(inland.length > 0);
  assert(mean(coastal) > mean(nearWater));
  assert(mean(nearWater) > mean(inland));
});

test("massa estável torna mapas menores mais férteis em média", () => {
  const maps = [
    WorldMap.generate(DEFAULT_CONFIG.world, "small").getSnapshot(),
    WorldMap.generate(DEFAULT_CONFIG.world, "large").getSnapshot(),
  ].sort((first, second) => first.landCount - second.landCount);
  const [smaller, larger] = maps;

  assert(smaller.landCount < larger.landCount);
  assert.equal(smaller.totalProductivity, 5_760);
  assert.equal(larger.totalProductivity, 5_760);
  assert(smaller.meanLandProductivity > larger.meanLandProductivity);
});

test("geração falha fechada sem terra ou sem capacidade para a massa alvo", () => {
  const impossibleLayout = createConfig({
    world: {
      terrain: {
        archipelago: {
          satelliteOrbitMinFraction: 0.01,
          satelliteOrbitMaxFraction: 0.01,
        },
      },
    },
  });
  const insufficientWorld = structuredClone(DEFAULT_CONFIG.world);
  insufficientWorld.productivity.targetTotal = 12_000;

  assert.throws(
    () => WorldMap.generate(impossibleLayout.world, impossibleLayout.seeds.map),
    (error) => error instanceof MapGenerationError && /arquipélago válido/.test(error.message),
  );
  assert.throws(
    () => WorldMap.generate(insufficientWorld, DEFAULT_CONFIG.seeds.map),
    (error) => error instanceof MapGenerationError && /menos que a massa/.test(error.message),
  );
});
