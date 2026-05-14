import { getClusterColor } from "./colors.js";

export class MetricsChartController {
  constructor(canvasElement) {
    this.canvasElement = canvasElement;
    this.chart = null;
    this.yScaleType = "linear";
    this.lastMetricsHistory = [];
  }

  mount() {
    if (!this.canvasElement || typeof Chart === "undefined") {
      return;
    }

    this.chart = new Chart(this.canvasElement, {
      type: "line",
      data: {
        labels: [],
        datasets: [],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: "nearest",
          intersect: false,
        },
        scales: {
          y: {
            type: this.yScaleType,
            beginAtZero: true,
          },
        },
      },
    });
  }

  setYScaleType(yScaleType) {
    this.yScaleType = yScaleType;

    if (!this.chart) {
      return;
    }

    this.chart.options.scales.y.type = yScaleType;
    this.chart.options.scales.y.beginAtZero = yScaleType !== "logarithmic";
    this.update(this.lastMetricsHistory);
  }

  normalizeYValue(value) {
    if (value === null || value === undefined) {
      return null;
    }

    if (this.yScaleType === "logarithmic") {
      return value > 0 ? value : null;
    }

    return value;
  }

  update(metricsHistory) {
    if (!this.chart) {
      return;
    }

    this.lastMetricsHistory = metricsHistory;

    // The number of cluster series can change with K, so datasets are rebuilt
    // from the current history instead of being kept fixed.
    const maxClusterIndex = metricsHistory.reduce((maxIndex, entry) => {
      const currentMax = entry.clusterMetrics.reduce(
        (clusterMax, cluster) => Math.max(clusterMax, cluster.clusterIndex),
        -1,
      );
      return Math.max(maxIndex, currentMax);
    }, -1);

    const clusterDatasets = Array.from({ length: maxClusterIndex + 1 }, (_, clusterIndex) => ({
      label: `Variabilidade do Cluster ${clusterIndex + 1}`,
      data: metricsHistory.map((entry) => {
        const clusterMetric = entry.clusterMetrics.find(
          (cluster) => cluster.clusterIndex === clusterIndex,
        );
        return clusterMetric ? this.normalizeYValue(clusterMetric.variability) : null;
      }),
      borderColor: getClusterColor(clusterIndex),
      backgroundColor: getClusterColor(clusterIndex),
      tension: 0.25,
      spanGaps: true,
    }));

    const dissimilarityDataset = {
      label: "Dissimilaridade geral",
      data: metricsHistory.map((entry) => this.normalizeYValue(entry.overallDissimilarity)),
      borderColor: "#1f1a14",
      backgroundColor: "#1f1a14",
      tension: 0.25,
    };

    this.chart.data.labels = metricsHistory.map((entry) => `Iter ${entry.iteration}`);
    this.chart.data.datasets = [...clusterDatasets, dissimilarityDataset];
    this.chart.update();
  }
}
