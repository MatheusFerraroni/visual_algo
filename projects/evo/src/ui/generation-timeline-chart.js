import {
  createTimeMovingAverage,
  intervalBarGeometryPlugin,
  requireChartConstructor,
} from "./chart-utils.js";
import { NOOP_PERFORMANCE_PROFILER } from "../debug/performance-profiler.js";

const NUMBER_FORMAT = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 2,
});

const PERCENT_FORMAT = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 1,
});

function freezeDefinition(definition) {
  return Object.freeze({
    ...definition,
    series: Object.freeze(definition.series.map((series) => Object.freeze({ ...series }))),
  });
}

export const GENERATION_TIMELINE_CHARTS = Object.freeze([
  freezeDefinition({
    id: "population",
    title: "Seres e comidas",
    series: [
      { key: "aliveBeingCount", label: "Seres vivos", color: "#56d98b", type: "line" },
      { key: "availableFoodCount", label: "Comidas", color: "#f1c979", type: "line" },
    ],
  }),
  freezeDefinition({
    id: "food-energy",
    title: "Energia disponível em comida",
    series: [
      { key: "totalFoodEnergy", label: "Energia total", color: "#f1c979", type: "line" },
    ],
  }),
  freezeDefinition({
    id: "being-condition",
    title: "Condição dos seres vivos",
    series: [
      { key: "meanAliveEnergy", label: "Energia média", color: "#67d7f0", type: "line" },
      { key: "meanAliveLife", label: "Vida média", color: "#ef7f83", type: "line" },
    ],
  }),
  freezeDefinition({
    id: "fitness",
    title: "Fitness",
    movingAverageSeconds: 5,
    series: [
      { key: "bestFitness", label: "Melhor", color: "#56d98b", type: "line" },
      { key: "meanFitness", label: "Média", color: "#f1c979", type: "line" },
    ],
  }),
  freezeDefinition({
    id: "movement",
    title: "Movimento e água",
    fixedMaximum: 1,
    series: [
      { key: "meanAliveAbsoluteSpeed", label: "Velocidade média", color: "#67d7f0", type: "line" },
      { key: "aliveInWaterFraction", label: "Seres na água", color: "#8aa8ff", type: "line", percent: true },
    ],
  }),
  freezeDefinition({
    id: "deaths",
    title: "Mortes",
    series: [
      { key: "deathsInInterval", label: "No intervalo", color: "#ef7f83", type: "bar" },
      { key: "cumulativeDeaths", label: "Acumuladas", color: "#f1c979", type: "line" },
    ],
  }),
  freezeDefinition({
    id: "food-flow",
    title: "Fluxo de comidas",
    bucketSeconds: 5,
    series: [
      { key: "foodsCreatedInInterval", label: "Criadas", color: "#56d98b", type: "bar" },
      { key: "foodsConsumedInInterval", label: "Esgotadas", color: "#ef7f83", type: "bar" },
    ],
  }),
]);

export function getTimelineChartDefinition(id) {
  const definition = GENERATION_TIMELINE_CHARTS.find((item) => item.id === id);
  if (!definition) {
    throw new RangeError(`Gráfico temporal desconhecido: ${id}`);
  }
  return definition;
}

export function createGenerationTimelineOptions(snapshot) {
  if (!snapshot || !Number.isSafeInteger(snapshot.generation)
    || !Array.isArray(snapshot.generationHistory)) {
    throw new TypeError("Snapshot inválido para o seletor de timelines.");
  }
  return Object.freeze([
    Object.freeze({ value: "current", label: `Atual — G${snapshot.generation}` }),
    ...snapshot.generationHistory.map((record) => Object.freeze({
      value: String(record.generation),
      label: `Concluída — G${record.generation}`,
    })),
  ]);
}

export function selectGenerationTimeline(snapshot, selection = "current") {
  const options = createGenerationTimelineOptions(snapshot);
  if (selection === "current") {
    return Object.freeze({
      selection,
      timeline: snapshot.currentGenerationTimeline,
      completed: false,
      options,
    });
  }
  const record = snapshot.generationHistory.find(
    (item) => String(item.generation) === String(selection),
  );
  if (!record) {
    return Object.freeze({
      selection: "current",
      timeline: snapshot.currentGenerationTimeline,
      completed: false,
      options,
    });
  }
  return Object.freeze({
    selection: String(selection),
    timeline: record.timeline,
    completed: true,
    options,
  });
}

export function getAdjacentGenerationTimelineSelection(snapshot, selection, direction) {
  if (![-1, 1].includes(direction)) {
    throw new RangeError("A direção da navegação deve ser -1 ou 1.");
  }
  const selected = selectGenerationTimeline(snapshot, selection).selection;
  const chronological = [
    ...snapshot.generationHistory.map((record) => String(record.generation)),
    "current",
  ];
  const currentIndex = chronological.indexOf(selected);
  const targetIndex = currentIndex + direction;
  if (targetIndex < 0 || targetIndex >= chronological.length) {
    return selected;
  }
  return chronological[targetIndex];
}

