import assert from "node:assert/strict";
import test from "node:test";

import {
  createGenerationTimelineChartModel,
  createGenerationTimelineDatasets,
  createGenerationTimelineOptions,
  GenerationTimelineChart,
  getAdjacentGenerationTimelineSelection,
  getTimelineChartDefinition,
  selectGenerationTimeline,
} from "../src/ui/generation-timeline-chart.js";
import {
  calculateIntervalBarGeometry,
  createTimeMovingAverage,
} from "../src/ui/chart-utils.js";

function createTimeline() {
  return Object.freeze({
    generation: 3,
    configuredDurationSeconds: 120,
    sampleIntervalTicks: 30,
    samples: Object.freeze([
      Object.freeze({
        simulatedTimeSeconds: 0,
        aliveBeingCount: 4,
        availableFoodCount: 2,
        totalFoodEnergy: 30,
        meanAliveEnergy: 60,
        meanAliveLife: 100,
        bestFitness: 0,
        meanFitness: 0,
        meanAliveAbsoluteSpeed: 0,
        aliveInWaterFraction: 0,
        deathsInInterval: 0,
        cumulativeDeaths: 0,
        foodsCreatedInInterval: 0,
        foodsConsumedInInterval: 0,
      }),
      Object.freeze({
        simulatedTimeSeconds: 1,
        aliveBeingCount: 0,
        availableFoodCount: 3,
        totalFoodEnergy: 42,
        meanAliveEnergy: null,
        meanAliveLife: null,
        bestFitness: 2,
        meanFitness: 1,
        meanAliveAbsoluteSpeed: null,
        aliveInWaterFraction: null,
        deathsInInterval: 4,
        cumulativeDeaths: 4,
        foodsCreatedInInterval: 1,
        foodsConsumedInInterval: 0,
      }),
    ]),
  });
}

function createFoodFlowTimeline({ terminalTime = 12 } = {}) {
  const events = [
    [0, 0, 0],
    [1, 1, 0],
    [3, 2, 0],
    [5, 0, 1],
    [6, 3, 0],
    [10, 0, 2],
  ].filter(([time]) => time < terminalTime);
  events.push([terminalTime, 4, 0]);
  return Object.freeze({
    generation: 7,
    configuredDurationSeconds: 120,
    sampleIntervalTicks: 30,
    samples: Object.freeze(events.map(([simulatedTimeSeconds, created, consumed]) => Object.freeze({
      simulatedTimeSeconds,
      foodsCreatedInInterval: created,
      foodsConsumedInInterval: consumed,
    }))),
  });
}

test("modelos temporais preservam amostras, lacunas e escalas com zero", () => {
  const timeline = createTimeline();
  const condition = createGenerationTimelineChartModel(
    timeline,
    getTimelineChartDefinition("being-condition"),
  );
  assert.equal(condition.points.length, 2);
  assert.equal(condition.points[1].values.meanAliveEnergy, null);
  assert.equal(condition.maximumValue, 100);
  assert.equal(condition.maximumTime, 120);
  assert(Object.isFrozen(condition));
  assert(Object.isFrozen(condition.points));

  const completed = createGenerationTimelineChartModel(
    timeline,
    getTimelineChartDefinition("deaths"),
    { completed: true },
  );
  assert.equal(completed.maximumTime, 1);
  assert.equal(completed.maximumValue, 4);
  assert.deepEqual(
    completed.points.map((point) => point.values.deathsInInterval),
    [0, 4],
  );

  const movement = createGenerationTimelineChartModel(
    timeline,
    getTimelineChartDefinition("movement"),
  );
  assert.equal(movement.maximumValue, 1);
});

