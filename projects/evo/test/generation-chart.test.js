import assert from "node:assert/strict";
import test from "node:test";

import {
  createGenerationChartDatasets,
  createGenerationChartModel,
  GenerationChart,
  selectGenerationHistory,
} from "../src/ui/generation-chart.js";
import { createTrailingMovingAverage } from "../src/ui/chart-utils.js";

function createRecord(generation, overrides = {}) {
  return Object.freeze({
    generation,
    completionReason: "time-limit",
    survivorCount: 4,
    bestFitness: generation * 2,
    meanFitness: generation,
    globalTopKCount: 2,
    globalTopKMeanFitness: generation * 1.5,
    topTenPercentCount: 1,
    topTenPercentMeanFitness: generation * 1.75,
    ...overrides,
  });
}

test("modelo inclui quatro séries e médias móveis com escala iniciada em zero", () => {
  const model = createGenerationChartModel([
    createRecord(3, {
      bestFitness: 8,
      meanFitness: 4,
      globalTopKMeanFitness: 7,
      topTenPercentMeanFitness: 6,
    }),
    createRecord(4, {
      bestFitness: 12,
      meanFitness: 6,
      globalTopKMeanFitness: 10,
      topTenPercentMeanFitness: 9,
    }),
  ]);

  assert.equal(model.points.length, 2);
  assert.deepEqual(model.points[1], {
    generation: 4,
    bestFitness: 12,
    meanFitness: 6,
    globalTopKCount: 2,
    globalTopKMeanFitness: 10,
    topTenPercentCount: 1,
    topTenPercentMeanFitness: 9,
    bestFitnessMovingAverage: 10,
    meanFitnessMovingAverage: 5,
    globalTopKMeanFitnessMovingAverage: 8.5,
    topTenPercentMeanFitnessMovingAverage: 7.5,
  });
  assert.equal(model.maximumFitness, 12);
  assert.equal(model.movingAverageWindow, 10);
  assert(Object.isFrozen(model));
  assert(Object.isFrozen(model.points));
  assert(model.points.every(Object.isFrozen));
  assert.equal(createGenerationChartModel([]).maximumFitness, 1);
});

test("modelo rejeita históricos incompatíveis", () => {
  assert.throws(() => createGenerationChartModel(null), /deve ser uma lista/);
  assert.throws(
    () => createGenerationChartModel([{ generation: 0, bestFitness: 1 }]),
    /registro histórico 0 é inválido/,
  );
  assert.throws(() => createGenerationChartModel([], "recent"), /last50 ou all/);
});

test("recorte ocorre depois da média móvel e não altera o histórico", () => {
  const history = Object.freeze(Array.from(
    { length: 55 },
    (_, index) => createRecord(index + 1),
  ));

  assert.deepEqual(
    selectGenerationHistory(history, "last50").map(({ generation }) => generation),
    Array.from({ length: 50 }, (_, index) => index + 6),
  );
  const recent = createGenerationChartModel(history, "last50");
  assert.equal(recent.points.length, 50);
  assert.equal(recent.points[0].generation, 6);
  assert.equal(recent.points[0].meanFitnessMovingAverage, 3.5);
  assert.equal(createGenerationChartModel(history, "all").points.length, 55);
  assert.equal(history.length, 55);
});

test("média móvel usa prefixo, janela completa e valida entradas", () => {
  assert.deepEqual(createTrailingMovingAverage([2, 4, 8, 10], 3), [2, 3, 4.666667, 7.333333]);
  assert.throws(() => createTrailingMovingAverage(null, 3), /lista/);
  assert.throws(() => createTrailingMovingAverage([1], 0), /inteiro positivo/);
  assert.throws(() => createTrailingMovingAverage([Number.NaN], 3), /deve ser finito/);
});

test("datasets expõem quatro valores brutos e quatro médias móveis", () => {
  const datasets = createGenerationChartDatasets(createGenerationChartModel([
    createRecord(1),
    createRecord(2),
  ]));
  assert.equal(datasets.length, 8);
  assert(datasets.slice(0, 4).every((dataset) => dataset.borderDash === undefined));
  assert(datasets.slice(4).every((dataset) => dataset.borderDash.length === 2));
  assert.deepEqual(datasets[0].data, [{ x: 1, y: 2 }, { x: 2, y: 4 }]);
  assert.deepEqual(datasets[4].data, [{ x: 1, y: 2 }, { x: 2, y: 3 }]);
});

test("renderer Chart.js é criado uma vez e atualizado sem animação", () => {
  const instances = [];
  class FakeChart {
    constructor(canvas, config) {
      this.canvas = canvas;
      this.data = config.data;
      this.options = config.options;
      this.updates = [];
      instances.push(this);
    }

    update(mode) {
      this.updates.push(mode);
    }
  }
  const attributes = new Map();
  const chart = new GenerationChart({
    canvas: {
      getContext() {},
      setAttribute: (name, value) => attributes.set(name, value),
    },
    summary: { textContent: "" },
    chartConstructor: FakeChart,
  });
  const history = Object.freeze([createRecord(1)]);
  chart.render(history, "last50");
  chart.render(history, "last50");

  assert.equal(instances.length, 1);
  assert.deepEqual(instances[0].updates, ["none"]);
  assert.equal(instances[0].data.datasets.length, 8);
  assert.match(attributes.get("aria-label"), /quatro séries.*médias móveis/);
});
