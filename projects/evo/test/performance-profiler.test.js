import assert from "node:assert/strict";
import test from "node:test";

import { createConfig, DEFAULT_CONFIG } from "../src/config.js";
import { FoodSystem } from "../src/core/food-system.js";
import { SimulationClock } from "../src/core/simulation-clock.js";
import { Simulation } from "../src/core/simulation.js";
import {
  NOOP_PERFORMANCE_PROFILER,
  PerformanceProfiler,
} from "../src/debug/performance-profiler.js";
import { GenerationChart } from "../src/ui/generation-chart.js";
import {
  GenerationTimelineChart,
  getTimelineChartDefinition,
} from "../src/ui/generation-timeline-chart.js";

function findStage(snapshot, stageId) {
  for (const category of snapshot.categories) {
    const stage = category.stages.find(({ id }) => id === stageId);
    if (stage) {
      return stage;
    }
  }
  throw new Error(`Etapa ausente: ${stageId}`);
}

test("profiler mede etapas aninhadas e calcula agregados da sessão", () => {
  let now = 0;
  const profiler = new PerformanceProfiler({ now: () => now });
  profiler.startSession({ mode: "running", speed: 2 });

  profiler.measure("execution.build", () => {
    now += 2;
    profiler.measure("execution.config", () => {
      now += 3;
    });
    now += 5;
  });

  const snapshot = profiler.getSnapshot();
  const parent = findStage(snapshot, "execution.build");
  const child = findStage(snapshot, "execution.config");
  assert.equal(parent.lastMs, 10);
  assert.equal(parent.meanMs, 10);
  assert.equal(parent.p95Ms, 10);
  assert.equal(parent.maxMs, 10);
  assert.equal(parent.callCount, 1);
  assert.equal(parent.totalMs, 10);
  assert.equal(child.lastMs, 3);
  assert.equal(child.parentShare, 0.3);
  assert.equal(snapshot.context.mode, "running");
  assert.equal(snapshot.context.speed, 2);
});

test("janela limitada calcula média, P95 e máximo das chamadas recentes", () => {
  let now = 0;
  const profiler = new PerformanceProfiler({ now: () => now, sampleLimit: 3 });
  profiler.startSession();
  for (const duration of [1, 2, 100, 3]) {
    profiler.measure("simulation.tick", () => {
      now += duration;
    });
  }

  const stage = findStage(profiler.getSnapshot(), "simulation.tick");
  assert.equal(stage.lastMs, 3);
  assert.equal(stage.meanMs, 35);
  assert.equal(stage.p95Ms, 100);
  assert.equal(stage.maxMs, 100);
  assert.equal(stage.callCount, 4);
  assert.equal(stage.totalMs, 106);
});

test("exceções encerram a medição e pausa congela as estatísticas", () => {
  let now = 0;
  const profiler = new PerformanceProfiler({ now: () => now });
  profiler.startSession();
  assert.throws(
    () => profiler.measure("events.runtime-config", () => {
      now += 4;
      throw new Error("falha esperada");
    }),
    /falha esperada/,
  );
  profiler.pause();
  profiler.measure("events.runtime-config", () => {
    now += 50;
  });
  assert.equal(findStage(profiler.getSnapshot(), "events.runtime-config").totalMs, 4);
  assert.equal(profiler.getSnapshot().collecting, false);

  profiler.resume();
  profiler.measure("events.runtime-config", () => {
    now += 6;
  });
  assert.equal(findStage(profiler.getSnapshot(), "events.runtime-config").totalMs, 10);
});

