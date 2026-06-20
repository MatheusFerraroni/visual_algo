// Worker dedicado a executar várias redes pequenas sem bloquear a UI.
let tfReadyPromise = null;
const brains = new Map();

function ensureTfReady(tfjsUrl) {
  if (!tfReadyPromise) {
    importScripts(tfjsUrl);
    tfReadyPromise = tf.ready();
  }
  return tfReadyPromise;
}

function createBrainModel(netConfig) {
  const model = tf.sequential();
  model.add(tf.layers.dense({
    inputShape: [netConfig.inputSize],
    units: netConfig.neuronsPerLayer,
    activation: netConfig.activation,
    useBias: true
  }));
  for (let i = 1; i < netConfig.hiddenLayers; i++) {
    model.add(tf.layers.dense({
      units: netConfig.neuronsPerLayer,
      activation: netConfig.activation,
      useBias: true
    }));
  }
  model.add(tf.layers.dense({
    units: netConfig.outputSize,
    activation: "tanh",
    useBias: true
  }));
  return model;
}

function applyBrainData(model, brainData) {
  const tensors = brainData.weights.map(layer => tf.tensor(layer.values, layer.shape));
  model.setWeights(tensors);
  tensors.forEach(tensor => tensor.dispose());
}

function createModelFromBrainData(brainData) {
  const netConfig = {
    hiddenLayers: brainData.netConfig.hiddenLayers,
    neuronsPerLayer: brainData.netConfig.neuronsPerLayer,
    activation: brainData.netConfig.activation,
    inputSize: brainData.netConfig.inputSize,
    outputSize: brainData.netConfig.outputSize
  };
  const model = createBrainModel(netConfig);
  applyBrainData(model, brainData);
  return model;
}

function disposeBrains() {
  for (const brain of brains.values()) {
    brain.dispose();
  }
  brains.clear();
}

async function handleMessage(message) {
  await ensureTfReady(message.tfjsUrl);

  if (message.type === "init") {
    return { backend: tf.getBackend() };
  }

  if (message.type === "syncPopulation") {
    disposeBrains();
    for (const entry of message.population || []) {
      brains.set(entry.index, createModelFromBrainData(entry.brainData));
    }
    return { count: brains.size };
  }

  if (message.type === "infer") {
    const outputs = [];
    for (const request of message.requests || []) {
      const brain = brains.get(request.index);
      if (!brain) {
        throw new Error(`Rede do veículo ${request.index} não encontrada no worker.`);
      }
      const result = tf.tidy(() => {
        const input = tf.tensor2d([request.inputs]);
        const output = brain.predict(input);
        return Array.from(output.dataSync());
      });
      outputs.push({
        index: request.index,
        outputs: result
      });
    }
    return { outputs };
  }

  throw new Error(`Mensagem de worker desconhecida: ${message.type}`);
}

self.onmessage = async event => {
  const message = event.data || {};
  try {
    const payload = await handleMessage(message);
    self.postMessage({
      requestId: message.requestId,
      ok: true,
      ...payload
    });
  } catch (error) {
    self.postMessage({
      requestId: message.requestId,
      ok: false,
      error: error.message
    });
  }
};
