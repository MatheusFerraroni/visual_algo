export const DEFAULT_INPUT_COUNT = 2;

export function createInputValues(count, value = 1) {
  return Array.from({ length: count }, (_, index) =>
    Number((value + index * 0.5).toFixed(2))
  );
}

export function createWeightValues(count, value = 0.8) {
  return Array.from({ length: count }, (_, index) =>
    Number((value - index * 0.2).toFixed(2))
  );
}

export function createInitialState() {
  const inputCount = DEFAULT_INPUT_COUNT;

  return {
    inputCount,
    activationKey: "sigmoid",
    bias: 0.2,
    inputs: createInputValues(inputCount),
    weights: createWeightValues(inputCount),
    chartRange: {
      min: -5,
      max: 5,
      steps: 81,
    },
    graphMode: "per-input",
  };
}

export function syncVectorLength(values, count, fallbackFactory) {
  return Array.from({ length: count }, (_, index) => {
    if (index < values.length) {
      return values[index];
    }

    return fallbackFactory(index);
  });
}
