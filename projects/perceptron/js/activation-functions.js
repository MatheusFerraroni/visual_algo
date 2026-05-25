const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const ACTIVATION_FUNCTIONS = {
  linear: {
    label: "Linear",
    formula: "f(z) = z",
    apply: (value) => value,
  },
  sigmoid: {
    label: "Sigmoid",
    formula: "f(z) = 1 / (1 + e^-z)",
    apply: (value) => 1 / (1 + Math.exp(-value)),
  },
  tanh: {
    label: "Tanh",
    formula: "f(z) = tanh(z)",
    apply: (value) => Math.tanh(value),
  },
  relu: {
    label: "ReLU",
    formula: "f(z) = max(0, z)",
    apply: (value) => Math.max(0, value),
  },
  leakyRelu: {
    label: "Leaky ReLU",
    formula: "f(z) = z if z > 0, else 0.1z",
    apply: (value) => (value > 0 ? value : value * 0.1),
  },
  elu: {
    label: "ELU",
    formula: "f(z) = z if z > 0, else e^z - 1",
    apply: (value) => (value > 0 ? value : Math.exp(value) - 1),
  },
  softplus: {
    label: "Softplus",
    formula: "f(z) = ln(1 + e^z)",
    apply: (value) => Math.log1p(Math.exp(clamp(value, -50, 50))),
  },
  binaryStep: {
    label: "Step Binária",
    formula: "f(z) = 1 if z >= 0, else 0",
    apply: (value) => (value >= 0 ? 1 : 0),
  },
  bipolarStep: {
    label: "Step Bipolar",
    formula: "f(z) = 1 if z >= 0, else -1",
    apply: (value) => (value >= 0 ? 1 : -1),
  },
};

export function getActivationConfig(key) {
  return ACTIVATION_FUNCTIONS[key] ?? ACTIVATION_FUNCTIONS.sigmoid;
}

export function listActivationOptions() {
  return Object.entries(ACTIVATION_FUNCTIONS).map(([key, config]) => ({
    key,
    label: config.label,
    formula: config.formula,
  }));
}
