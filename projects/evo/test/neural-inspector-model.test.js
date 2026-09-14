import assert from "node:assert/strict";
import test from "node:test";

import { createNeuralInputSchema } from "../src/core/neural-input-schema.js";
import { createNeuralInspectorModel } from "../src/ui/neural-inspector-model.js";

test("inspetor neural associa entradas e saídas a descrições e valores", () => {
  const brain = Object.freeze({
    inputs: Object.freeze([0.1, 0.2, 0.3, 0.4, 1, 0, 0.5, 0.6, -0.7, 1]),
    outputs: Object.freeze([-0.25, 0.75]),
  });
  const model = createNeuralInspectorModel(brain, createNeuralInputSchema(2));

  assert.deepEqual(model.inputs.map(({ label, value }) => ({ label, value })), [
    { label: "Olho 1 · comida", value: 0.1 },
    { label: "Olho 1 · transição/borda", value: 0.2 },
    { label: "Olho 2 · comida", value: 0.3 },
    { label: "Olho 2 · transição/borda", value: 0.4 },
    { label: "Comida no alcance seguro", value: 1 },
    { label: "Refeição ativa", value: 0 },
    { label: "Energia relativa", value: 0.5 },
    { label: "Vida relativa", value: 0.6 },
    { label: "Velocidade atual", value: -0.7 },
    { label: "Água sob o ser", value: 1 },
  ]);
  assert.deepEqual(model.outputs.map(({ label, value }) => ({ label, value })), [
    { label: "Velocidade desejada", value: -0.25 },
    { label: "Giro desejado", value: 0.75 },
  ]);
  assert(model.inputs.every(({ description }) => description.length > 0));
  assert(model.outputs.every(({ description }) => description.length > 0));
  assert(Object.isFrozen(model));
  assert(Object.isFrozen(model.inputs));
  assert(model.inputs.every(Object.isFrozen));
});

test("inspetor neural rejeita schema ou saídas incompatíveis", () => {
  assert.throws(
    () => createNeuralInspectorModel({ inputs: [0], outputs: [0, 0] }, []),
    /schema de entradas compatível/,
  );
  assert.throws(
    () => createNeuralInspectorModel({ inputs: [0, 0, 0, 0, 0, 0, 0, 0], outputs: [0] }, createNeuralInputSchema(1)),
    /exatamente duas saídas/,
  );
});
