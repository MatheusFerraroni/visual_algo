import {
  PERFORMANCE_CATEGORIES,
  PERFORMANCE_STAGE_BY_ID,
  PERFORMANCE_STAGES,
} from "./performance-stages.js";

const DEFAULT_SAMPLE_LIMIT = 300;
const FRAME_CONTEXT_LIMIT = 60;

function defaultNow() {
  return globalThis.performance.now();
}

function assertNow(now) {
  if (typeof now !== "function") {
    throw new TypeError("PerformanceProfiler exige uma fonte de tempo válida.");
  }
}

function assertSampleLimit(sampleLimit) {
  if (!Number.isSafeInteger(sampleLimit) || sampleLimit <= 0) {
    throw new TypeError("O limite de amostras do profiler deve ser um inteiro positivo.");
  }
}

function percentile95(values) {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((first, second) => first - second);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
}

function mean(values) {
  return values.length === 0
    ? null
    : values.reduce((total, value) => total + value, 0) / values.length;
}

function freezeContext(context, frameSamples, tickStage) {
  const deltaTotal = frameSamples.reduce((total, frame) => total + frame.realDeltaMs, 0);
  const tickTotal = frameSamples.reduce((total, frame) => total + frame.ticksProcessed, 0);
  const meanDeltaMs = frameSamples.length === 0 ? null : deltaTotal / frameSamples.length;
  return Object.freeze({
    mode: context.mode ?? "idle",
    speed: context.speed ?? 1,
    generation: context.generation ?? 1,
    tick: context.tick ?? 0,
    aliveBeings: context.aliveBeings ?? 0,
    totalBeings: context.totalBeings ?? 0,
    foods: context.foods ?? 0,
    lastFrameIntervalMs: frameSamples.at(-1)?.realDeltaMs ?? null,
    meanFrameIntervalMs: meanDeltaMs,
    framesPerSecond: meanDeltaMs > 0 ? 1_000 / meanDeltaMs : null,
    lastTicksPerFrame: frameSamples.at(-1)?.ticksProcessed ?? 0,
    meanTicksPerFrame: frameSamples.length === 0 ? null : tickTotal / frameSamples.length,
    ticksPerSecond: deltaTotal > 0 ? tickTotal / (deltaTotal / 1_000) : null,
    meanTickCostMs: tickStage?.callCount > 0
      ? tickStage.totalMs / tickStage.callCount
      : null,
  });
}

function createNoopProfiler() {
  const emptySnapshot = Object.freeze({
    hasSession: false,
    collecting: false,
    context: freezeContext({}, [], null),
    categories: Object.freeze(PERFORMANCE_CATEGORIES.map((category) => Object.freeze({
      ...category,
      stages: Object.freeze([]),
    }))),
  });
  return Object.freeze({
    startSession() {},
    pause() {},
    resume() {},
    resetStatistics() {},
    clear() {},
    updateContext() {},
    recordFrame() {},
    measure(_stageId, callback) { return callback(); },
    getSnapshot() { return emptySnapshot; },
    get collecting() { return false; },
  });
}

export const NOOP_PERFORMANCE_PROFILER = createNoopProfiler();

export class PerformanceProfiler {
  #now;
  #sampleLimit;
  #stageData = new Map();
  #frameSamples = [];
  #context = {};
  #hasSession = false;
  #collecting = false;
  #snapshot = null;

  constructor({ now = defaultNow, sampleLimit = DEFAULT_SAMPLE_LIMIT } = {}) {
    assertNow(now);
    assertSampleLimit(sampleLimit);
    this.#now = now;
    this.#sampleLimit = sampleLimit;
    this.#resetStageData();
  }

  get collecting() {
    return this.#collecting;
  }

  startSession(context = {}) {
    this.#hasSession = true;
    this.#collecting = true;
    this.#context = { ...context };
    this.#resetMeasurements();
  }

  pause() {
    if (!this.#hasSession) {
      return;
    }
    this.#collecting = false;
    this.#context = { ...this.#context, mode: "paused" };
    this.#snapshot = null;
  }