test("renderer Chart.js é reutilizado e publica resumo acessível", () => {
  const instances = [];
  class FakeChart {
    constructor(canvas, config) {
      this.canvas = canvas;
      this.data = config.data;
      this.options = config.options;
      this.plugins = config.plugins;
      this.updates = [];
      instances.push(this);
    }

    update(mode) {
      this.updates.push(mode);
    }
  }
  const attributes = new Map();
  const canvas = {
    getContext() {},
    setAttribute: (name, value) => attributes.set(name, value),
  };
  const summary = { textContent: "" };
  const chart = new GenerationTimelineChart({
    canvas,
    summary,
    definition: getTimelineChartDefinition("deaths"),
    chartConstructor: FakeChart,
  });
  const timeline = createTimeline();
  chart.render(timeline, { completed: true });

  assert.equal(instances.length, 1);
  assert.equal(instances[0].data.datasets.length, 2);
  assert.deepEqual(instances[0].data.datasets.map(({ type }) => type), ["bar", "line"]);
  assert.deepEqual(instances[0].updates, ["none"]);
  assert.match(summary.textContent, /1 s.*no intervalo 4.*acumuladas 4/);
  assert.match(attributes.get("aria-label"), /geração 3.*2 amostras/);

  chart.render(timeline, { completed: true });
  assert.deepEqual(instances[0].updates, ["none"]);
});

test("fitness temporal mantém valores brutos e médias móveis de cinco segundos", () => {
  const definition = getTimelineChartDefinition("fitness");
  const datasets = createGenerationTimelineDatasets(
    createGenerationTimelineChartModel(createTimeline(), definition),
    definition,
  );
  assert.equal(datasets.length, 4);
  assert.deepEqual(datasets.map(({ label }) => label), [
    "Melhor",
    "Média",
    "Melhor · MM5 s",
    "Média · MM5 s",
  ]);
  assert.deepEqual(datasets[2].data, [{ x: 0, y: 0 }, { x: 1, y: 1 }]);
  assert.deepEqual(datasets[3].data, [{ x: 0, y: 0 }, { x: 1, y: 0.5 }]);

  assert.deepEqual(createTimeMovingAverage([
    { x: 0, y: 0 },
    { x: 1, y: 1 },
    { x: 2, y: 2 },
    { x: 3, y: 3 },
    { x: 4, y: 4 },
    { x: 5, y: 5 },
  ], 5).at(-1), { x: 5, y: 3 });
});

test("fluxo agrega somente janelas completas de cinco segundos e conserva eventos", () => {
  const timeline = createFoodFlowTimeline();
  const definition = getTimelineChartDefinition("food-flow");
  const current = createGenerationTimelineChartModel(timeline, definition);
  assert.deepEqual(current.points, [
    {
      simulatedTimeSeconds: 5,
      intervalStartSeconds: 0,
      intervalEndSeconds: 5,
      values: { foodsCreatedInInterval: 3, foodsConsumedInInterval: 1 },
    },
    {
      simulatedTimeSeconds: 10,
      intervalStartSeconds: 5,
      intervalEndSeconds: 10,
      values: { foodsCreatedInInterval: 3, foodsConsumedInInterval: 2 },
    },
  ]);
  const completed = createGenerationTimelineChartModel(timeline, definition, { completed: true });
  assert.deepEqual(completed.points.at(-1), {
    simulatedTimeSeconds: 12,
    intervalStartSeconds: 10,
    intervalEndSeconds: 12,
    values: { foodsCreatedInInterval: 4, foodsConsumedInInterval: 0 },
  });
  assert.equal(
    completed.points.reduce((total, point) => total + point.values.foodsCreatedInInterval, 0),
    10,
  );
  assert.equal(
    completed.points.reduce((total, point) => total + point.values.foodsConsumedInInterval, 0),
    3,
  );

  const short = createGenerationTimelineChartModel(
    createFoodFlowTimeline({ terminalTime: 2 }),
    definition,
    { completed: true },
  );
  assert.equal(short.points.length, 1);
  assert.equal(short.points[0].intervalEndSeconds, 2);
});

