import assert from "node:assert/strict";
import test from "node:test";

import { createConfig, DEFAULT_CONFIG } from "../src/config.js";
import { PopulationSystem } from "../src/core/population-system.js";
import { WorldMap } from "../src/core/world-map.js";

function createOptions(initialGenomes) {
  return {
    worldMap: WorldMap.generate(DEFAULT_CONFIG.world, DEFAULT_CONFIG.seeds.map),
    config: DEFAULT_CONFIG,
    generation: 2,
    mapSeed: DEFAULT_CONFIG.seeds.map,
    simulationSeed: DEFAULT_CONFIG.seeds.simulation,
    initialFoods: [],
    initialGenomes,
  };
}

test("PopulationSystem instala genomas explícitos por ID e expõe candidatos congelados", () => {
  const genomes = Array.from(
    { length: DEFAULT_CONFIG.population.size },
    (_, index) => Array(DEFAULT_CONFIG.derived.networkGeneCount).fill(index / 100),
  );
  const population = new PopulationSystem(createOptions(genomes));
  const candidates = population.getEvolutionCandidates();

  assert.deepEqual(population.getGenome(1), genomes[0]);
  assert.deepEqual(population.getGenome(40), genomes[39]);
  assert.equal(candidates.length, 40);
  assert.deepEqual(candidates[0], {
    id: 1,
    fitness: 0,
    genome: population.getGenome(1),
  });
  assert(Object.isFrozen(candidates));
  assert(candidates.every(Object.isFrozen));
  assert(candidates.every((candidate) => Object.isFrozen(candidate.genome)));
});

test("PopulationSystem rejeita lotes explícitos incompletos ou incompatíveis", () => {
  assert.throws(
    () => new PopulationSystem(createOptions([])),
    /exatamente 40 genomas/,
  );
  const genomes = Array.from(
    { length: DEFAULT_CONFIG.population.size },
    () => Array(DEFAULT_CONFIG.derived.networkGeneCount).fill(0),
  );
  genomes[2] = [0];
  assert.throws(
    () => new PopulationSystem(createOptions(genomes)),
    /genoma inicial 3 deve conter 230 genes/,
  );
});

test("PopulationSystem amostra alcance seguro e refeição ativa nos ticks neurais", () => {
  const config = createConfig({
    population: { size: 1 },
    genetics: { eliteCount: 1, tournamentSize: 1 },
    eyes: { count: 1 },
    network: { hiddenLayers: [] },
  });
  const landTile = Object.freeze({ index: 1_290, column: 10, row: 10, type: "land" });
  const worldMap = Object.freeze({
    getMainIslandTiles: () => Object.freeze([landTile]),
    getSnapshot: () => Object.freeze({ columns: 128, rows: 128 }),
    getTile: (column, row) => Object.freeze({ column, row, type: "land" }),
  });
  const foods = Object.freeze([
    Object.freeze({ id: 1, column: 10, row: 10, remainingEnergy: 50 }),
  ]);
  const foodSystem = Object.freeze({
    getSnapshot: () => foods,
    resolveConsumption: (requests) => Object.freeze(requests.map((request) => Object.freeze({
      beingId: request.beingId,
      foodId: request.foodId,
      energy: request.requestedEnergy,
    }))),
  });
  const population = new PopulationSystem({
    worldMap,
    config,
    generation: 1,
    mapSeed: "map",
    simulationSeed: "simulation",
    initialFoods: foods,
    initialGenomes: [Array(config.derived.networkGeneCount).fill(0)],
  });

  assert.equal(population.getSnapshot()[0].brain.inputs[2], 1);
  assert.equal(population.getSnapshot()[0].brain.inputs[3], 0);
  for (let tick = 1; tick <= 4; tick += 1) {
    population.processTick(tick, foodSystem);
  }
  assert.equal(population.getSnapshot()[0].isFeeding, true);
  assert.equal(population.getSnapshot()[0].brain.inputs[2], 1);
  assert.equal(population.getSnapshot()[0].brain.inputs[3], 1);
});
