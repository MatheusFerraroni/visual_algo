import { createConfig, DEFAULT_CONFIG } from "./config.js";
import { SimulationClock } from "./core/simulation-clock.js";
import { Simulation } from "./core/simulation.js";
import { PerformanceProfiler } from "./debug/performance-profiler.js";
import { Renderer } from "./rendering/renderer.js";
import { PerformanceDebugPanel } from "./ui/performance-debug-panel.js";
import {
  createDefaultSettings,
  SettingsStore,
} from "./ui/settings-store.js";
import { UIController } from "./ui/ui-controller.js";

const MAP_PREVIEW_DEBOUNCE_MS = DEFAULT_CONFIG.ui.mapPreviewDebounceMs;
const performanceProfiler = new PerformanceProfiler();

function getBrowserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const settingsStore = new SettingsStore({ storage: getBrowserStorage() });
let initialSettings;
let bootstrapWarning = null;
try {
  initialSettings = settingsStore.load();
  bootstrapWarning = initialSettings.warning;
} catch (error) {
  initialSettings = createDefaultSettings();
  bootstrapWarning = `Não foi possível gerar seeds aleatórias: ${error.message}`;
}

let activeConfig = initialSettings.config;
let simulation;
let clock;
try {
  simulation = new Simulation(activeConfig, { profiler: performanceProfiler });
  clock = new SimulationClock(activeConfig.time);
} catch (error) {
  settingsStore.clear();
  initialSettings = createDefaultSettings();
  activeConfig = initialSettings.config;
  simulation = new Simulation(activeConfig, { profiler: performanceProfiler });
  clock = new SimulationClock(activeConfig.time);
  bootstrapWarning = `As preferências salvas não puderam gerar uma prévia e foram descartadas: ${error.message}`;
}
let mode = "idle";
let previewTimeout = null;
let renderer = null;
let followTarget = null;

function buildConfig({ seeds, food, population, generation, balance, neural, genetics }) {
  return createConfig({
    seeds,
    food,
    population,
    generation,
    movement: balance.movement,
    energy: balance.energy,
    water: balance.water,
    life: balance.life,
    healing: balance.healing,
    eyes: neural.eyes,
    time: neural.time,
    network: neural.network,
    genetics,
  });
}

function buildExecution(options) {
  return performanceProfiler.measure("execution.build", () => {
    const config = performanceProfiler.measure(
      "execution.config",
      () => buildConfig(options),
    );
    return {
      config,
      simulation: new Simulation(config, { profiler: performanceProfiler }),
      clock: new SimulationClock(config.time),
    };
  });
}

function clearSelection({ preserveBestFollow = false } = {}) {
  if (preserveBestFollow && followTarget?.mode === "best-alive") {
    ui.setSelection(null);
    renderer?.setSelection(null);
    return;
  }
  ui.clearSelection();
  renderer?.setSelection(null);
  renderer?.setFollowTarget(null);
}

function clearPendingPreview() {
  if (previewTimeout !== null) {
    window.clearTimeout(previewTimeout);
    previewTimeout = null;
  }
}

function persistSettings() {
  const warning = performanceProfiler.measure(
    "events.settings-save",
    () => settingsStore.save(activeConfig, ui.getSpeed(), ui.getHistoryView()),
  );
  if (warning !== null) {
    ui.showWarning(warning);
  }
}

function regeneratePreview({ resetCamera = false } = {}) {
  try {
    const previousMapSeed = activeConfig.seeds.map;
    const preview = buildExecution({
      seeds: ui.getSeeds(),
      food: ui.getFoodConfig(),
      population: ui.getPopulationConfig(),
      generation: ui.getGenerationConfig(),
      balance: ui.getBalanceConfig(),
      neural: ui.getNeuralConfig(),
      genetics: ui.getGeneticsConfig(),
    });
    activeConfig = preview.config;
    simulation = preview.simulation;
    clock = preview.clock;
    clearSelection();
    renderer?.setConfig(activeConfig);
    if (resetCamera && activeConfig.seeds.map !== previousMapSeed) {
      renderer?.resetCamera();
    }
    ui.renderConfig(activeConfig);
    ui.renderSnapshot(simulation.getSnapshot());
    ui.showPreviewReady();
    persistSettings();
  } catch (error) {
    ui.showError(error.message);
  }
}

function getUiConfig() {
  return buildConfig({
    seeds: ui.getSeeds(),
    food: ui.getFoodConfig(),
    population: ui.getPopulationConfig(),
    generation: ui.getGenerationConfig(),
    balance: ui.getBalanceConfig(),
    neural: ui.getNeuralConfig(),
    genetics: ui.getGeneticsConfig(),
  });
}

