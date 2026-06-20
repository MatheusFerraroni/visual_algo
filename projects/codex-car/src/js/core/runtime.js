// Funções de runtime: status, relógio da simulação e loops de execução.
function setStatus(message, kind = "info") {
  const box = state.ui.statusBox;
  if (!box) return;
  box.textContent = message;
  box.style.borderColor =
    kind === "error" ? "rgba(239, 68, 68, 0.45)" :
    kind === "success" ? "rgba(34, 197, 94, 0.45)" :
    "rgba(56, 189, 248, 0.2)";
}

function formatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return "0";
  return Number(value).toFixed(digits);
}

function formatAngleDegrees(radians, digits = 1) {
  return `${formatNumber((radians * 180) / Math.PI, digits)}°`;
}

function formatSimulationRate(stepsPerSecond, digits = 1) {
  return `${formatNumber(stepsPerSecond, digits)} steps/s`;
}

function resetSimulationClock(nowMs = Date.now()) {
  state.sim.lastWallClockMs = nowMs;
}

function resetSimulationCadence(nowMs = performance.now()) {
  state.sim.avgObservedStepsPerSecond = 0;
  state.sim.lastObservedStepsPerSecond = 0;
  state.sim.cadenceWindowStartedAtMs = nowMs;
  state.sim.cadenceWindowSteps = 0;
}

function recordSimulationCadence(steps, nowMs = performance.now()) {
  if (!Number.isFinite(steps) || steps <= 0) return;
  if (!state.sim.cadenceWindowStartedAtMs) {
    state.sim.cadenceWindowStartedAtMs = nowMs;
  }

  state.sim.cadenceWindowSteps += steps;
  const elapsedMs = Math.max(0, nowMs - state.sim.cadenceWindowStartedAtMs);
  const minWindowMs = 250;
  if (elapsedMs < minWindowMs) return;

  const stepsPerSecond = (state.sim.cadenceWindowSteps * 1000) / Math.max(1, elapsedMs);
  state.sim.lastObservedStepsPerSecond = stepsPerSecond;
  if (state.sim.avgObservedStepsPerSecond === 0) {
    state.sim.avgObservedStepsPerSecond = stepsPerSecond;
  } else {
    state.sim.avgObservedStepsPerSecond = lerp(state.sim.avgObservedStepsPerSecond, stepsPerSecond, 0.35);
  }

  state.sim.cadenceWindowStartedAtMs = nowMs;
  state.sim.cadenceWindowSteps = 0;
}

// Avança a simulação acompanhando o relógio real.
async function advanceSimulationByRealTime(nowMs) {
  if (state.sim.mode !== SIMULATION_MODES.realtime) return;
  if (state.sim.realtimeAdvanceRunning) {
    state.sim.queuedRealtimeTickNowMs = Math.max(state.sim.queuedRealtimeTickNowMs, nowMs);
    return;
  }
  if (!state.sim.running || state.sim.paused || state.sim.vehicles.length === 0) {
    resetSimulationClock(nowMs);
    return;
  }

  if (!state.sim.lastWallClockMs) {
    resetSimulationClock(nowMs);
    return;
  }

  state.sim.realtimeAdvanceRunning = true;
  try {
    let currentNowMs = nowMs;
    while (true) {
      const wallElapsedMs = Math.max(0, currentNowMs - state.sim.lastWallClockMs);
      const wallElapsedSeconds = wallElapsedMs / 1000;
      const processedSeconds = Math.min(wallElapsedSeconds, REALTIME_MAX_CATCHUP_SECONDS);
      const droppedSeconds = Math.max(0, wallElapsedSeconds - processedSeconds);
      let remaining = processedSeconds;
      state.sim.lastWallClockMs = currentNowMs;
      if (remaining > 0) {
        // A física continua baseada em pequenos steps fixos, mesmo que os ticks de fundo
        // cheguem espaçados ao trocar de aba. Assim a simulação "anda" por tempo real
        // em vez de depender do requestAnimationFrame do p5. Também limitamos o
        // catch-up máximo por avanço para a aba não congelar tentando recuperar
        // atrasos muito grandes depois de voltar do background.
        const maxStep = 1 / 30;
        let steps = 0;
        while (remaining > 0 && state.sim.running && !state.sim.paused && state.sim.vehicles.length > 0) {
          const dt = Math.min(maxStep, remaining);
          await updateSimulation(dt);
          remaining -= dt;
          steps += 1;
        }

        if (steps > 0) {
          recordSimulationStepWallMs((processedSeconds * 1000) / steps);
          recordSimulationCadence(steps, performance.now());
        }
      }
      if (droppedSeconds > 0.05) {
        console.info(
          `Realtime catch-up limitado: ${formatNumber(droppedSeconds, 2)}s descartados para manter a UI responsiva.`
        );
      }

      if (!state.sim.queuedRealtimeTickNowMs) break;
      currentNowMs = state.sim.queuedRealtimeTickNowMs;
      state.sim.queuedRealtimeTickNowMs = 0;
      if (state.sim.mode !== SIMULATION_MODES.realtime) break;
    }
  } finally {
    state.sim.realtimeAdvanceRunning = false;
  }
}

