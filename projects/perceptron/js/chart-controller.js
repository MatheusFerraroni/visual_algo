import { getActivationConfig } from "./activation-functions.js";

function createSweepValues(range) {
  const values = [];
  const steps = Math.max(2, Number(range.steps) || 81);
  const min = Number(range.min);
  const max = Number(range.max);
  const delta = (max - min) / (steps - 1);

  for (let index = 0; index < steps; index += 1) {
    values.push(Number((min + delta * index).toFixed(3)));
  }

  return values;
}

export function buildSensitivityDatasets(state) {
  const activation = getActivationConfig(state.activationKey);
  const sweepValues = createSweepValues(state.chartRange);

  return state.inputs.map((inputValue, inputIndex) => {
    const data = sweepValues.map((sweepValue) => {
      const simulatedInputs = [...state.inputs];
      simulatedInputs[inputIndex] = sweepValue;

      const weightedSum = simulatedInputs.reduce((sum, currentValue, index) => {
        return sum + currentValue * state.weights[index];
      }, state.bias);

      return Number(activation.apply(weightedSum).toFixed(4));
    });

    return {
      label: `Variando x${inputIndex + 1}`,
      data,
      borderWidth: 2,
      tension: 0.25,
    };
  });
}

export class ChartController {
  constructor(canvas) {
    this.canvas = canvas;
    this.chart = null;
  }

  render(state) {
    if (!this.canvas || typeof Chart === "undefined") {
      return;
    }

    const datasets = buildSensitivityDatasets(state);
    const labels = createSweepValues(state.chartRange);

    if (this.chart) {
      this.chart.destroy();
    }

    this.chart = new Chart(this.canvas, {
      type: "line",
      data: {
        labels,
        datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: "nearest",
          intersect: false,
        },
        plugins: {
          legend: {
            position: "bottom",
          },
          title: {
            display: true,
            text: "Sensibilidade do output ao variar cada entrada",
          },
        },
        scales: {
          x: {
            title: {
              display: true,
              text: "Valor da entrada variada",
            },
          },
          y: {
            title: {
              display: true,
              text: "Output",
            },
          },
        },
      },
    });
  }

  destroy() {
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
  }
}
