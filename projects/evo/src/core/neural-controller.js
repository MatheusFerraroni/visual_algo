const NEUTRAL_ACTION = Object.freeze({ speed: 0, turn: 0 });
const INPUT_DECIMALS = 9;

function quantize(value) {
  const factor = 10 ** INPUT_DECIMALS;
  const result = Math.round(value * factor) / factor;
  return Object.is(result, -0) ? 0 : result;
}

function freezeInputs(inputs, expectedCount) {
  if (!Array.isArray(inputs) || inputs.length !== expectedCount
    || inputs.some((input) => !Number.isFinite(input))) {
    throw new RangeError(`O cérebro exige exatamente ${expectedCount} entradas finitas.`);
  }
  return Object.freeze(inputs.map(quantize));
}

export class NeuralController {
  #network;
  #inputs;
  #outputs = Object.freeze([0, 0]);
  #action = NEUTRAL_ACTION;
  #snapshot = null;

  constructor({ network }) {
    if (!network || typeof network.forward !== "function"
      || typeof network.getGenome !== "function") {
      throw new TypeError("NeuralController exige uma NeuralNetwork válida.");
    }
    const layerSizes = network.getLayerSizes();
    if (layerSizes.at(-1) !== 2) {
      throw new RangeError("O cérebro exige exatamente duas saídas.");
    }
    this.#network = network;
    this.#inputs = Object.freeze(Array.from({ length: layerSizes[0] }, () => 0));
  }

  prime(inputs) {
    this.#inputs = freezeInputs(inputs, this.#network.getLayerSizes()[0]);
    this.#outputs = Object.freeze([0, 0]);
    this.#action = NEUTRAL_ACTION;
    this.#snapshot = null;
    return this.#action;
  }

  decide(inputs) {
    this.#inputs = freezeInputs(inputs, this.#network.getLayerSizes()[0]);
    this.#outputs = this.#network.forward(this.#inputs);
    this.#action = Object.freeze({
      speed: this.#outputs[0],
      turn: this.#outputs[1],
    });
    this.#snapshot = null;
    return this.#action;
  }

  getAction() {
    return this.#action;
  }

  getGenome() {
    return this.#network.getGenome();
  }

  getSnapshot() {
    if (this.#snapshot === null) {
      this.#snapshot = Object.freeze({
        inputs: this.#inputs,
        outputs: this.#outputs,
        geneCount: this.#network.geneCount,
      });
    }
    return this.#snapshot;
  }
}