test("largura temporal das barras permanece estável ao acrescentar amostras", () => {
  const initial = calculateIntervalBarGeometry({
    intervalStartPixel: 40,
    intervalEndPixel: 43,
    seriesIndex: 0,
    seriesCount: 1,
  });
  const afterMoreSamples = calculateIntervalBarGeometry({
    intervalStartPixel: 40,
    intervalEndPixel: 43,
    seriesIndex: 0,
    seriesCount: 1,
  });
  assert.deepEqual(afterMoreSamples, initial);

  const firstFoodSeries = calculateIntervalBarGeometry({
    intervalStartPixel: 10,
    intervalEndPixel: 60,
    seriesIndex: 0,
    seriesCount: 2,
  });
  const secondFoodSeries = calculateIntervalBarGeometry({
    intervalStartPixel: 10,
    intervalEndPixel: 60,
    seriesIndex: 1,
    seriesCount: 2,
  });
  assert.equal(firstFoodSeries.width, secondFoodSeries.width);
  assert(secondFoodSeries.x > firstFoodSeries.x);
});

test("timeline e métricas incompatíveis falham fechadas", () => {
  assert.throws(
    () => createGenerationTimelineChartModel(
      { generation: 1, configuredDurationSeconds: 0, samples: [] },
      getTimelineChartDefinition("fitness"),
    ),
    /Timeline de geração inválida/,
  );
  const timeline = createTimeline();
  const invalid = {
    ...timeline,
    samples: [{ ...timeline.samples[0], bestFitness: Number.NaN }],
  };
  assert.throws(
    () => createGenerationTimelineChartModel(
      invalid,
      getTimelineChartDefinition("fitness"),
    ),
    /bestFitness/,
  );
  assert.throws(() => getTimelineChartDefinition("unknown"), /desconhecido/);
});

test("seletor acompanha a atual, fixa concluídas e volta à atual após reset", () => {
  const first = createTimeline();
  const second = Object.freeze({ ...first, generation: 4 });
  const snapshot = {
    generation: 4,
    currentGenerationTimeline: second,
    generationHistory: [Object.freeze({ generation: 3, timeline: first })],
  };
  assert.deepEqual(createGenerationTimelineOptions(snapshot), [
    { value: "current", label: "Atual — G4" },
    { value: "3", label: "Concluída — G3" },
  ]);
  const historical = selectGenerationTimeline(snapshot, "3");
  assert.strictEqual(historical.timeline, first);
  assert.equal(historical.completed, true);

  const laterSnapshot = {
    generation: 5,
    currentGenerationTimeline: Object.freeze({ ...first, generation: 5 }),
    generationHistory: [
      snapshot.generationHistory[0],
      Object.freeze({ generation: 4, timeline: second }),
    ],
  };
  assert.strictEqual(selectGenerationTimeline(laterSnapshot, "3").timeline, first);
  const resetSnapshot = {
    generation: 1,
    currentGenerationTimeline: Object.freeze({ ...first, generation: 1 }),
    generationHistory: [],
  };
  const fallback = selectGenerationTimeline(resetSnapshot, "3");
  assert.equal(fallback.selection, "current");
  assert.strictEqual(fallback.timeline, resetSnapshot.currentGenerationTimeline);
});

test("navegação temporal percorre concluídas em ordem e termina na atual", () => {
  const timeline = createTimeline();
  const snapshot = {
    generation: 3,
    currentGenerationTimeline: Object.freeze({ ...timeline, generation: 3 }),
    generationHistory: [
      Object.freeze({ generation: 1, timeline: Object.freeze({ ...timeline, generation: 1 }) }),
      Object.freeze({ generation: 2, timeline: Object.freeze({ ...timeline, generation: 2 }) }),
    ],
  };
  assert.equal(getAdjacentGenerationTimelineSelection(snapshot, "current", -1), "2");
  assert.equal(getAdjacentGenerationTimelineSelection(snapshot, "2", -1), "1");
  assert.equal(getAdjacentGenerationTimelineSelection(snapshot, "1", -1), "1");
  assert.equal(getAdjacentGenerationTimelineSelection(snapshot, "1", 1), "2");
  assert.equal(getAdjacentGenerationTimelineSelection(snapshot, "2", 1), "current");
  assert.equal(getAdjacentGenerationTimelineSelection(snapshot, "current", 1), "current");
  assert.equal(getAdjacentGenerationTimelineSelection(snapshot, "inexistente", 1), "current");
  assert.throws(
    () => getAdjacentGenerationTimelineSelection(snapshot, "current", 0),
    /direção/,
  );
});
