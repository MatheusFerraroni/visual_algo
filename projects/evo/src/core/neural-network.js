const DEFAULT_QUANTIZATION_DECIMALS = 9;
const SUPPORTED_ACTIVATIONS = new Set(["tanh", "relu", "sigmoid"]);

function quantize(value, decimals) {
  const factor = 10 ** decimals;
  const result = Math.round(value * factor) / factor;
  return Object.is(result, -0) ? 0 : result;
}

function assertPositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} deve ser um inteiro seguro maior que zero.`);
  }
}

function validateTopology({ inputCount, hiddenLayers, outputCount }) {
  assertPositiveInteger(inputCount, "A quantidade de entradas");
  if (!Array.isArray(hiddenLayers)) {
    throw new TypeError("As camadas ocultas devem ser uma lista.");
  }
  hiddenLayers.forEach((size, index) => assertPositiveInteger(
    size,
    `A camada oculta ${index + 1}`,
  ));
  assertPositiveInteger(outputCount, "A quantidade de saídas");
}

function activate(value, activation) {
  if (activation === "relu") {
    return Math.max(0, value);
  }
  if (activation === "sigmoid") {
    if (value >= 0) {
      return 1 / (1 + Math.exp(-value));
    }
    const exponential = Math.exp(value);
    return exponential / (1 + exponential);
  }
  return Math.tanh(value);
}

export class NeuralNetwork {
  #inputCount;
  #hiddenLayers;
  #outputCount;
  #activation;
  #genome;
  #geneMin;
  #geneMax;
  #quantizationDecimals;
  #layerSizes;

  constructor({
    inputCount,
    hiddenLayers = [],
    outputCount,
    activation = "tanh",
    genome,
    geneMin = -5,
    geneMax = 5,
    quantizationDecimals = DEFAULT_QUANTIZATION_DECIMALS,
  }) {
    validateTopology({ inputCount, hiddenLayers, outputCount });
    if (!SUPPORTED_ACTIVATIONS.has(activation)) {
      throw new RangeError(`Ativação neural desconhecida: ${activation}.`);
    }
    if (!Number.isFinite(geneMin) || !Number.isFinite(geneMax) || geneMin >= geneMax) {
      throw new RangeError("Os limites dos genes devem ser finitos e crescentes.");
    }
    if (!Number.isInteger(quantizationDecimals)
      || quantizationDecimals < 0 || quantizationDecimals > 12) {
      throw new RangeError("A quantização neural deve estar entre 0 e 12 casas.");
    }

    const layerSizes = [inputCount, ...hiddenLayers, outputCount];
    const expectedGenes = NeuralNetwork.calculateGeneCount(layerSizes);
    if (!Array.isArray(genome) || genome.length !== expectedGenes) {
      throw new RangeError(`O genoma deve conter exatamente ${expectedGenes} genes.`);
    }
    for (const [index, gene] of genome.entries()) {
      if (!Number.isFinite(gene) || gene < geneMin || gene > geneMax) {
        throw new RangeError(`O gene ${index} deve estar entre ${geneMin} e ${geneMax}.`);
      }
    }

    this.#inputCount = inputCount;
    this.#hiddenLayers = Object.freeze([...hiddenLayers]);
    this.#outputCount = outputCount;
    this.#activation = activation;
    this.#geneMin = geneMin;
    this.#geneMax = geneMax;
    this.#quantizationDecimals = quantizationDecimals;
    this.#layerSizes = Object.freeze(layerSizes);
    this.#genome = Object.freeze(
      genome.map((gene) => quantize(gene, quantizationDecimals)),
    );
    Object.freeze(this);
  }

  static calculateGeneCount(layerSizes) {
    if (!Array.isArray(layerSizes) || layerSizes.length < 2) {
      throw new TypeError("A topologia deve conter ao menos entrada e saída.");
    }
    layerSizes.forEach((size, index) => assertPositiveInteger(
      size,
      `O tamanho da camada ${index}`,
    ));

    let total = 0;
    for (let index = 1; index < layerSizes.length; index += 1) {
      total += (layerSizes[index - 1] + 1) * layerSizes[index];
    }
    return total;
  }

  static createRandom({
    inputCount,
    hiddenLayers = [],
    outputCount,
    activation = "tanh",
    random,
    initialGeneMin,
    initialGeneMax,
    geneMin,
    geneMax,
    quantizationDecimals = DEFAULT_QUANTIZATION_DECIMALS,
  }) {
    validateTopology({ inputCount, hiddenLayers, outputCount });
    if (!random || typeof random.nextRange !== "function") {
      throw new TypeError("A rede aleatória exige um gerador com nextRange().");
    }
    if (!Number.isFinite(initialGeneMin) || !Number.isFinite(initialGeneMax)
      || initialGeneMin >= initialGeneMax) {
      throw new RangeError("A faixa inicial dos genes deve ser finita e crescente.");
    }
    const geneCount = NeuralNetwork.calculateGeneCount([
      inputCount,
      ...hiddenLayers,
      outputCount,
    ]);
    const genome = Array.from(
      { length: geneCount },
      () => random.nextRange(initialGeneMin, initialGeneMax),
    );
    return new NeuralNetwork({
      inputCount,
      hiddenLayers,
      outputCount,
      activation,
      genome,
      geneMin,
      geneMax,
      quantizationDecimals,
    });
  }

  get geneCount() {
    return this.#genome.length;
  }

  getLayerSizes() {
    return this.#layerSizes;
  }

  getGenome() {
    return this.#genome;
  }

  forward(inputs) {
    if (!Array.isArray(inputs) || inputs.length !== this.#inputCount) {
      throw new RangeError(`A inferência exige exatamente ${this.#inputCount} entradas.`);
    }
    if (inputs.some((input) => !Number.isFinite(input))) {
      throw new TypeError("Todas as entradas da rede devem ser finitas.");
    }

    let values = inputs.map((input) => quantize(input, this.#quantizationDecimals));
    let geneIndex = 0;
    for (let layerIndex = 1; layerIndex < this.#layerSizes.length; layerIndex += 1) {
      const previousSize = this.#layerSizes[layerIndex - 1];
      const currentSize = this.#layerSizes[layerIndex];
      const isOutputLayer = layerIndex === this.#layerSizes.length - 1;
      const nextValues = [];

      for (let neuron = 0; neuron < currentSize; neuron += 1) {
        let sum = 0;
        for (let input = 0; input < previousSize; input += 1) {
          sum += values[input] * this.#genome[geneIndex];
          geneIndex += 1;
        }
        sum += this.#genome[geneIndex];
        geneIndex += 1;
        const activated = isOutputLayer
          ? Math.tanh(sum)
          : activate(sum, this.#activation);
        nextValues.push(quantize(activated, this.#quantizationDecimals));
      }
      values = nextValues;
    }

    return Object.freeze(values);
  }
}
