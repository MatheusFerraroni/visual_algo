export class SummaryController {
  constructor(elements) {
    this.elements = elements;
  }

  update(state) {
    this.setText("preset", this.formatPreset(state.preset));
    this.setText("mode", this.formatMode(state.mode));
    this.setText("status", state.isRunning ? "Executando" : "Pausado");
    this.setText("iteration", String(state.iteration));
    this.setText("samples", String(state.samples.length));
    this.setText("centroids", String(state.centroids.length));
    this.setText("converged", state.hasConverged ? "Sim" : "Não");
    this.setText("dissimilarity", state.currentMetrics.overallDissimilarity.toFixed(2));
  }

  formatPreset(preset) {
    const presetLabels = {
      manual: "Manual",
      "well-defined": "Clusters bem definidos",
      "close-clusters": "Clusters próximos",
      "no-clear-clusters": "Sem clusters identificáveis",
      "uneven-density": "Densidades desiguais",
      "with-outliers": "Clusters com outliers",
      "elongated-clusters": "Clusters alongados",
      "concentric-circles": "Círculos concêntricos",
      "interleaved-moons": "Luas entrelaçadas",
      "u-shapes": "Formas em U",
      "size-imbalance": "Tamanhos muito desiguais",
      "heavy-overlap": "Alta sobreposição",
    };

    return presetLabels[preset] ?? "Manual";
  }

  formatMode(mode) {
    const modeLabels = {
      samples: "Amostras",
      centroids: "Centróides",
    };

    return modeLabels[mode] ?? mode;
  }

  setText(key, value) {
    const element = this.elements[key];

    if (!element) {
      return;
    }

    element.textContent = value;
  }
}