function assertTimeline(timeline) {
  if (!timeline || !Number.isSafeInteger(timeline.generation)
    || !Number.isFinite(timeline.configuredDurationSeconds)
    || timeline.configuredDurationSeconds <= 0
    || !Array.isArray(timeline.samples)) {
    throw new TypeError("Timeline de geração inválida.");
  }
}

export function createGenerationTimelineChartModel(
  timeline,
  definition,
  { completed = false } = {},
) {
  assertTimeline(timeline);
  const createPoint = (sample, index, intervalStartSeconds) => {
    if (!sample || !Number.isFinite(sample.simulatedTimeSeconds)
      || sample.simulatedTimeSeconds < 0) {
      throw new TypeError(`A amostra temporal ${index} é inválida.`);
    }
    const values = {};
    for (const series of definition.series) {
      const value = sample[series.key];
      if (value !== null && (!Number.isFinite(value) || value < 0)) {
        throw new TypeError(`A métrica ${series.key} da amostra ${index} é inválida.`);
      }
      values[series.key] = value;
    }
    return Object.freeze({
      simulatedTimeSeconds: sample.simulatedTimeSeconds,
      intervalStartSeconds,
      intervalEndSeconds: sample.simulatedTimeSeconds,
      values: Object.freeze(values),
    });
  };
  const rawPoints = timeline.samples.map((sample, index) => createPoint(
    sample,
    index,
    index === 0 ? sample.simulatedTimeSeconds : timeline.samples[index - 1].simulatedTimeSeconds,
  ));
  let points = rawPoints;
  if (definition.bucketSeconds) {
    const latestTime = timeline.samples.at(-1)?.simulatedTimeSeconds ?? 0;
    const completeBucketCount = Math.floor(latestTime / definition.bucketSeconds);
    const finalCompleteTime = completeBucketCount * definition.bucketSeconds;
    const includesPartialBucket = completed && latestTime > finalCompleteTime;
    const bucketValues = Array.from(
      { length: completeBucketCount + (includesPartialBucket ? 1 : 0) },
      () => Object.fromEntries(definition.series.map((series) => [series.key, 0])),
    );
    for (const sample of timeline.samples) {
      if (sample.simulatedTimeSeconds <= 0) {
        continue;
      }
      const bucketIndex = Math.ceil(
        sample.simulatedTimeSeconds / definition.bucketSeconds,
      ) - 1;
      if (bucketIndex < 0 || bucketIndex >= bucketValues.length) {
        continue;
      }
      for (const series of definition.series) {
        bucketValues[bucketIndex][series.key] += sample[series.key];
      }
    }
    points = Object.freeze(bucketValues.map((values, index) => {
      const start = index * definition.bucketSeconds;
      const end = index < completeBucketCount
        ? start + definition.bucketSeconds
        : latestTime;
      return Object.freeze({
        simulatedTimeSeconds: end,
        intervalStartSeconds: start,
        intervalEndSeconds: end,
        values: Object.freeze(values),
      });
    }));
  }
  const numericValues = points.flatMap((point) => definition.series
    .map((series) => point.values[series.key])
    .filter((value) => value !== null));
  const latestTime = timeline.samples.at(-1)?.simulatedTimeSeconds ?? 0;
  const maximumValue = definition.fixedMaximum ?? Math.max(1, ...numericValues);
  const maximumTime = completed
    ? Math.max(1, latestTime)
    : Math.max(1, timeline.configuredDurationSeconds, latestTime);
  return Object.freeze({
    generation: timeline.generation,
    points: Object.freeze(points),
    maximumTime,
    maximumValue,
    bucketSeconds: definition.bucketSeconds ?? null,
  });
}

function formatValue(value, series) {
  if (value === null) {
    return "sem seres vivos";
  }
  return series.percent ? PERCENT_FORMAT.format(value) : NUMBER_FORMAT.format(value);
}

export function createGenerationTimelineDatasets(model, definition) {
  if (!model || !Array.isArray(model.points) || !definition) {
    throw new TypeError("O modelo temporal e sua definição são obrigatórios.");
  }
  const datasets = definition.series.map((series) => ({
    type: series.type,
    label: series.label,
    data: model.points.map((point) => ({
      x: series.type === "bar"
        ? (point.intervalStartSeconds + point.intervalEndSeconds) / 2
        : point.simulatedTimeSeconds,
      y: point.values[series.key],
      intervalStartSeconds: point.intervalStartSeconds,
      intervalEndSeconds: point.intervalEndSeconds,
    })),
    borderColor: series.color,
    backgroundColor: series.color,
    borderWidth: series.type === "bar" ? 0 : 1.7,
    pointRadius: 0,
    pointHoverRadius: 3,
    tension: 0,
    evoIntervalBars: series.type === "bar",
    evoPercent: series.percent === true,
  }));
  if (definition.movingAverageSeconds) {
    for (const series of definition.series.filter(({ type }) => type === "line")) {
      datasets.push({
        type: "line",
        label: `${series.label} · MM${definition.movingAverageSeconds} s`,
        data: createTimeMovingAverage(
          model.points.map((point) => ({
            x: point.simulatedTimeSeconds,
            y: point.values[series.key],
          })),
          definition.movingAverageSeconds,
        ),
        borderColor: series.color,
        backgroundColor: series.color,
        borderWidth: 2.4,
        borderDash: [7, 5],
        pointRadius: 0,
        pointHoverRadius: 3,
        tension: 0,
        evoIntervalBars: false,
        evoPercent: series.percent === true,
      });
    }
  }
  return datasets;
}

