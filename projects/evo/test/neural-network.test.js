import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { NeuralController } from "../src/core/neural-controller.js";
import { NeuralNetwork } from "../src/core/neural-network.js";
import { SeededRandom } from "../src/core/seeded-random.js";

function createSingleNeuronNetwork(activation, genome = [1, 0, 1, 0]) {
  return new NeuralNetwork({
    inputCount: 1,
    hiddenLayers: [1],
    outputCount: 1,
    activation,
    genome,
    geneMin: -5,
    geneMax: 5,
  });
}

test("contagem e ordem do genoma incluem pesos e bias por neurônio", () => {
  assert.equal(NeuralNetwork.calculateGeneCount([14, 12, 2]), 206);
  const network = new NeuralNetwork({
    inputCount: 2,
    hiddenLayers: [],
    outputCount: 2,
    genome: [1, 2, 3, 4, 5, 6],
    geneMin: -10,
    geneMax: 10,
  });

  assert.deepEqual(network.forward([0.25, -0.5]), [
    Math.round(Math.tanh(2.25) * 1e9) / 1e9,
    Math.round(Math.tanh(4.5) * 1e9) / 1e9,
  ]);
  assert.deepEqual(network.getLayerSizes(), [2, 2]);
  assert(Object.isFrozen(network.getGenome()));
  assert(Object.isFrozen(network.forward([0, 0])));
});

test("tanh, ReLU e sigmoide são determinísticos nas camadas internas", () => {
  assert.deepEqual(createSingleNeuronNetwork("tanh").forward([1]), [0.642014992]);
  assert.deepEqual(createSingleNeuronNetwork("relu").forward([-2]), [0]);
  assert.deepEqual(createSingleNeuronNetwork("sigmoid").forward([0]), [0.462117157]);
});

test("rede aleatória mantém genoma e inferência dourados", () => {
  const network = NeuralNetwork.createRandom({
    inputCount: 14,
    hiddenLayers: [12],
    outputCount: 2,
    activation: "tanh",
    random: SeededRandom.fromSeed("evo-1").fork("generation:1:being:1:initial-genome"),
    initialGeneMin: -1,
    initialGeneMax: 1,
    geneMin: -5,
    geneMax: 5,
    quantizationDecimals: 9,
  });
  const genome = network.getGenome();
  const outputs = network.forward(Array.from({ length: 14 }, (_, index) => index / 13));

  assert.equal(network.geneCount, 206);
  assert.equal(
    createHash("sha256").update(JSON.stringify(genome)).digest("hex"),
    "a33af28fa5b866b8146e32ffca19de88017e59afa22b034bf808a4a6ccb85623",
  );
  assert.deepEqual(genome.slice(0, 5), [
    -0.113908748,
    -0.285963103,
    0.804006615,
    -0.536237546,
    0.483168894,
  ]);
  assert.deepEqual(outputs, [-0.910030296, -0.508048513]);
});

test("genoma explícito e configurações incompatíveis falham fechados", () => {
  assert.throws(
    () => new NeuralNetwork({
      inputCount: 2,
      hiddenLayers: [],
      outputCount: 2,
      activation: "tanh",
      genome: [0],
      geneMin: -1,
      geneMax: 1,
    }),
    /exatamente 6 genes/,
  );
  assert.throws(
    () => createSingleNeuronNetwork("linear"),
    /Ativação neural desconhecida/,
  );
  assert.throws(
    () => createSingleNeuronNetwork("tanh", [6, 0, 1, 0]),
    /gene 0 deve estar entre -5 e 5/i,
  );
});

test("NeuralController inicia neutro, decide e conserva a ação", () => {
  const network = new NeuralNetwork({
    inputCount: 1,
    hiddenLayers: [],
    outputCount: 2,
    activation: "tanh",
    genome: [1, 0, -1, 0],
    geneMin: -5,
    geneMax: 5,
  });
  const controller = new NeuralController({ network });

  assert.deepEqual(controller.prime([0.5]), { speed: 0, turn: 0 });
  assert.deepEqual(controller.getSnapshot(), {
    inputs: [0.5],
    outputs: [0, 0],
    geneCount: 4,
  });
  const action = controller.decide([0.5]);
  assert.deepEqual(action, { speed: 0.462117157, turn: -0.462117157 });
  assert.strictEqual(controller.getAction(), action);
  assert.strictEqual(controller.getGenome(), network.getGenome());
  assert(Object.isFrozen(controller.getSnapshot()));
});
