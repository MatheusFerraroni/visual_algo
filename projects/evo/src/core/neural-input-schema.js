function freezeDescriptor(descriptor) {
  return Object.freeze(descriptor);
}

const INPUT_SCHEMAS = new Map();

export function createNeuralInputSchema(eyeCount) {
  if (!Number.isSafeInteger(eyeCount) || eyeCount <= 0) {
    throw new TypeError("O schema neural exige uma quantidade positiva de olhos.");
  }
  if (INPUT_SCHEMAS.has(eyeCount)) {
    return INPUT_SCHEMAS.get(eyeCount);
  }

  const descriptors = [];
  for (let eyeIndex = 0; eyeIndex < eyeCount; eyeIndex += 1) {
    descriptors.push(
      freezeDescriptor({ kind: "eye-food", eyeIndex, minimum: 0, maximum: 1 }),
      freezeDescriptor({
        kind: "eye-terrain-boundary",
        eyeIndex,
        minimum: 0,
        maximum: 1,
      }),
    );
  }
  descriptors.push(
    freezeDescriptor({ kind: "food-within-safe-eating-range", minimum: 0, maximum: 1 }),
    freezeDescriptor({ kind: "feeding-active", minimum: 0, maximum: 1 }),
    freezeDescriptor({ kind: "energy", minimum: 0, maximum: 1 }),
    freezeDescriptor({ kind: "life", minimum: 0, maximum: 1 }),
    freezeDescriptor({ kind: "speed", minimum: -1, maximum: 1 }),
    freezeDescriptor({ kind: "under-body-water", minimum: 0, maximum: 1 }),
  );
  const schema = Object.freeze(descriptors);
  INPUT_SCHEMAS.set(eyeCount, schema);
  return schema;
}

export const NEURAL_OUTPUT_SCHEMA = Object.freeze([
  freezeDescriptor({ kind: "speed", minimum: -1, maximum: 1 }),
  freezeDescriptor({ kind: "turn", minimum: -1, maximum: 1 }),
]);
