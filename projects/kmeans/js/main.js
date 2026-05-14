import { PRESET_OPTIONS } from "./config.js";
import { DEFAULT_CONFIG, KMeansDemo } from "./kmeans-demo.js";
import { ElbowChartController } from "./elbow-chart-controller.js";
import { MetricsChartController } from "./chart-controller.js";
import { SummaryController } from "./summary-controller.js";

const canvasRoot = document.getElementById("canvas-root");
const runProgress = document.getElementById("run-progress");
const runProgressBar = document.getElementById("run-progress-bar");
const runProgressText = document.getElementById("run-progress-text");
const metricsChartCanvas = document.getElementById("metrics-chart");
const elbowChartCanvas = document.getElementById("elbow-chart");
const yScaleButton = document.getElementById("y-scale-button");
const seedInput = document.getElementById("seed-input");
const elbowRunsInput = document.getElementById("elbow-runs-input");
const kValueInput = document.getElementById("k-value");
const kValueOutput = document.getElementById("k-value-output");
const maxIterationsInput = document.getElementById("max-iterations");
const maxIterationsOutput = document.getElementById("max-iterations-output");
const iterationDelayInput = document.getElementById("iteration-delay");
const iterationDelayOutput = document.getElementById("iteration-delay-output");
const resetButton = document.getElementById("reset-button");
const stepButton = document.getElementById("step-button");
const runButton = document.getElementById("run-button");
const elbowButton = document.getElementById("elbow-button");
const clearSamplesButton = document.getElementById("clear-samples-button");
const clearCentroidsButton = document.getElementById("clear-centroids-button");
const randomizeCentroidsButton = document.getElementById("randomize-centroids-button");
const sampleModeButton = document.getElementById("sample-mode-button");
const centroidModeButton = document.getElementById("centroid-mode-button");
const sampleSprayModeButton = document.getElementById("batch-mode-button");
const presetButtons = Object.fromEntries(
  PRESET_OPTIONS.map((presetOption) => [
    presetOption.value,
    document.getElementById(presetOption.id),
  ]),
);
const summaryPreset = document.getElementById("summary-preset");
const summaryMode = document.getElementById("summary-mode");
const summaryStatus = document.getElementById("summary-status");
const summaryIteration = document.getElementById("summary-iteration");
const summarySamples = document.getElementById("summary-samples");
const summaryCentroids = document.getElementById("summary-centroids");
const summaryConverged = document.getElementById("summary-converged");
const summaryDissimilarity = document.getElementById("summary-dissimilarity");

const demo = new KMeansDemo(canvasRoot);
const metricsChart = new MetricsChartController(metricsChartCanvas);
const elbowChart = new ElbowChartController(elbowChartCanvas);
const summary = new SummaryController({
  preset: summaryPreset,
  mode: summaryMode,
  status: summaryStatus,
  iteration: summaryIteration,
  samples: summarySamples,
  centroids: summaryCentroids,
  converged: summaryConverged,
  dissimilarity: summaryDissimilarity,
});

const setToggleButtonState = (button, isActive, activeLabel, inactiveLabel) => {
  if (!button) {
    return;
  }

  button.classList.toggle("btn-dark", isActive);
  button.classList.toggle("btn-outline-dark", !isActive);

  if (activeLabel && inactiveLabel) {
    button.textContent = isActive ? activeLabel : inactiveLabel;
  }
};

let yScaleType = "linear";

const updateRunProgress = (state) => {
  if (!runProgress || !runProgressBar || !runProgressText) {
    return;
  }

  const maxIterations = Math.max(1, state.config.maxIterations);
  const clampedIteration = Math.max(0, Math.min(state.iteration, maxIterations));
  const progressPercent = (clampedIteration / maxIterations) * 100;

  runProgress.classList.toggle("d-none", !state.isRunning);
  runProgress.setAttribute("aria-hidden", String(!state.isRunning));
  runProgressBar.style.width = `${progressPercent}%`;
  runProgressBar.setAttribute("aria-valuenow", String(Math.round(progressPercent)));
  runProgressText.textContent = `${clampedIteration} / ${maxIterations}`;
};

const updateUiFromState = (state) => {
  if (kValueInput && kValueInput.value !== String(state.config.k)) {
    kValueInput.value = String(state.config.k);
  }

  if (kValueOutput) {
    kValueOutput.textContent = String(state.config.k);
  }

  setToggleButtonState(
    sampleModeButton,
    state.mode === "samples" && !state.isSampleSprayModeEnabled,
    "Modo de amostras ativo",
    "Ativar modo de adição de amostras",
  );
  setToggleButtonState(
    centroidModeButton,
    state.mode === "centroids",
    "Modo de centróide ativo",
    "Ativar modo de adição de centróide",
  );
  setToggleButtonState(
    sampleSprayModeButton,
    state.isSampleSprayModeEnabled,
    "Desativar adição em lote",
    "Ativar adição em lote",
  );
  setToggleButtonState(
    runButton,
    state.isRunning,
    "Pausar execução",
    "Executar continuamente",
  );
  setToggleButtonState(
    elbowButton,
    state.isElbowRunning,
    "Gerando gráfico de cotovelo...",
    "Gerar gráfico de cotovelo",
  );
  setToggleButtonState(
    yScaleButton,
    yScaleType === "logarithmic",
    "Escala Y: Log",
    "Escala Y: Linear",
  );

  PRESET_OPTIONS.forEach((presetOption) => {
    setToggleButtonState(
      presetButtons[presetOption.value],
      false,
      presetOption.activeLabel,
      presetOption.label,
    );
  });

  updateRunProgress(state);
};

