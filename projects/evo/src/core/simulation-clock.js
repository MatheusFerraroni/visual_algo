const MAX_TICKS_PER_BUDGET = 100_000;

function defaultNow() {
  return performance.now();
}

export class SimulationClock {
  #timeConfig;
  #now;
  #speed = 1;
  #paused = true;
  #pendingTicks = 0;

  constructor(timeConfig, { now = defaultNow } = {}) {
    if (!timeConfig || !Array.isArray(timeConfig.speedPresets)) {
      throw new TypeError("SimulationClock exige uma configuração de tempo válida.");
    }
    if (typeof now !== "function") {
      throw new TypeError("now deve ser uma função.");
    }

    this.#timeConfig = timeConfig;
    this.#now = now;
    this.#speed = timeConfig.speedPresets.find((preset) => preset !== "max") ?? "max";
  }

  get speed() {
    return this.#speed;
  }

  get paused() {
    return this.#paused;
  }

  setSpeed(speed) {
    if (!this.#timeConfig.speedPresets.includes(speed)) {
      throw new RangeError(`Velocidade não suportada: ${speed}`);
    }

    if (speed === "max" || this.#speed === "max") {
      this.#pendingTicks = 0;
    }
    this.#speed = speed;
  }

  pause() {
    this.#paused = true;
  }

  resume() {
    this.#paused = false;
  }

  reset({ paused = true } = {}) {
    this.#pendingTicks = 0;
    this.#paused = paused;
  }

  advance(realDeltaMs, onTick) {
    if (!Number.isFinite(realDeltaMs) || realDeltaMs < 0) {
      throw new RangeError("realDeltaMs deve ser um número finito não negativo.");
    }
    this.#assertTickCallback(onTick);

    if (this.#paused) {
      return 0;
    }

    if (this.#speed === "max") {
      return this.#advanceMaximum(onTick);
    }

    const acceptedDeltaMs = Math.min(realDeltaMs, this.#timeConfig.maxRealDeltaMs);
    this.#pendingTicks += (
      acceptedDeltaMs
      * this.#timeConfig.physicsHz
      * this.#speed
    ) / 1000;

    const ticksDue = Math.floor(this.#pendingTicks + Number.EPSILON);
    this.#pendingTicks -= ticksDue;

    let processedTicks = 0;
    for (let index = 0; index < ticksDue && !this.#paused; index += 1) {
      onTick(1 / this.#timeConfig.physicsHz);
      processedTicks += 1;
    }

    return processedTicks;
  }

  step(onTick) {
    this.#assertTickCallback(onTick);
    onTick(1 / this.#timeConfig.physicsHz);
    return 1;
  }

  #advanceMaximum(onTick) {
    const startedAt = this.#now();
    let processedTicks = 0;

    do {
      onTick(1 / this.#timeConfig.physicsHz);
      processedTicks += 1;
    } while (
      !this.#paused
      &&
      processedTicks < MAX_TICKS_PER_BUDGET
      && (this.#now() - startedAt) < this.#timeConfig.maxProcessingBudgetMs
    );

    return processedTicks;
  }

  #assertTickCallback(onTick) {
    if (typeof onTick !== "function") {
      throw new TypeError("onTick deve ser uma função.");
    }
  }
}
