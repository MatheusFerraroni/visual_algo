import assert from "node:assert/strict";
import test from "node:test";

import { PerlinNoise2D } from "../src/core/perlin-noise-2d.js";
import { SeededRandom } from "../src/core/seeded-random.js";

test("Improved Perlin 2D mantém o vetor dourado da seed evo-1", () => {
  const noise = new PerlinNoise2D(
    SeededRandom.fromSeed("evo-1").fork("terrain"),
  );

  assert.deepEqual(
    [
      noise.noise(0, 0),
      noise.noise(0.075, 0.15),
      noise.noise(1.25, 2.75),
      noise.noise(-0.5, 4.125),
    ],
    [
      0.5,
      0.5336824299899271,
      0.6348843574523926,
      0.5812091827392578,
    ],
  );
});

test("Perlin é repetível e seeds diferentes alteram o campo", () => {
  const first = new PerlinNoise2D(SeededRandom.fromSeed("ilha-a").fork("terrain"));
  const repeated = new PerlinNoise2D(SeededRandom.fromSeed("ilha-a").fork("terrain"));
  const other = new PerlinNoise2D(SeededRandom.fromSeed("ilha-b").fork("terrain"));
  const coordinates = [[0.1, 0.2], [1.7, 3.1], [9.25, 4.75]];

  const values = coordinates.map(([x, y]) => first.noise(x, y));
  assert.deepEqual(values, coordinates.map(([x, y]) => repeated.noise(x, y)));
  assert.notDeepEqual(values, coordinates.map(([x, y]) => other.noise(x, y)));
});
