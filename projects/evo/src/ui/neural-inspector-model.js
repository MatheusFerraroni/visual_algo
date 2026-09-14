function getInputCopy(descriptor) {
  const eyeNumber = descriptor.eyeIndex === undefined ? null : descriptor.eyeIndex + 1;
  switch (descriptor.kind) {
    case "eye-food":
      return [`Olho ${eyeNumber} · comida`, `Proximidade da comida mais próxima no setor ${eyeNumber}; 0 ausente, 1 sobre o ser.`];
    case "eye-terrain-boundary":
      return [
        `Olho ${eyeNumber} · transição/borda`,
        `Proximidade da primeira transição de terreno ou borda no raio central do setor ${eyeNumber}.`,
      ];
    case "food-within-safe-eating-range":
      return ["Comida no alcance seguro", "Indicador binário: 1 quando existe comida em até 90% da distância máxima de alimentação."];
    case "feeding-active":
      return ["Refeição ativa", "Indicador binário: 1 enquanto o ser está alimentando-se da comida alvo."];
    case "energy":
      return ["Energia relativa", "Energia atual dividida pela energia máxima."];
    case "life":
      return ["Vida relativa", "Vida atual dividida pela vida máxima."];
    case "speed":
      return ["Velocidade atual", "Movimento normalizado: -1 para ré, 0 parado e 1 para frente."];
    case "under-body-water":
      return ["Água sob o ser", "Indicador binário: 0 em terra e 1 em água."];
    default:
      throw new RangeError(`Entrada neural desconhecida: ${descriptor.kind}`);
  }
}

const OUTPUT_COPY = Object.freeze([
  Object.freeze(["Velocidade desejada", "Comanda ré ou avanço no intervalo -1..1."]),
  Object.freeze(["Giro desejado", "Comanda giro à esquerda ou direita no intervalo -1..1."]),
]);

function freezeRow([label, description], value) {
  return Object.freeze({ label, description, value });
}

export function createNeuralInspectorModel(brain, inputSchema) {
  if (!brain || !Array.isArray(brain.inputs) || !Array.isArray(brain.outputs)) {
    throw new TypeError("O inspetor exige dados neurais válidos.");
  }
  if (!Array.isArray(inputSchema) || inputSchema.length !== brain.inputs.length) {
    throw new RangeError("O snapshot neural não possui um schema de entradas compatível.");
  }
  if (brain.outputs.length !== OUTPUT_COPY.length) {
    throw new RangeError("O cérebro deve expor exatamente duas saídas.");
  }

  return Object.freeze({
    inputs: Object.freeze(inputSchema.map((descriptor, index) => (
      freezeRow(getInputCopy(descriptor), brain.inputs[index])
    ))),
    outputs: Object.freeze(OUTPUT_COPY.map((copy, index) => (
      freezeRow(copy, brain.outputs[index])
    ))),
  });
}