metricsChart.mount();
elbowChart.mount();
demo.setOnStateChange((state) => {
  // Charts and summary are driven from the same simulation snapshot so the
  // informational panel stays consistent with the canvas.
  metricsChart.update(state.metricsHistory);
  elbowChart.update(state.elbowCurve);
  summary.update(state);
  updateUiFromState(state);
});

demo.mount();
demo.setConfig({
  seed: Number(seedInput?.value ?? DEFAULT_CONFIG.seed),
  elbowRunsPerK: Number(elbowRunsInput?.value ?? DEFAULT_CONFIG.elbowRunsPerK),
  k: Number(kValueInput?.value ?? DEFAULT_CONFIG.k),
  maxIterations: Number(maxIterationsInput?.value ?? DEFAULT_CONFIG.maxIterations),
  iterationDelay: Number(iterationDelayInput?.value ?? DEFAULT_CONFIG.iterationDelay),
  sampleSprayRadius: DEFAULT_CONFIG.sampleSprayRadius,
  sampleSprayIntervalMs: DEFAULT_CONFIG.sampleSprayIntervalMs,
});

const bindClick = (element, handler) => {
  if (!element) {
    return;
  }

  element.addEventListener("click", handler);
};

const syncValue = (input, output) => {
  if (!input || !output) {
    return;
  }

  output.textContent = input.value;
};

const bindRange = (input, output, configKey) => {
  if (!input) {
    return;
  }

  syncValue(input, output);

  input.addEventListener("input", () => {
    syncValue(input, output);
    demo.setConfig({ [configKey]: Number(input.value) });
  });
};

bindRange(kValueInput, kValueOutput, "k");
bindRange(maxIterationsInput, maxIterationsOutput, "maxIterations");
bindRange(iterationDelayInput, iterationDelayOutput, "iterationDelay");

if (seedInput) {
  seedInput.addEventListener("input", () => {
    demo.setConfig({ seed: Number(seedInput.value || 0) });
  });
}

if (elbowRunsInput) {
  elbowRunsInput.addEventListener("input", () => {
    demo.setConfig({
      elbowRunsPerK: Math.max(1, Number(elbowRunsInput.value || DEFAULT_CONFIG.elbowRunsPerK)),
    });
  });
}

bindClick(resetButton, () => {
  if (seedInput) {
    seedInput.value = String(DEFAULT_CONFIG.seed);
  }

  if (kValueInput) {
    kValueInput.value = String(DEFAULT_CONFIG.k);
  }

  if (elbowRunsInput) {
    elbowRunsInput.value = String(DEFAULT_CONFIG.elbowRunsPerK);
  }

  if (maxIterationsInput) {
    maxIterationsInput.value = String(DEFAULT_CONFIG.maxIterations);
  }

  if (iterationDelayInput) {
    iterationDelayInput.value = String(DEFAULT_CONFIG.iterationDelay);
  }

  syncValue(kValueInput, kValueOutput);
  syncValue(maxIterationsInput, maxIterationsOutput);
  syncValue(iterationDelayInput, iterationDelayOutput);

  demo.reset();
});

bindClick(stepButton, () => {
  demo.step();
});

bindClick(runButton, () => {
  if (demo.simulationState.isRunning) {
    demo.pause();
    return;
  }

  demo.run();
});

bindClick(yScaleButton, () => {
  yScaleType = yScaleType === "linear" ? "logarithmic" : "linear";
  metricsChart.setYScaleType(yScaleType);
  elbowChart.setYScaleType(yScaleType);
  updateUiFromState(demo.simulationState);
});

bindClick(elbowButton, async () => {
  await demo.generateElbowCurve();
});

bindClick(clearSamplesButton, () => {
  demo.clearSamples();
});

bindClick(clearCentroidsButton, () => {
  demo.clearCentroids();
});

bindClick(randomizeCentroidsButton, () => {
  demo.randomizeCentroids();
});

bindClick(sampleModeButton, () => {
  demo.setMode("samples");
});

bindClick(centroidModeButton, () => {
  demo.setMode("centroids");
});

bindClick(sampleSprayModeButton, () => {
  demo.toggleSampleSprayMode();
});

const applyPreset = (presetName, kValue) => {
  if (kValueInput) {
    kValueInput.value = String(kValue);
  }

  syncValue(kValueInput, kValueOutput);
  demo.setConfig({ k: kValue });
  demo.applyPreset(presetName);
};

PRESET_OPTIONS.forEach((presetOption) => {
  bindClick(presetButtons[presetOption.value], () => {
    applyPreset(presetOption.value, presetOption.k);
  });
});