test("contexto operacional usa janela de frames e reset não encerra a sessão", () => {
  const profiler = new PerformanceProfiler({ now: () => 0 });
  profiler.startSession({ mode: "running", speed: 4 });
  profiler.updateContext({
    generation: 3,
    tick: 45,
    aliveBeings: 7,
    totalBeings: 10,
    foods: 22,
  });
  profiler.recordFrame({ realDeltaMs: 20, ticksProcessed: 2 });
  profiler.recordFrame({ realDeltaMs: 30, ticksProcessed: 4 });

  const context = profiler.getSnapshot().context;
  assert.equal(context.framesPerSecond, 40);
  assert.equal(context.lastFrameIntervalMs, 30);
  assert.equal(context.lastTicksPerFrame, 4);
  assert.equal(context.meanTicksPerFrame, 3);
  assert.equal(context.ticksPerSecond, 120);
  assert.equal(context.generation, 3);
  assert.equal(context.aliveBeings, 7);

  profiler.resetStatistics();
  const reset = profiler.getSnapshot();
  assert.equal(reset.hasSession, true);
  assert.equal(reset.collecting, true);
  assert.equal(reset.context.framesPerSecond, null);
  assert.equal(reset.context.generation, 3);
});

test("snapshots são profundamente imutáveis, cacheados e invalidados por mudança", () => {
  let now = 0;
  const profiler = new PerformanceProfiler({ now: () => now });
  profiler.startSession();
  const first = profiler.getSnapshot();
  assert.equal(first, profiler.getSnapshot());
  assert(Object.isFrozen(first));
  assert(Object.isFrozen(first.context));
  assert(Object.isFrozen(first.categories));
  assert(Object.isFrozen(first.categories[0]));
  assert(Object.isFrozen(first.categories[0].stages));
  assert(Object.isFrozen(first.categories[0].stages[0]));

  profiler.measure("simulation.tick", () => {
    now += 1;
  });
  const second = profiler.getSnapshot();
  assert.notEqual(first, second);
  profiler.clear();
  assert.equal(profiler.getSnapshot().hasSession, false);
});

test("profiler no-op executa callbacks sem criar observabilidade", () => {
  let calls = 0;
  const result = NOOP_PERFORMANCE_PROFILER.measure("qualquer-etapa", () => {
    calls += 1;
    return 42;
  });
  assert.equal(result, 42);
  assert.equal(calls, 1);
  assert.equal(NOOP_PERFORMANCE_PROFILER.getSnapshot().hasSession, false);
});

test("instrumentação cobre realocação de comida e atualizações Chart.js", () => {
  let now = 0;
  const profiler = new PerformanceProfiler({ now: () => now });
  profiler.startSession();
  const constantRandom = { nextFloat: () => 0 };
  const foodSystem = new FoodSystem({
    mapSnapshot: Object.freeze({
      columns: 2,
      rows: 1,
      tiles: Object.freeze([
        Object.freeze({ column: 0, row: 0, type: "land", productivity: 0.5 }),
        Object.freeze({ column: 1, row: 0, type: "land", productivity: 0.5 }),
      ]),
    }),
    config: Object.freeze({
      initialCount: 1,
      spawnCount: 1,
      maxCount: 2,
      minEnergy: 10,
      maxEnergy: 50,
    }),
    spawnIntervalTicks: 30,
    inactivityTimeoutTicks: 1,
    initialRandom: constantRandom,
    spawnRandom: constantRandom,
    relocationRandom: constantRandom,
    initialInactivityRandom: constantRandom,
    spawnInactivityRandom: constantRandom,
    relocationInactivityRandom: constantRandom,
    profiler,
  });
  const initialFood = foodSystem.getSnapshot()[0];
  foodSystem.processTick(1);
  now += 1;
  foodSystem.resolveConsumption([]);
  const relocatedFood = foodSystem.getSnapshot()[0];
  assert.notEqual(relocatedFood.id, initialFood.id);
  assert.notEqual(relocatedFood.column, initialFood.column);

  class FakeChart {
    constructor(_canvas, config) {
      this.data = config.data;
      this.options = config.options;
    }

    update() {
      now += 2;
    }
  }
  const canvas = { getContext() {}, setAttribute() {} };
  const historyChart = new GenerationChart({
    canvas,
    summary: { textContent: "" },
    chartConstructor: FakeChart,
    profiler,
  });
  historyChart.render([Object.freeze({
    generation: 1,
    completionReason: "time-limit",
    survivorCount: 1,
    bestFitness: 2,
    meanFitness: 1,
    globalTopKCount: 1,
    globalTopKMeanFitness: 2,
    topTenPercentCount: 1,
    topTenPercentMeanFitness: 2,
  })]);

  const timelineChart = new GenerationTimelineChart({
    canvas,
    summary: { textContent: "" },
    definition: getTimelineChartDefinition("fitness"),
    chartConstructor: FakeChart,
    profiler,
  });
  timelineChart.render(Object.freeze({
    generation: 1,
    configuredDurationSeconds: 1,
    sampleIntervalTicks: 30,
    samples: Object.freeze([Object.freeze({
      simulatedTimeSeconds: 0,
      bestFitness: 0,
      meanFitness: 0,
    })]),
  }));

  const snapshot = profiler.getSnapshot();
  assert.equal(findStage(snapshot, "food.relocation").callCount, 1);
  assert.equal(findStage(snapshot, "ui.chartjs-history-update").totalMs, 2);
  assert.equal(findStage(snapshot, "ui.chartjs-timeline-update").totalMs, 2);
});

