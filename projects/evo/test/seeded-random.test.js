import assert from "node:assert/strict";
import test from "node:test";

import { SeededRandom } from "../src/core/seeded-random.js";

const GOLDEN_FLOATS = [
  0.4949729270301759,
  0.3232011329382658,
  0.61663533677347,
  0.5815648366697133,
  0.130888951709494,
  0.10409286175854504,
  0.0739507966209203,
  0.10242801276035607,
];

const GOLDEN_GAUSSIANS = [
  0.3294806315686981,
  1.0018407797846292,
  -1.041524931081792,
  0.42973110577340523,
];

function take(random, amount, method = "nextFloat") {
  return Array.from({ length: amount }, () => random[method]());
}

test("seed evo-1 mantém o vetor dourado xmur3 + sfc32", () => {
  assert.deepEqual(take(SeededRandom.fromSeed("evo-1"), 8), GOLDEN_FLOATS);
});

test("texto e número com a mesma representação geram a mesma sequência", () => {
  assert.deepEqual(
    take(SeededRandom.fromSeed(42), 12),
    take(SeededRandom.fromSeed("42"), 12),
  );
});

test("seeds diferentes produzem sequências diferentes", () => {
  assert.notDeepEqual(
    take(SeededRandom.fromSeed("evo-1"), 6),
    take(SeededRandom.fromSeed("evo-2"), 6),
  );
});

test("forks são independentes da ordem e do consumo do stream pai", () => {
  const firstRoot = SeededRandom.fromSeed("ilha");
  firstRoot.nextFloat();
  firstRoot.nextFloat();
  const firstMap = take(firstRoot.fork("map"), 8);
  const firstGenetics = take(firstRoot.fork("genetics"), 8);

  const secondRoot = SeededRandom.fromSeed("ilha");
  const secondGenetics = take(secondRoot.fork("genetics"), 8);
  const secondMap = take(secondRoot.fork("map"), 8);

  assert.deepEqual(firstMap, secondMap);
  assert.deepEqual(firstGenetics, secondGenetics);
  assert.notDeepEqual(firstMap, firstGenetics);
});

test("geração gaussiana mantém vetor dourado e cache determinístico", () => {
  const random = SeededRandom.fromSeed("evo-1").fork("genetics");
  assert.deepEqual(take(random, 4, "nextGaussian"), GOLDEN_GAUSSIANS);
});

test("helpers respeitam intervalos e rejeitam limites inválidos", () => {
  const random = SeededRandom.fromSeed("ranges");
  for (let index = 0; index < 100; index += 1) {
    const integer = random.nextInt(-3, 5);
    const real = random.nextRange(2, 4);
    assert(integer >= -3 && integer < 5);
    assert(real >= 2 && real < 4);
  }

  assert.throws(() => random.nextInt(2, 2), RangeError);
  assert.throws(() => random.nextRange(3, 1), RangeError);
  assert.throws(() => random.nextGaussian(0, -1), RangeError);
});
