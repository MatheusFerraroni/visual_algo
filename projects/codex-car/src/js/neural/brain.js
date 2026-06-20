// Leitura de configurações da rede e operações sobre pesos via TensorFlow.js.
function distributeSensorAngles() {
  profilerMeasure("ui.distributeSensorAngles", () => {
    const count = clamp(parseInt(state.ui.sensorCount.value, 10) || 7, 3, 21);
    const spread = 90;
    const out = [];
    if (count === 1) {
      out.push(0);
    } else {
      for (let i = 0; i < count; i++) {
        const t = i / (count - 1);
        out.push(lerp(-spread, spread, t));
      }
    }
    state.ui.sensorAngles.value = out.map(v => Math.round(v)).join(",");
  });
}

function readSensorAngles() {
  const desiredCount = clamp(parseInt(state.ui.sensorCount.value, 10) || 7, 3, 21);
  const raw = state.ui.sensorAngles.value
    .split(",")
    .map(v => parseFloat(v.trim()))
    .filter(v => Number.isFinite(v));

  let angles = raw;
  if (raw.length !== desiredCount) {
    angles = [];
    for (let i = 0; i < desiredCount; i++) {
      const t = desiredCount === 1 ? 0.5 : i / (desiredCount - 1);
      angles.push(lerp(-90, 90, t));
    }
  }
  return angles.map(v => clamp(v, -170, 170) * Math.PI / 180);
}

function readNetConfig() {
  const sensorAngles = readSensorAngles();
  return {
    hiddenLayers: clamp(parseInt(state.ui.hiddenLayers.value, 10) || 2, 1, 6),
    neuronsPerLayer: clamp(parseInt(state.ui.neuronsPerLayer.value, 10) || 12, 2, 64),
    activation: state.ui.activation.value || "tanh",
    sensorAngles,
    inputSize: sensorAngles.length + 3,
    outputSize: 2
  };
}

function readGaConfig() {
  return {
    populationSize: clamp(parseInt(state.ui.populationSize.value, 10) || 40, 4, 300),
    mutationRate: clamp(parseFloat(state.ui.mutationRate.value) || 0.12, 0, 1),
    mutationStrength: clamp(parseFloat(state.ui.mutationStrength.value) || 0.18, 0, 2),
    elitism: clamp(parseFloat(state.ui.elitism.value) || 0.12, 0, 0.5),
    crossoverRate: clamp(parseFloat(state.ui.crossoverRate.value) || 0.65, 0, 1),
    maxGenerationTime: clamp(parseFloat(state.ui.maxGenerationTime.value) || 20, 3, 120),
    collisionPenalty: clamp(parseFloat(state.ui.collisionPenalty.value) || 30, 0, 500),
    progressBonus: clamp(parseFloat(state.ui.progressBonus.value) || 1.6, 0, 10),
    speedBonus: clamp(parseFloat(state.ui.speedBonus.value) || 0.8, 0, 10)
  };
}

// Esta assinatura evita misturar pesos incompatíveis ao mudar a arquitetura.
function netSignature(config) {
  return JSON.stringify({
    hiddenLayers: config.hiddenLayers,
    neuronsPerLayer: config.neuronsPerLayer,
    activation: config.activation,
    inputSize: config.inputSize,
    outputSize: config.outputSize,
    sensors: config.sensorAngles.map(v => Number(v.toFixed(4)))
  });
}

function brainDataSignature(brainData) {
  return netSignature({
    hiddenLayers: brainData.netConfig.hiddenLayers,
    neuronsPerLayer: brainData.netConfig.neuronsPerLayer,
    activation: brainData.netConfig.activation,
    sensorAngles: brainData.netConfig.sensorAnglesDeg.map(a => a * Math.PI / 180),
    inputSize: brainData.netConfig.inputSize,
    outputSize: brainData.netConfig.outputSize
  });
}

function createBrainModel(netConfig) {
  return profilerMeasure("nn.createBrainModel", () => {
    // A rede é pequena, mas totalmente construída e executada via TensorFlow.js.
    // A evolução genética atua diretamente sobre estes pesos densos.
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
  });
}

function extractBrainData(model, netConfig) {
  return profilerMeasure("nn.extractBrainData", () => ({
    version: 1,
    netConfig: {
      hiddenLayers: netConfig.hiddenLayers,
      neuronsPerLayer: netConfig.neuronsPerLayer,
      activation: netConfig.activation,
      sensorAnglesDeg: netConfig.sensorAngles.map(a => Math.round((a * 180) / Math.PI * 1000) / 1000),
      inputSize: netConfig.inputSize,
      outputSize: netConfig.outputSize
    },
    weights: model.getWeights().map(tensor => ({
      shape: tensor.shape.slice(),
      values: Array.from(tensor.dataSync())
    }))
  }));
}

function cloneBrainData(brainData) {
  return deepClone(brainData);
}

function applyBrainData(model, brainData) {
  profilerMeasure("nn.applyBrainData", () => {
    const tensors = brainData.weights.map(w => tf.tensor(w.values, w.shape));
    model.setWeights(tensors);
    tensors.forEach(t => t.dispose());
  });
}

function createModelFromBrainData(brainData) {
  const cfg = {
    hiddenLayers: brainData.netConfig.hiddenLayers,
    neuronsPerLayer: brainData.netConfig.neuronsPerLayer,
    activation: brainData.netConfig.activation,
    sensorAngles: brainData.netConfig.sensorAnglesDeg.map(a => a * Math.PI / 180),
    inputSize: brainData.netConfig.inputSize,
    outputSize: brainData.netConfig.outputSize
  };
  const model = createBrainModel(cfg);
  applyBrainData(model, brainData);
  return model;
}

function crossoverBrainData(parentA, parentB) {
  return profilerMeasure("ga.crossoverBrainData", () => {
    // Crossover uniforme por peso: cada posição herda aleatoriamente do pai A ou B.
    const child = cloneBrainData(parentA);
    child.weights = parentA.weights.map((layer, index) => {
      const mate = parentB.weights[index];
      const values = layer.values.map((value, i) => (Math.random() < 0.5 ? value : mate.values[i]));
      return { shape: layer.shape.slice(), values };
    });
    return child;
  });
}

function mutateBrainData(brainData, rate, strength) {
  return profilerMeasure("ga.mutateBrainData", () => {
    // A mutação adiciona ruído gaussiano em uma fração dos pesos.
    for (const layer of brainData.weights) {
      for (let i = 0; i < layer.values.length; i++) {
        if (Math.random() < rate) {
          layer.values[i] += randomGaussian() * strength;
        }
      }
    }
    return brainData;
  });
}