export class GenerationTimelineChart {
  #canvas;
  #summary;
  #definition;
  #timeline = null;
  #completed = null;
  #model = null;
  #chart;
  #profiler;

  constructor({
    canvas,
    summary,
    definition,
    chartConstructor = globalThis.Chart,
    profiler = NOOP_PERFORMANCE_PROFILER,
  }) {
    if (!canvas || typeof canvas.getContext !== "function" || !summary) {
      throw new TypeError("GenerationTimelineChart exige canvas e resumo textual.");
    }
    const ChartConstructor = requireChartConstructor(chartConstructor);
    this.#canvas = canvas;
    this.#summary = summary;
    this.#definition = definition;
    this.#profiler = profiler;
    this.#chart = new ChartConstructor(canvas, {
      type: "line",
      data: { datasets: [] },
      plugins: [intervalBarGeometryPlugin],
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
              title: (items) => {
                const item = items[0];
                const point = item?.raw;
                if (!point) {
                  return "—";
                }
                if (item.dataset.evoIntervalBars
                  && point.intervalEndSeconds > point.intervalStartSeconds) {
                  return `${NUMBER_FORMAT.format(point.intervalStartSeconds)}–${NUMBER_FORMAT.format(point.intervalEndSeconds)} s`;
                }
                return `${NUMBER_FORMAT.format(point.x)} s`;
              },
              label: (item) => {
                const formatter = item.dataset.evoPercent ? PERCENT_FORMAT : NUMBER_FORMAT;
                const value = item.raw.y === null
                  ? "sem seres vivos"
                  : formatter.format(item.raw.y);
                return `${item.dataset.label}: ${value}`;
              },
            },
          },
        },
        scales: {
          x: {
            type: "linear",
            min: 0,
            grid: { color: "rgba(169, 183, 174, 0.10)" },
            ticks: {
              color: "#a9b7ae",
              callback: (value) => `${NUMBER_FORMAT.format(value)} s`,
            },
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

  render(timeline, { completed = false } = {}) {
    if (timeline === this.#timeline && completed === this.#completed) {
      return;
    }
    return this.#profiler.measure("ui.chartjs-timeline-update", () => {
      this.#timeline = timeline;
      this.#completed = completed;
      this.#model = createGenerationTimelineChartModel(
        timeline,
        this.#definition,
        { completed },
      );
      this.#renderSummary();
      this.#chart.data.datasets = createGenerationTimelineDatasets(
        this.#model,
        this.#definition,
      );
      this.#chart.options.scales.x.max = this.#model.maximumTime;
      this.#chart.options.scales.y.max = this.#model.maximumValue;
      this.#chart.options.scales.y.ticks.callback = this.#definition.fixedMaximum === 1
        ? (value) => PERCENT_FORMAT.format(value)
        : (value) => NUMBER_FORMAT.format(value);
      this.#chart.update("none");
    });
  }

  #renderSummary() {
    const latest = this.#model.points.at(-1);
    if (!latest) {
      if (this.#definition.bucketSeconds && this.#timeline.samples.length > 0) {
        this.#summary.textContent = `Aguardando a primeira janela completa de ${this.#definition.bucketSeconds} s.`;
        this.#canvas.setAttribute(
          "aria-label",
          `${this.#definition.title} da geração ${this.#timeline.generation}: aguardando ${this.#definition.bucketSeconds} segundos simulados.`,
        );
        return;
      }
      this.#summary.textContent = "Nenhuma amostra disponível.";
      this.#canvas.setAttribute("aria-label", `${this.#definition.title}: sem amostras.`);
      return;
    }
    const values = this.#definition.series.map(
      (series) => `${series.label.toLocaleLowerCase()} ${formatValue(latest.values[series.key], series)}`,
    );
    const timeLabel = this.#definition.bucketSeconds
      ? `${latest.intervalStartSeconds.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}–${latest.intervalEndSeconds.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} s`
      : `${latest.simulatedTimeSeconds.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} s`;
    this.#summary.textContent = `${timeLabel} · ${values.join(" · ")}`;
    const pointLabel = this.#definition.bucketSeconds
      ? (this.#model.points.length === 1 ? "intervalo" : "intervalos")
      : (this.#model.points.length === 1 ? "amostra" : "amostras");
    const movingLabel = this.#definition.movingAverageSeconds
      ? `, incluindo médias móveis de ${this.#definition.movingAverageSeconds} segundos`
      : "";
    this.#canvas.setAttribute(
      "aria-label",
      `${this.#definition.title} da geração ${this.#timeline.generation}, com ${this.#model.points.length} ${pointLabel}${movingLabel} até ${latest.intervalEndSeconds.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} segundos.`,
    );
  }
}