// Agenda o modo acelerado, que processa vários steps por lote.
function scheduleFastSimulationLoop() {
  if (state.sim.fastLoopScheduled || state.sim.fastLoopRunning) return;
  state.sim.fastLoopScheduled = true;
  setTimeout(() => {
    runFastSimulationLoop().catch(error => {
      console.error(error);
      state.sim.running = false;
      state.sim.paused = true;
      setStatus(`Falha no loop acelerado: ${error.message}`, "error");
    });
  }, 0);
}

async function runFastSimulationLoop() {
  state.sim.fastLoopScheduled = false;
  if (
    state.sim.mode !== SIMULATION_MODES.event ||
    !state.sim.running ||
    state.sim.paused ||
    state.sim.vehicles.length === 0
  ) {
    return;
  }

  state.sim.fastLoopRunning = true;
  const dt = 1 / 30;
  const maxBatchMs = state.renderEnabled ? 18 : 42;
  const batchStart = performance.now();
  let steps = 0;
  const maxStepsPerBatch = state.renderEnabled ? 180 : 2200;

  try {
    while (
      state.sim.mode === SIMULATION_MODES.event &&
      state.sim.running &&
      !state.sim.paused &&
      state.sim.vehicles.length > 0 &&
      steps < maxStepsPerBatch &&
      performance.now() - batchStart < maxBatchMs
    ) {
      await updateSimulation(dt, true);
      steps += 1;
    }

    if (steps > 0) {
      const batchEnd = performance.now();
      recordSimulationStepWallMs((batchEnd - batchStart) / steps);
      recordSimulationCadence(steps, batchEnd);
    }

    updateStats();
  } finally {
    state.sim.fastLoopRunning = false;
    if (state.sim.mode === SIMULATION_MODES.event && state.sim.running && !state.sim.paused) {
      scheduleFastSimulationLoop();
    }
  }
}

// Mantém a simulação avançando mesmo quando o render do p5 desacelera em background.
function startBackgroundSimulationLoop() {
  if (state.sim.backgroundWorker || state.sim.backgroundIntervalId) return;

  const workerSource = `
    let intervalId = null;
    self.onmessage = event => {
      if (event.data === "start" && intervalId === null) {
        intervalId = setInterval(() => {
          self.postMessage({ type: "tick", now: Date.now() });
        }, 100);
      } else if (event.data === "stop" && intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };
  `;

  try {
    const blob = new Blob([workerSource], { type: "application/javascript" });
    const worker = new Worker(URL.createObjectURL(blob));
    worker.onmessage = event => {
      if (event.data?.type === "tick") {
        advanceSimulationByRealTime(event.data.now).catch(error => {
          console.error(error);
          state.sim.running = false;
          state.sim.paused = true;
          setStatus(`Falha na simulação em background: ${error.message}`, "error");
        });
      }
    };
    worker.postMessage("start");
    state.sim.backgroundWorker = worker;
  } catch (error) {
    console.warn("Worker de fundo indisponível, usando setInterval:", error);
    state.sim.backgroundIntervalId = window.setInterval(() => {
      advanceSimulationByRealTime(Date.now()).catch(loopError => {
        console.error(loopError);
        state.sim.running = false;
        state.sim.paused = true;
        setStatus(`Falha na simulação em background: ${loopError.message}`, "error");
      });
    }, 100);
  }

  document.addEventListener("visibilitychange", () => {
    advanceSimulationByRealTime(Date.now()).catch(console.error);
  });
  window.addEventListener("focus", () => {
    advanceSimulationByRealTime(Date.now()).catch(console.error);
  });
  window.addEventListener("pageshow", () => {
    advanceSimulationByRealTime(Date.now()).catch(console.error);
  });
}

// Render ligado = tempo real. Render desligado = modo acelerado.
function setRenderEnabled(enabled) {
  state.renderEnabled = enabled;
  setSimulationMode(enabled ? SIMULATION_MODES.realtime : SIMULATION_MODES.event);
  renderBatchPreview();
  if (!state.canvasReady) return;

  if (enabled) {
    loop();
  } else {
    if (state.ui.vehicleHoverBox) {
      state.ui.vehicleHoverBox.classList.add("d-none");
    }
    noLoop();
  }
}

function recordSimulationStepWallMs(stepWallMs) {
  // Esta métrica representa a cadência efetiva por step no modo atual:
  // tempo de parede dividido pelo número de steps avançados naquele lote.
  // Assim ela diferencia melhor tempo real vs simulador rápido do que medir
  // apenas o custo interno de uma única chamada de updateSimulation().
  state.sim.lastStepWallMs = stepWallMs;
  if (state.sim.avgStepWallMs === 0) {
    state.sim.avgStepWallMs = stepWallMs;
  } else {
    state.sim.avgStepWallMs = lerp(state.sim.avgStepWallMs, stepWallMs, 0.15);
  }
}

function setSimulationMode(mode) {
  state.sim.mode = mode === SIMULATION_MODES.event ? SIMULATION_MODES.event : SIMULATION_MODES.realtime;
  resetSimulationClock(Date.now());
  resetSimulationCadence(performance.now());

  if (state.sim.running && !state.sim.paused) {
    if (state.sim.mode === SIMULATION_MODES.event) {
      scheduleFastSimulationLoop();
    } else {
      updateStats();
    }
  }
}