test("instrumentação não altera snapshots, genomas ou streams da simulação", () => {
  const config = createConfig({
    generation: { durationSeconds: 1 },
    population: { size: 4 },
    food: { initialCount: 4 },
    genetics: { eliteCount: 1, tournamentSize: 2 },
  });
  let now = 0;
  const profiler = new PerformanceProfiler({ now: () => {
    now += 0.01;
    return now;
  } });
  profiler.startSession({ mode: "running", speed: 1 });
  const observed = new Simulation(config, { profiler });
  const control = new Simulation(config);

  for (let tick = 0; tick < 35; tick += 1) {
    observed.tick();
    control.tick();
  }

  assert.deepEqual(observed.getSnapshot(), control.getSnapshot());
  for (let beingId = 1; beingId <= config.population.size; beingId += 1) {
    assert.deepEqual(observed.getBeingGenome(beingId), control.getBeingGenome(beingId));
  }
  const observedStream = observed.createRandomStream("prova");
  const controlStream = control.createRandomStream("prova");
  assert.deepEqual(
    Array.from({ length: 5 }, () => observedStream.nextFloat()),
    Array.from({ length: 5 }, () => controlStream.nextFloat()),
  );
  assert(findStage(profiler.getSnapshot(), "map.generate").callCount > 0);
  assert(findStage(profiler.getSnapshot(), "simulation.tick").callCount > 0);
  assert(findStage(profiler.getSnapshot(), "population.decision-neural").callCount > 0);
  assert(findStage(profiler.getSnapshot(), "population.physics").callCount > 0);
  assert(findStage(profiler.getSnapshot(), "food.consume").callCount > 0);
  assert(findStage(profiler.getSnapshot(), "food.relocation").callCount > 0);
  assert(findStage(profiler.getSnapshot(), "evolution.transition").callCount > 0);
  assert(findStage(profiler.getSnapshot(), "evolution.genome").callCount > 0);
});

test("relógio do profiler não interfere no orçamento injetado do modo máximo", () => {
  const createBudgetNow = () => {
    let now = 0;
    return () => {
      const current = now;
      now += 3;
      return current;
    };
  };
  const controlClock = new SimulationClock(DEFAULT_CONFIG.time, { now: createBudgetNow() });
  const observedClock = new SimulationClock(DEFAULT_CONFIG.time, { now: createBudgetNow() });
  let profilerNow = 0;
  const profiler = new PerformanceProfiler({ now: () => {
    profilerNow += 100;
    return profilerNow;
  } });
  profiler.startSession();
  for (const clock of [controlClock, observedClock]) {
    clock.setSpeed("max");
    clock.resume();
  }

  const controlTicks = controlClock.advance(0, () => {});
  const observedTicks = observedClock.advance(0, () => {
    profiler.measure("simulation.tick", () => {});
  });
  assert.equal(observedTicks, controlTicks);
});
