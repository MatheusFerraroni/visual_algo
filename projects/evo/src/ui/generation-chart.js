import {
  createTrailingMovingAverage,
  requireChartConstructor,
} from "./chart-utils.js";
import { NOOP_PERFORMANCE_PROFILER } from "../debug/performance-profiler.js";

const MOVING_AVERAGE_GENERATIONS = 10;

const HISTORY_SERIES = Object.freeze([
  Object.freeze({ key: "bestFitness", label: "Melhor fitness", color: "#56d98b" }),
  Object.freeze({ key: "meanFitness", label: "Fitness média", color: "#f1c979" }),
  Object.freeze({
    key: "globalTopKMeanFitness",
    label: "Média do Top K global",
    color: "#c78cff",
  }),
  Object.freeze({
    key: "topTenPercentMeanFitness",
    label: "Média do Top 10%",
    color: "#67d7f0",
  }),
]);

function formatFitness(value) {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function validateRecord(record, index) {
  if (!record
    || !Number.isSafeInteger(record.generation)
    || record.generation <= 0
    || !Number.isSafeInteger(record.globalTopKCount)
    || record.globalTopKCount <= 0
    || !Number.isSafeInteger(record.topTenPercentCount)
    || record.topTenPercentCount <= 0
    || HISTORY_SERIES.some(({ key }) => !Number.isFinite(record[key]))) {
    throw new TypeError(`O registro histórico ${index} é inválido.`);
  }
}

export function selectGenerationHistory(history, view = "all") {
  if (!Array.isArray(history)) {
    throw new TypeError("O histórico de gerações deve ser uma lista.");
  }
  if (!["last50", "all"].includes(view)) {
    throw new RangeError("O recorte do histórico deve ser last50 ou all.");
  }
  return view === "last50" ? history.slice(-50) : [...history];
}

export function createGenerationChartModel(history, view = "all") {
  if (!Array.isArray(history)) {
    throw new TypeError("O histórico de gerações deve ser uma lista.");
  }
  history.forEach(validateRecord);

  const movingByKey = Object.fromEntries(HISTORY_SERIES.map(({ key }) => [
    key,
    createTrailingMovingAverage(
      history.map((record) => record[key]),
      MOVING_AVERAGE_GENERATIONS,
    ),
  ]));
  const completePoints = history.map((record, index) => Object.freeze({
    generation: record.generation,
    bestFitness: record.bestFitness,
    meanFitness: record.meanFitness,
    globalTopKCount: record.globalTopKCount,
    globalTopKMeanFitness: record.globalTopKMeanFitness,
    topTenPercentCount: record.topTenPercentCount,
    topTenPercentMeanFitness: record.topTenPercentMeanFitness,
    bestFitnessMovingAverage: movingByKey.bestFitness[index],
    meanFitnessMovingAverage: movingByKey.meanFitness[index],
    globalTopKMeanFitnessMovingAverage: movingByKey.globalTopKMeanFitness[index],
    topTenPercentMeanFitnessMovingAverage:
      movingByKey.topTenPercentMeanFitness[index],
  }));
  const points = selectGenerationHistory(completePoints, view);
  const maximumFitness = Math.max(
    1,
    ...points.flatMap((point) => HISTORY_SERIES.flatMap(({ key }) => [
      point[key],
      point[`${key}MovingAverage`],
    ])),
  );

  return Object.freeze({
    points: Object.freeze(points),
    maximumFitness,
    movingAverageWindow: MOVING_AVERAGE_GENERATIONS,
  });
}

export function createGenerationChartDatasets(model) {
  if (!model || !Array.isArray(model.points)) {
    throw new TypeError("O modelo do histórico evolutivo é inválido.");
  }
  const raw = HISTORY_SERIES.map((series) => ({
    label: series.label,
    data: model.points.map((point) => ({ x: point.generation, y: point[series.key] })),
    borderColor: series.color,
    backgroundColor: series.color,
    borderWidth: 1.4,
    pointRadius: 0,
    pointHoverRadius: 3,
    tension: 0,
  }));
  const moving = HISTORY_SERIES.map((series) => ({
    label: `${series.label} · MM${model.movingAverageWindow}`,
    data: model.points.map((point) => ({
      x: point.generation,
      y: point[`${series.key}MovingAverage`],
    })),
    borderColor: series.color,
    backgroundColor: series.color,
    borderWidth: 2.4,
    borderDash: [7, 5],
    pointRadius: 0,
    pointHoverRadius: 3,
    tension: 0,
  }));
  return [...raw, ...moving];
}

export class GenerationChart {
  #canvas;
  #summary;
  #history = null;
  #view = null;
  #model = createGenerationChartModel([]);
  #chart;
  #profiler;

  constructor({
    canvas,
    summary,
    chartConstructor = globalThis.Chart,
    profiler = NOOP_PERFORMANCE_PROFILER,
  }) {
    if (!canvas || typeof canvas.getContext !== "function" || !summary) {
      throw new TypeError("GenerationChart exige canvas e resumo textual.");
    }
    const ChartConstructor = requireChartConstructor(chartConstructor);
    this.#canvas = canvas;
    this.#summary = summary;
    this.#profiler = profiler;
    this.#chart = new ChartConstructor(canvas, {
      type: "line",
      data: { datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        normalized: true,
        parsing: false,
        interaction: { axis: "x", intersect: false, mode: "index" },
        plugins: {
          decimation: { enabled: false },
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => `Geração ${items[0]?.raw?.x ?? "—"}`,
              label: (item) => `${item.dataset.label}: ${formatFitness(item.raw.y)}`,
            },
          },
        },
        scales: {
          x: {
            type: "linear",
            grid: { color: "rgba(169, 183, 174, 0.10)" },
            ticks: { color: "#a9b7ae", precision: 0 },
            title: { display: true, text: "Geração", color: "#a9b7ae" },
          },
          y: {
            beginAtZero: true,
            min: 0,
            grid: { color: "rgba(169, 183, 174, 0.14)" },
            ticks: { color: "#a9b7ae" },
          },
        },
      },
    });
  }

  render(history, view = "last50") {
    if (history === this.#history && view === this.#view) {
      return;
    }
    return this.#profiler.measure("ui.chartjs-history-update", () => {
      this.#history = history;
      this.#view = view;
      this.#model = createGenerationChartModel(history, view);
      this.#renderSummary(history, view);
      this.#chart.data.datasets = createGenerationChartDatasets(this.#model);
      const firstGeneration = this.#model.points[0]?.generation ?? 0;
      const lastGeneration = this.#model.points.at(-1)?.generation ?? 1;
      this.#chart.options.scales.x.min = this.#model.points.length === 1
        ? firstGeneration - 0.5
        : firstGeneration;
      this.#chart.options.scales.x.max = this.#model.points.length === 1
        ? lastGeneration + 0.5
        : Math.max(1, lastGeneration);
      this.#chart.options.scales.y.max = this.#model.maximumFitness;
      this.#chart.update("none");
    });
  }

  #renderSummary(history) {
    const latest = history.at(-1);
    if (!latest) {
      this.#summary.textContent = "O histórico aparecerá após o encerramento da primeira geração.";
      this.#canvas.setAttribute(
        "aria-label",
        "Histórico evolutivo vazio; nenhuma geração foi concluída.",
      );
      return;
    }

    const reason = latest.completionReason === "extinction"
      ? "extinção"
      : "limite de tempo";
    this.#summary.textContent = `Geração ${latest.generation} · ${reason} · melhor ${formatFitness(latest.bestFitness)} · média ${formatFitness(latest.meanFitness)} · Top K (${latest.globalTopKCount}) ${formatFitness(latest.globalTopKMeanFitness)} · Top 10% (${latest.topTenPercentCount}) ${formatFitness(latest.topTenPercentMeanFitness)}`;
    this.#canvas.setAttribute(
      "aria-label",
      `Gráfico de ${this.#model.points.length} gerações com quatro séries de fitness brutas e suas médias móveis de dez gerações.`,
    );
  }
}
