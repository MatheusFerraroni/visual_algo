const errorBarPlugin = {
  id: "elbowErrorBars",
  afterDatasetsDraw(chart) {
    const dataset = chart.data.datasets[0];

    if (!dataset || !Array.isArray(dataset.errorBars)) {
      return;
    }

    const datasetMeta = chart.getDatasetMeta(0);
    const yScale = chart.scales.y;
    const context = chart.ctx;

    context.save();
    context.strokeStyle = "#7a3e1f";
    context.lineWidth = 1.5;

    datasetMeta.data.forEach((pointElement, pointIndex) => {
      const confidenceIntervalMargin = dataset.errorBars[pointIndex];

      if (!Number.isFinite(confidenceIntervalMargin) || confidenceIntervalMargin <= 0) {
        return;
      }

      const meanValue = dataset.data[pointIndex];
      const topY = yScale.getPixelForValue(meanValue + confidenceIntervalMargin);
      const bottomY = yScale.getPixelForValue(meanValue - confidenceIntervalMargin);
      const x = pointElement.x;

      context.beginPath();
      context.moveTo(x, topY);
      context.lineTo(x, bottomY);
      context.moveTo(x - 6, topY);
      context.lineTo(x + 6, topY);
      context.moveTo(x - 6, bottomY);
      context.lineTo(x + 6, bottomY);
      context.stroke();
    });

    context.restore();
  },
};

export class ElbowChartController {
  constructor(canvasElement) {
    this.canvasElement = canvasElement;
    this.chart = null;
    this.yScaleType = "linear";
    this.lastElbowCurve = [];
  }

  mount() {
    if (!this.canvasElement || typeof Chart === "undefined") {
      return;
    }

    this.chart = new Chart(this.canvasElement, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "Dissimilaridade média por K",
            data: [],
            errorBars: [],
            borderColor: "#c4632f",
            backgroundColor: "#c4632f",
            tension: 0.2,
            pointRadius: 3,
          },
        ],
      },
      plugins: [errorBarPlugin],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: "nearest",
          intersect: false,
        },
        plugins: {
          tooltip: {
            callbacks: {
              label(context) {
                const dataset = context.dataset;
                const meanValue = dataset.data[context.dataIndex];
                const confidenceIntervalMargin = dataset.errorBars?.[context.dataIndex] ?? 0;
                return [
                  `Média: ${meanValue.toFixed(2)}`,
                  `IC 99%: ±${confidenceIntervalMargin.toFixed(2)}`,
                ];
              },
            },
          },
        },
        scales: {
          x: {
            title: {
              display: true,
              text: "K",
            },
          },
          y: {
            type: this.yScaleType,
            beginAtZero: true,
            title: {
              display: true,
              text: "Dissimilaridade",
            },
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
    this.update(this.lastElbowCurve);
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

  update(elbowCurve) {
    if (!this.chart) {
      return;
    }

    this.lastElbowCurve = elbowCurve;

    this.chart.data.labels = elbowCurve.map((entry) => String(entry.k));
    this.chart.data.datasets[0].data = elbowCurve.map((entry) =>
      this.normalizeYValue(entry.meanOverallDissimilarity)
    );
    this.chart.data.datasets[0].errorBars = elbowCurve.map(
      (entry) => entry.confidenceInterval99.margin,
    );
    this.chart.update();
  }
}