function updatePerformanceContext(snapshot) {
  performanceProfiler.updateContext({
    mode,
    speed: ui.getSpeed(),
    generation: snapshot.generation,
    tick: snapshot.tick,
    aliveBeings: snapshot.population.aliveCount,
    totalBeings: snapshot.population.total,
    foods: snapshot.foods.length,
  });
}

function applyEditableConfig() {
  if (mode === "idle") {
    regeneratePreview();
    return;
  }
  try {
    const { config, receipt } = performanceProfiler.measure("events.runtime-config", () => {
      const nextConfig = performanceProfiler.measure(
        "events.config-validation",
        () => getUiConfig(),
      );
      return {
        config: nextConfig,
        receipt: simulation.applyRuntimeConfig(nextConfig),
      };
    });
    activeConfig = config;
    renderer?.setConfig(activeConfig);
    ui.renderConfig(activeConfig);
    ui.renderSnapshot(simulation.getSnapshot());
    ui.showRuntimeConfigApplied(receipt);
    persistSettings();
  } catch (error) {
    ui.showError(error.message);
  }
}

function scheduleEditableConfig() {
  clearPendingPreview();
  if (mode === "idle") {
    ui.showPreviewPending();
  } else {
    ui.showRuntimeConfigPending();
  }
  previewTimeout = window.setTimeout(() => {
    previewTimeout = null;
    applyEditableConfig();
  }, MAP_PREVIEW_DEBOUNCE_MS);
}

let debugPanel = null;
const ui = new UIController(document, {
  onPrimary: () => {
    performanceProfiler.startSession({ mode: "running", speed: ui.getSpeed() });
    try {
      clearPendingPreview();
      let shouldClearSelection = mode !== "idle";
      if (mode === "idle") {
        const mapChanged = ui.getSeeds().map !== activeConfig.seeds.map;
        const execution = buildExecution({
          seeds: ui.getSeeds(),
          food: ui.getFoodConfig(),
          population: ui.getPopulationConfig(),
          generation: ui.getGenerationConfig(),
          balance: ui.getBalanceConfig(),
          neural: ui.getNeuralConfig(),
          genetics: ui.getGeneticsConfig(),
        });
        activeConfig = execution.config;
        simulation = execution.simulation;
        clock = execution.clock;
        renderer?.setConfig(activeConfig);
        if (mapChanged) {
          renderer?.resetCamera();
          shouldClearSelection = true;
        }
      } else {
        const config = performanceProfiler.measure("events.runtime-config", () => {
          const nextConfig = performanceProfiler.measure(
            "events.config-validation",
            () => getUiConfig(),
          );
          simulation.applyRuntimeConfig(nextConfig);
          return nextConfig;
        });
        activeConfig = config;
        renderer?.setConfig(activeConfig);
        simulation.reset();
        clock.reset();
      }

      if (shouldClearSelection) {
        clearSelection();
      }
      if (mode !== "idle") {
        ui.resetGenerationTimelineSelection();
      }
      clock.setSpeed(ui.getSpeed());
      clock.resume();
      mode = "running";
      ui.setMode(mode);
      ui.renderConfig(activeConfig);
      const snapshot = simulation.getSnapshot();
      ui.renderSnapshot(snapshot);
      updatePerformanceContext(snapshot);
      persistSettings();
      debugPanel?.render();
    } catch (error) {
      performanceProfiler.clear();
      debugPanel?.render();
      ui.showError(error.message);
    }
  },
  onPauseToggle: () => {
    if (mode === "running") {
      clock.pause();
      mode = "paused";
      performanceProfiler.updateContext({ mode });
      performanceProfiler.pause();
    } else if (mode === "paused") {
      clock.resume();
      mode = "running";
      performanceProfiler.resume();
      performanceProfiler.updateContext({ mode });
    }
    ui.setMode(mode);
    debugPanel?.render();
  },
  onNewExecution: () => {
    clearPendingPreview();
    clock.reset();
    simulation.reset();
    clearSelection();
    mode = "idle";
    performanceProfiler.clear();
    renderer?.resetCamera();
    ui.setMode(mode);
    ui.resetGenerationTimelineSelection();
    ui.renderSnapshot(simulation.getSnapshot());
    ui.focusSimulationSeed();
    debugPanel?.render();
  },
  onMapSeedChange: (_mapSeed, { immediate }) => {
    clearPendingPreview();

    if (immediate) {
      regeneratePreview({ resetCamera: true });
      return;
    }

    ui.showPreviewPending();
    previewTimeout = window.setTimeout(() => {
      previewTimeout = null;
      regeneratePreview({ resetCamera: true });
    }, MAP_PREVIEW_DEBOUNCE_MS);
  },
  onSimulationSeedChange: (_simulationSeed, { immediate }) => {
    clearPendingPreview();
    if (immediate) {
      regeneratePreview();
      return;
    }
    ui.showPreviewPending();
    previewTimeout = window.setTimeout(() => {
      previewTimeout = null;
      regeneratePreview();
    }, MAP_PREVIEW_DEBOUNCE_MS);
  },
  onInitialFoodChange: () => {
    scheduleEditableConfig();
  },
  onFoodConfigChange: () => {
    scheduleEditableConfig();
  },
  onPopulationChange: () => {
    scheduleEditableConfig();
  },
  onGenerationConfigChange: () => {
    scheduleEditableConfig();
  },
  onBalanceConfigChange: () => {
    scheduleEditableConfig();
  },
  onNeuralConfigChange: () => {
    clearPendingPreview();
    ui.showPreviewPending();
    previewTimeout = window.setTimeout(() => {
      previewTimeout = null;
      regeneratePreview();
    }, MAP_PREVIEW_DEBOUNCE_MS);
  },
  onGeneticsConfigChange: () => {
    scheduleEditableConfig();
  },
  onSpeedChange: (speed) => {
    clock.setSpeed(speed);
    persistSettings();
  },
  onHistoryViewChange: () => persistSettings(),
  onFollowToggle: (selection) => {
    if (selection?.type !== "being") {
      return;
    }
    const selected = simulation.getSnapshot().beings.find(
      ({ id, alive }) => id === selection.id && alive,
    );
    if (selected) {
      const alreadyFollowing = followTarget?.mode === "being"
        && followTarget.id === selected.id;
      renderer?.setFollowTarget(alreadyFollowing || followTarget?.mode === "best-alive"
        ? null
        : { mode: "being", id: selected.id });
    }
  },
  onFollowBestToggle: () => {
    renderer?.setFollowTarget(followTarget?.mode === "best-alive"
      ? null
      : { mode: "best-alive" });
  },
  onCameraZoomOut: () => renderer?.zoomOut(),
  onCameraZoomIn: () => renderer?.zoomIn(),
  onCameraReset: () => renderer?.resetCamera(),
  onResetSettings: () => {
    const confirmed = window.confirm(
      "Restaurar os padrões encerra a execução atual e apaga todo o histórico. Continuar?",
    );
    if (!confirmed) {
      return;
    }

    clearPendingPreview();
    const clearWarning = settingsStore.clear();
    const defaults = createDefaultSettings();
    activeConfig = defaults.config;
    performanceProfiler.clear();
    simulation = new Simulation(activeConfig, { profiler: performanceProfiler });
    clock = new SimulationClock(activeConfig.time);
    mode = "idle";
    ui.applySettings(defaults);
    ui.resetGenerationTimelineSelection();
    clearSelection();
    renderer?.setConfig(activeConfig);
    renderer?.resetCamera();
    ui.setMode(mode);
    ui.renderConfig(activeConfig);
    ui.renderSnapshot(simulation.getSnapshot());
    if (clearWarning === null) {
      ui.showDefaultsRestored();
    } else {
      ui.showWarning(clearWarning);
    }
    debugPanel?.render();
  },
}, { profiler: performanceProfiler });