  resume() {
    if (!this.#hasSession) {
      return;
    }
    this.#collecting = true;
    this.#context = { ...this.#context, mode: "running" };
    this.#snapshot = null;
  }

  resetStatistics() {
    if (!this.#hasSession) {
      return;
    }
    this.#resetMeasurements();
  }

  clear() {
    this.#hasSession = false;
    this.#collecting = false;
    this.#context = {};
    this.#resetMeasurements();
  }

  updateContext(context) {
    if (!context || typeof context !== "object") {
      throw new TypeError("O contexto do profiler deve ser um objeto.");
    }
    this.#context = { ...this.#context, ...context };
    this.#snapshot = null;
  }

  recordFrame({ realDeltaMs, ticksProcessed }) {
    if (!this.#collecting) {
      return;
    }
    if (!Number.isFinite(realDeltaMs) || realDeltaMs < 0
      || !Number.isSafeInteger(ticksProcessed) || ticksProcessed < 0) {
      throw new RangeError("A amostra de frame do profiler é inválida.");
    }
    this.#frameSamples.push(Object.freeze({ realDeltaMs, ticksProcessed }));
    if (this.#frameSamples.length > FRAME_CONTEXT_LIMIT) {
      this.#frameSamples.shift();
    }
    this.#snapshot = null;
  }

  measure(stageId, callback) {
    if (typeof callback !== "function") {
      throw new TypeError("A etapa medida deve receber um callback.");
    }
    if (!PERFORMANCE_STAGE_BY_ID.has(stageId)) {
      throw new RangeError(`Etapa de desempenho desconhecida: ${stageId}.`);
    }
    if (!this.#collecting) {
      return callback();
    }

    const startedAt = this.#now();
    try {
      return callback();
    } finally {
      const finishedAt = this.#now();
      const durationMs = finishedAt - startedAt;
      if (!Number.isFinite(durationMs) || durationMs < 0) {
        throw new RangeError("A fonte de tempo do profiler deve ser monotônica e finita.");
      }
      this.#recordDuration(stageId, durationMs);
    }
  }

  getSnapshot() {
    if (this.#snapshot !== null) {
      return this.#snapshot;
    }

    const stageSnapshots = new Map();
    for (const definition of PERFORMANCE_STAGES) {
      const data = this.#stageData.get(definition.id);
      const parentTotalMs = definition.parentId === null
        ? null
        : this.#stageData.get(definition.parentId).totalMs;
      stageSnapshots.set(definition.id, Object.freeze({
        ...definition,
        lastMs: data.lastMs,
        meanMs: mean(data.recent),
        p95Ms: percentile95(data.recent),
        maxMs: data.recent.length === 0 ? null : Math.max(...data.recent),
        callCount: data.callCount,
        totalMs: data.totalMs,
        parentShare: parentTotalMs > 0 ? data.totalMs / parentTotalMs : null,
      }));
    }
    const categories = PERFORMANCE_CATEGORIES.map((category) => Object.freeze({
      ...category,
      stages: Object.freeze(PERFORMANCE_STAGES
        .filter((stage) => stage.category === category.id)
        .map((stage) => stageSnapshots.get(stage.id))),
    }));

    this.#snapshot = Object.freeze({
      hasSession: this.#hasSession,
      collecting: this.#collecting,
      context: freezeContext(
        this.#context,
        this.#frameSamples,
        this.#stageData.get("simulation.tick"),
      ),
      categories: Object.freeze(categories),
    });
    return this.#snapshot;
  }

  #recordDuration(stageId, durationMs) {
    const data = this.#stageData.get(stageId);
    data.lastMs = durationMs;
    data.totalMs += durationMs;
    data.callCount += 1;
    data.recent.push(durationMs);
    if (data.recent.length > this.#sampleLimit) {
      data.recent.shift();
    }
    this.#snapshot = null;
  }

  #resetStageData() {
    this.#stageData = new Map(PERFORMANCE_STAGES.map((stage) => [stage.id, {
      recent: [],
      lastMs: null,
      totalMs: 0,
      callCount: 0,
    }]));
  }

  #resetMeasurements() {
    this.#resetStageData();
    this.#frameSamples = [];
    this.#snapshot = null;
  }
}
