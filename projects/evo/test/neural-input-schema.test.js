import assert from "node:assert/strict";
import test from "node:test";

import {
  createNeuralInputSchema,
  NEURAL_OUTPUT_SCHEMA,
} from "../src/core/neural-input-schema.js";

test("schema neural descreve a ordem normativa e é compartilhado por topologia", () => {
  const schema = createNeuralInputSchema(3);

  assert.deepEqual(schema, [
    { kind: "eye-food", eyeIndex: 0, minimum: 0, maximum: 1 },
    { kind: "eye-terrain-boundary", eyeIndex: 0, minimum: 0, maximum: 1 },
    { kind: "eye-food", eyeIndex: 1, minimum: 0, maximum: 1 },
    { kind: "eye-terrain-boundary", eyeIndex: 1, minimum: 0, maximum: 1 },
    { kind: "eye-food", eyeIndex: 2, minimum: 0, maximum: 1 },
    { kind: "eye-terrain-boundary", eyeIndex: 2, minimum: 0, maximum: 1 },
    { kind: "food-within-safe-eating-range", minimum: 0, maximum: 1 },
    { kind: "feeding-active", minimum: 0, maximum: 1 },
    { kind: "energy", minimum: 0, maximum: 1 },
    { kind: "life", minimum: 0, maximum: 1 },
    { kind: "speed", minimum: -1, maximum: 1 },
    { kind: "under-body-water", minimum: 0, maximum: 1 },
  ]);
  assert.strictEqual(createNeuralInputSchema(3), schema);
  assert(Object.isFrozen(schema));
  assert(schema.every(Object.isFrozen));
  assert.throws(() => { schema[0].kind = "other"; }, TypeError);
});

test("schema neural valida olhos e descreve as duas saídas", () => {
  assert.deepEqual(NEURAL_OUTPUT_SCHEMA, [
    { kind: "speed", minimum: -1, maximum: 1 },
    { kind: "turn", minimum: -1, maximum: 1 },
  ]);
  assert(Object.isFrozen(NEURAL_OUTPUT_SCHEMA));
  assert(NEURAL_OUTPUT_SCHEMA.every(Object.isFrozen));
  assert.throws(() => createNeuralInputSchema(0), /quantidade positiva/);
  assert.throws(() => createNeuralInputSchema(1.5), /quantidade positiva/);
});