debugPanel = new PerformanceDebugPanel(document, performanceProfiler);

ui.applySettings(initialSettings);
clock.setSpeed(initialSettings.speed);
ui.setMode(mode);
ui.renderConfig(activeConfig);
ui.renderSnapshot(simulation.getSnapshot());
if (initialSettings.source === "generated") {
  persistSettings();
}
if (bootstrapWarning !== null) {
  ui.showWarning(bootstrapWarning);
}

const canvasContainer = document.querySelector("#canvas-container");

if (typeof window.p5 !== "function") {
  ui.showError("O p5.js local não foi carregado.");
  throw new Error("O p5.js local não foi carregado.");
}

renderer = new Renderer({
  p5Constructor: window.p5,
  container: canvasContainer,
  config: activeConfig,
  onSelectionChange: (selection) => {
    ui.setSelection(selection);
    ui.renderSnapshot(simulation.getSnapshot());
  },
  onFollowChange: (target) => {
    followTarget = target;
    ui.setFollowTarget(target);
  },
  onCameraChange: (camera) => {
    ui.renderCamera(camera);
  },
  onFrame: (realDeltaMs) => {
    const generationBeforeFrame = simulation.getSnapshot().generation;
    let ticksProcessed = 0;
    if (mode === "running") {
      ticksProcessed = performanceProfiler.measure(
        "clock.advance",
        () => clock.advance(realDeltaMs, () => simulation.tick()),
      );
    }

    const snapshot = simulation.getSnapshot();
    if (snapshot.generation !== generationBeforeFrame) {
      clearSelection({ preserveBestFollow: true });
    }
    ui.renderSnapshot(snapshot);
    performanceProfiler.recordFrame({ realDeltaMs, ticksProcessed });
    updatePerformanceContext(snapshot);
    return snapshot;
  },
  profiler: performanceProfiler,
});
