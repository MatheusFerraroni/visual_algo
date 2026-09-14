import { GenerationChart } from "./generation-chart.js";
import {
  GenerationTimelineChart,
  getAdjacentGenerationTimelineSelection,
  selectGenerationTimeline,
  getTimelineChartDefinition,
} from "./generation-timeline-chart.js";
import { createNeuralInspectorModel } from "./neural-inspector-model.js";
import { createRandomSeed, DEFAULT_HISTORY_VIEW } from "./settings-store.js";
import { NOOP_PERFORMANCE_PROFILER } from "../debug/performance-profiler.js";

const STATUS_COPY = {
  idle: {
    label: "Pronto",
    message: "A prévia acompanha mapa, comida, seres, cérebro e evolução. Inicie quando estiver satisfeito.",
  },
  running: {
    label: "Executando",
    message: "A simulação avança somente por ticks fixos.",
  },
  paused: {
    label: "Pausado",
    message: "Nenhum tick é processado enquanto a simulação está pausada.",
  },
};

function requireElement(root, selector) {
  const element = root.querySelector(selector);
  if (!element) {
    throw new Error(`Elemento obrigatório ausente: ${selector}`);
  }
  return element;
}

function formatSimulatedTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - (minutes * 60);
  return `${String(minutes).padStart(2, "0")}:${seconds.toFixed(1).padStart(4, "0")}`;
}

function readNumber(element) {
  return element.value.trim() === "" ? Number.NaN : Number(element.value);
}

function formatConfigNumber(value) {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 6 });
}

function renderPendingHint(element, current, next, suffix = "") {
  const pending = current !== next;
  const format = (value) => `${formatConfigNumber(value)}${suffix}`;
  element.dataset.pending = String(pending);
  element.textContent = pending
    ? `Atual: ${format(current)} · próxima: ${format(next)}`
    : `Atual: ${format(current)}`;
}

function parseHiddenLayers(value) {
  const trimmed = value.trim();
  if (trimmed === "") {
    return [];
  }
  return trimmed.split(",").map((entry) => {
    const layer = entry.trim();
    return layer === "" ? Number.NaN : Number(layer);
  });
}

export class UIController {
  #elements;
  #handlers;
  #mode = "idle";
  #selection = null;
  #followTarget = null;
  #historyView = DEFAULT_HISTORY_VIEW;
  #activeConfig = null;
  #lastSnapshot = null;
  #root;
  #generationChart;
  #timelineCharts;
  #timelineSelection = "current";
  #timelineOptionsKey = null;
  #profiler;

  constructor(root, handlers, { profiler = NOOP_PERFORMANCE_PROFILER } = {}) {
    this.#root = root;
    this.#handlers = handlers;
    this.#profiler = profiler;
    this.#elements = {
      simulationSeed: requireElement(root, "#simulation-seed-input"),
      mapSeed: requireElement(root, "#map-seed-input"),
      randomSimulationSeed: requireElement(root, "#random-simulation-seed"),
      randomMapSeed: requireElement(root, "#random-map-seed"),
      population: requireElement(root, "#population-input"),
      populationHint: requireElement(root, "#population-application-hint"),
      initialFood: requireElement(root, "#initial-food-input"),
      initialFoodHint: requireElement(root, "#initial-food-application-hint"),
      spawnFood: requireElement(root, "#spawn-food-input"),
      maxFood: requireElement(root, "#max-food-input"),
      maxFoodHint: requireElement(root, "#max-food-application-hint"),
      foodMinEnergy: requireElement(root, "#food-min-energy-input"),
      foodMaxEnergy: requireElement(root, "#food-max-energy-input"),
      foodEnergyHint: requireElement(root, "#food-energy-application-hint"),
      foodInactivity: requireElement(root, "#food-inactivity-input"),
      foodInactivityHint: requireElement(root, "#food-inactivity-application-hint"),
      spawnInterval: requireElement(root, "#spawn-interval-input"),
      generationDuration: requireElement(root, "#generation-duration-input"),
      generationDurationHint: requireElement(root, "#generation-duration-hint"),
      seedSummary: requireElement(root, "#seed-summary"),
      populationSummary: requireElement(root, "#population-summary"),
      foodSummary: requireElement(root, "#food-summary"),
      movementCostCoefficient: requireElement(root, "#movement-cost-coefficient-input"),
      movementCostCoefficientHint: requireElement(root, "#movement-cost-coefficient-hint"),
      movementCostExponent: requireElement(root, "#movement-cost-exponent-input"),
      movementCostExponentHint: requireElement(root, "#movement-cost-exponent-hint"),
      turnCost: requireElement(root, "#turn-cost-input"),
      turnCostHint: requireElement(root, "#turn-cost-hint"),
      basalMetabolism: requireElement(root, "#basal-metabolism-input"),
      basalMetabolismHint: requireElement(root, "#basal-metabolism-hint"),
      waterMovementCost: requireElement(root, "#water-movement-cost-input"),
      waterMovementCostHint: requireElement(root, "#water-movement-cost-hint"),
      zeroEnergyDamage: requireElement(root, "#zero-energy-damage-input"),
      zeroEnergyDamageHint: requireElement(root, "#zero-energy-damage-hint"),
      healingEnergyThreshold: requireElement(root, "#healing-energy-threshold-input"),
      healingEnergyThresholdHint: requireElement(root, "#healing-energy-threshold-hint"),
      healingEnergyPerLife: requireElement(root, "#healing-energy-per-life-input"),
      healingEnergyPerLifeHint: requireElement(root, "#healing-energy-per-life-hint"),
      healingMaxLife: requireElement(root, "#healing-max-life-input"),
      healingMaxLifeHint: requireElement(root, "#healing-max-life-hint"),
      balanceSummary: requireElement(root, "#balance-summary"),
      eyeCount: requireElement(root, "#eye-count-input"),
      eyeFov: requireElement(root, "#eye-fov-input"),
      eyeRange: requireElement(root, "#eye-range-input"),
      brainFrequency: requireElement(root, "#brain-frequency-select"),
      hiddenLayers: requireElement(root, "#hidden-layers-input"),
      activation: requireElement(root, "#activation-select"),
      initialGeneMin: requireElement(root, "#initial-gene-min-input"),
      initialGeneMax: requireElement(root, "#initial-gene-max-input"),
      geneMin: requireElement(root, "#gene-min-input"),
      geneMax: requireElement(root, "#gene-max-input"),
      networkSummary: requireElement(root, "#network-summary"),
      eliteCount: requireElement(root, "#elite-count-input"),
      tournamentSize: requireElement(root, "#tournament-size-input"),
      crossoverParentAChance: requireElement(root, "#crossover-parent-a-input"),
      mutationChance: requireElement(root, "#mutation-chance-input"),
      mutationStdDev: requireElement(root, "#mutation-stddev-input"),
      geneticsSummary: requireElement(root, "#genetics-summary"),
      speed: requireElement(root, "#speed-select"),
      primary: requireElement(root, "#primary-action"),
      pause: requireElement(root, "#pause-action"),
      newExecution: requireElement(root, "#new-action"),
      resetSettings: requireElement(root, "#reset-settings-action"),
      statusPill: requireElement(root, "#status-pill"),
      statusLabel: requireElement(root, "#status-label"),
      statusMessage: requireElement(root, "#status-message"),
      generation: requireElement(root, "#generation-metric"),
      time: requireElement(root, "#time-metric"),
      totalTime: requireElement(root, "#total-time-metric"),
      tick: requireElement(root, "#tick-metric"),
      completedGenerations: requireElement(root, "#completed-generations-metric"),
      foods: requireElement(root, "#food-metric"),
      aliveBeings: requireElement(root, "#alive-being-metric"),
      bestFitness: requireElement(root, "#best-fitness-metric"),
      meanFitness: requireElement(root, "#mean-fitness-metric"),
      bestEver: requireElement(root, "#best-ever-metric"),
      activeSimulationSeed: requireElement(root, "#simulation-seed-metric"),
      activeMapSeed: requireElement(root, "#map-seed-metric"),
      landStat: requireElement(root, "#land-stat"),
      productivityStat: requireElement(root, "#productivity-stat"),
      cameraZoomOut: requireElement(root, "#camera-zoom-out"),
      cameraZoomIn: requireElement(root, "#camera-zoom-in"),
      cameraReset: requireElement(root, "#camera-reset"),
      cameraZoomValue: requireElement(root, "#camera-zoom-value"),
      followBest: requireElement(root, "#follow-best-action"),
      historyLast50: requireElement(root, "#history-last50"),
      historyAll: requireElement(root, "#history-all"),
      inspectorEmpty: requireElement(root, "#being-inspector-empty"),
      inspectorDetails: requireElement(root, "#being-inspector-details"),
      foodInspectorDetails: requireElement(root, "#food-inspector-details"),
      followBeing: requireElement(root, "#follow-being-action"),
      selectedBeingTitle: requireElement(root, "#selected-being-title"),
      selectedBeingLife: requireElement(root, "#selected-being-life"),
      selectedBeingEnergy: requireElement(root, "#selected-being-energy"),
      selectedBeingFeeding: requireElement(root, "#selected-being-feeding"),
      selectedBeingFeedingFood: requireElement(root, "#selected-being-feeding-food"),
      selectedBeingSpeed: requireElement(root, "#selected-being-speed"),
      selectedBeingAge: requireElement(root, "#selected-being-age"),
      selectedBeingFitness: requireElement(root, "#selected-being-fitness"),
      selectedBeingAbsorbed: requireElement(root, "#selected-being-absorbed"),
      selectedBeingBrainInputs: requireElement(root, "#selected-being-brain-inputs"),
      selectedBeingBrainOutputs: requireElement(root, "#selected-being-brain-outputs"),
      selectedBeingGeneCount: requireElement(root, "#selected-being-gene-count"),
      selectedFoodTitle: requireElement(root, "#selected-food-title"),
      selectedFoodColumn: requireElement(root, "#selected-food-column"),
      selectedFoodRow: requireElement(root, "#selected-food-row"),
      selectedFoodProductivity: requireElement(root, "#selected-food-productivity"),
      selectedFoodInitialEnergy: requireElement(root, "#selected-food-initial-energy"),
      selectedFoodRemainingEnergy: requireElement(root, "#selected-food-remaining-energy"),
      selectedFoodRatio: requireElement(root, "#selected-food-ratio"),
      selectedFoodInactivity: requireElement(root, "#selected-food-inactivity"),
      generationHistoryChart: requireElement(root, "#generation-history-chart"),
      generationHistorySummary: requireElement(root, "#generation-history-summary"),
      generationTimelineSelect: requireElement(root, "#generation-timeline-select"),
      generationTimelinePrevious: requireElement(root, "#generation-timeline-previous"),
      generationTimelineNext: requireElement(root, "#generation-timeline-next"),
    };
    this.#generationChart = new GenerationChart({
      canvas: this.#elements.generationHistoryChart,
      summary: this.#elements.generationHistorySummary,
      profiler: this.#profiler,
    });
    this.#timelineCharts = [
      "population",
      "food-energy",
      "being-condition",
      "fitness",
      "movement",
      "deaths",
      "food-flow",
    ].map((id) => new GenerationTimelineChart({
      canvas: requireElement(root, `#timeline-${id}-chart`),
      summary: requireElement(root, `#timeline-${id}-summary`),
      definition: getTimelineChartDefinition(id),
      profiler: this.#profiler,
    }));

    this.#elements.randomSimulationSeed.addEventListener("click", () => {
      try {
        const seed = createRandomSeed();
        this.#elements.simulationSeed.value = seed;
        this.#handlers.onSimulationSeedChange(seed, { immediate: true });
      } catch (error) {
        this.showError(error.message);
      }
    });
    this.#elements.randomMapSeed.addEventListener("click", () => {
      try {
        const seed = createRandomSeed();
        this.#elements.mapSeed.value = seed;
        this.#handlers.onMapSeedChange(seed, { immediate: true });
      } catch (error) {
        this.showError(error.message);
      }
    });
    this.#elements.primary.addEventListener("click", () => this.#handlers.onPrimary());
    this.#elements.pause.addEventListener("click", () => this.#handlers.onPauseToggle());
    this.#elements.newExecution.addEventListener("click", () => this.#handlers.onNewExecution());
    this.#elements.resetSettings.addEventListener("click", () => this.#handlers.onResetSettings());
    this.#elements.speed.addEventListener("change", () => this.#handlers.onSpeedChange(this.getSpeed()));
    this.#elements.historyLast50.addEventListener("click", () => {
      this.setHistoryView("last50");
      this.#handlers.onHistoryViewChange("last50");
    });
    this.#elements.historyAll.addEventListener("click", () => {
      this.setHistoryView("all");
      this.#handlers.onHistoryViewChange("all");
    });
    this.#elements.followBeing.addEventListener(
      "click",
      () => this.#handlers.onFollowToggle(this.#selection),
    );
    this.#elements.followBest.addEventListener(
      "click",
      () => this.#handlers.onFollowBestToggle(),
    );
    this.#elements.cameraZoomOut.addEventListener("click", () => this.#handlers.onCameraZoomOut());
    this.#elements.cameraZoomIn.addEventListener("click", () => this.#handlers.onCameraZoomIn());
    this.#elements.cameraReset.addEventListener("click", () => this.#handlers.onCameraReset());
    this.#elements.simulationSeed.addEventListener("input", () => (
      this.#handlers.onSimulationSeedChange(this.getSeeds().simulation, { immediate: false })
    ));
    this.#elements.mapSeed.addEventListener("input", () => this.#handlers.onMapSeedChange(
      this.getSeeds().map,
      { immediate: false },
    ));
    this.#elements.initialFood.addEventListener("input", () => (
      this.#handlers.onInitialFoodChange()
    ));
    this.#elements.spawnFood.addEventListener("input", () => (
      this.#handlers.onFoodConfigChange()
    ));
    this.#elements.maxFood.addEventListener("input", () => (
      this.#handlers.onFoodConfigChange()
    ));
    this.#elements.spawnInterval.addEventListener("input", () => (
      this.#handlers.onFoodConfigChange()
    ));
    for (const element of [
      this.#elements.foodMinEnergy,
      this.#elements.foodMaxEnergy,
      this.#elements.foodInactivity,
    ]) {
      element.addEventListener("input", () => this.#handlers.onFoodConfigChange());
    }
    this.#elements.generationDuration.addEventListener("input", () => (
      this.#handlers.onGenerationConfigChange()
    ));
    for (const element of [
      this.#elements.movementCostCoefficient,
      this.#elements.movementCostExponent,
      this.#elements.turnCost,
      this.#elements.basalMetabolism,
      this.#elements.waterMovementCost,
      this.#elements.zeroEnergyDamage,
      this.#elements.healingEnergyThreshold,
      this.#elements.healingEnergyPerLife,
      this.#elements.healingMaxLife,
    ]) {
      element.addEventListener("input", () => this.#handlers.onBalanceConfigChange());
    }
    this.#elements.population.addEventListener("input", () => (
      this.#handlers.onPopulationChange()
    ));
    for (const element of [
      this.#elements.eyeCount,
      this.#elements.eyeFov,
      this.#elements.eyeRange,
      this.#elements.hiddenLayers,
      this.#elements.initialGeneMin,
      this.#elements.initialGeneMax,
      this.#elements.geneMin,
      this.#elements.geneMax,
    ]) {
      element.addEventListener("input", () => this.#handlers.onNeuralConfigChange());
    }
    this.#elements.brainFrequency.addEventListener(
      "change",
      () => this.#handlers.onNeuralConfigChange(),
    );
    this.#elements.activation.addEventListener(
      "change",
      () => this.#handlers.onNeuralConfigChange(),
    );
    for (const element of [
      this.#elements.eliteCount,
      this.#elements.tournamentSize,
      this.#elements.crossoverParentAChance,
      this.#elements.mutationChance,
      this.#elements.mutationStdDev,
    ]) {
      element.addEventListener("input", () => this.#handlers.onGeneticsConfigChange());
    }
    this.#elements.generationTimelineSelect.addEventListener("change", () => {
      this.#timelineSelection = this.#elements.generationTimelineSelect.value;
      if (this.#lastSnapshot !== null) {
        this.#renderGenerationTimeline(this.#lastSnapshot);
      }
    });
    this.#elements.generationTimelinePrevious.addEventListener(
      "click",
      () => this.#moveGenerationTimeline(-1),
    );
    this.#elements.generationTimelineNext.addEventListener(
      "click",
      () => this.#moveGenerationTimeline(1),
    );
    root.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && root.activeElement?.matches(".config-help__trigger")) {
        root.activeElement.blur();
      }
    });
  }

  getSeeds() {
    return {
      simulation: this.#elements.simulationSeed.value.trim(),
      map: this.#elements.mapSeed.value.trim(),
    };
  }

  getSpeed() {
    return this.#elements.speed.value === "max"
      ? "max"
      : Number(this.#elements.speed.value);
  }

  getFoodConfig() {
    return {
      initialCount: readNumber(this.#elements.initialFood),
      spawnCount: readNumber(this.#elements.spawnFood),
      spawnIntervalSeconds: readNumber(this.#elements.spawnInterval),
      maxCount: readNumber(this.#elements.maxFood),
      minEnergy: readNumber(this.#elements.foodMinEnergy),
      maxEnergy: readNumber(this.#elements.foodMaxEnergy),
      inactivityTimeoutSeconds: readNumber(this.#elements.foodInactivity),
    };
  }

  getPopulationConfig() {
    return {
      size: readNumber(this.#elements.population),
    };
  }

  getGenerationConfig() {
    return {
      durationSeconds: readNumber(this.#elements.generationDuration),
    };
  }

  getBalanceConfig() {
    return {
      movement: {
        costCoefficient: readNumber(this.#elements.movementCostCoefficient),
        costExponent: readNumber(this.#elements.movementCostExponent),
        turnCostAtMaxPerSecond: readNumber(this.#elements.turnCost),
      },
      energy: {
        basalMetabolismPerSecond: readNumber(this.#elements.basalMetabolism),
      },
      water: {
        movementCostMultiplier: readNumber(this.#elements.waterMovementCost),
      },
      life: {
        zeroEnergyDamagePerSecond: readNumber(this.#elements.zeroEnergyDamage),
      },
      healing: {
        energyThreshold: readNumber(this.#elements.healingEnergyThreshold),
        energyPerLife: readNumber(this.#elements.healingEnergyPerLife),
        maxLifePerSecond: readNumber(this.#elements.healingMaxLife),
      },
    };
  }

  getNeuralConfig() {
    return {
      eyes: {
        count: readNumber(this.#elements.eyeCount),
        fieldOfViewDegrees: readNumber(this.#elements.eyeFov),
        rangeTiles: readNumber(this.#elements.eyeRange),
      },
      time: {
        brainHz: readNumber(this.#elements.brainFrequency),
      },
      network: {
        hiddenLayers: parseHiddenLayers(this.#elements.hiddenLayers.value),
        activation: this.#elements.activation.value,
        initialGeneMin: readNumber(this.#elements.initialGeneMin),
        initialGeneMax: readNumber(this.#elements.initialGeneMax),
        geneMin: readNumber(this.#elements.geneMin),
        geneMax: readNumber(this.#elements.geneMax),
      },
    };
  }

  getGeneticsConfig() {
    return {
      eliteCount: readNumber(this.#elements.eliteCount),
      tournamentSize: readNumber(this.#elements.tournamentSize),
      uniformCrossoverParentAChance:
        readNumber(this.#elements.crossoverParentAChance) / 100,
      mutationChancePerGene: readNumber(this.#elements.mutationChance) / 100,
      mutationStdDev: readNumber(this.#elements.mutationStdDev),
    };
  }

  getHistoryView() {
    return this.#historyView;
  }

  applySettings({ config, speed, historyView }) {
    this.#elements.simulationSeed.value = config.seeds.simulation;
    this.#elements.mapSeed.value = config.seeds.map;
    this.#elements.population.value = String(config.population.size);
    this.#elements.initialFood.value = String(config.food.initialCount);
    this.#elements.initialFood.max = String(config.food.maxCount);
    this.#elements.spawnFood.value = String(config.food.spawnCount);
    this.#elements.spawnInterval.value = String(config.food.spawnIntervalSeconds);
    this.#elements.maxFood.value = String(config.food.maxCount);
    this.#elements.foodMinEnergy.value = String(config.food.minEnergy);
    this.#elements.foodMaxEnergy.value = String(config.food.maxEnergy);
    this.#elements.foodInactivity.value = String(config.food.inactivityTimeoutSeconds);
    this.#elements.generationDuration.value = String(config.generation.durationSeconds);
    this.#elements.movementCostCoefficient.value = String(config.movement.costCoefficient);
    this.#elements.movementCostExponent.value = String(config.movement.costExponent);
    this.#elements.turnCost.value = String(config.movement.turnCostAtMaxPerSecond);
    this.#elements.basalMetabolism.value = String(config.energy.basalMetabolismPerSecond);
    this.#elements.waterMovementCost.value = String(config.water.movementCostMultiplier);
    this.#elements.zeroEnergyDamage.value = String(config.life.zeroEnergyDamagePerSecond);
    this.#elements.healingEnergyThreshold.value = String(config.healing.energyThreshold);
    this.#elements.healingEnergyPerLife.value = String(config.healing.energyPerLife);
    this.#elements.healingMaxLife.value = String(config.healing.maxLifePerSecond);
    this.#elements.eyeCount.value = String(config.eyes.count);
    this.#elements.eyeFov.value = String(config.eyes.fieldOfViewDegrees);
    this.#elements.eyeRange.value = String(config.eyes.rangeTiles);
    this.#elements.brainFrequency.value = String(config.time.brainHz);
    this.#elements.hiddenLayers.value = config.network.hiddenLayers.join(", ");
    this.#elements.activation.value = config.network.activation;
    this.#elements.initialGeneMin.value = String(config.network.initialGeneMin);
    this.#elements.initialGeneMax.value = String(config.network.initialGeneMax);
    this.#elements.geneMin.value = String(config.network.geneMin);
    this.#elements.geneMax.value = String(config.network.geneMax);
    this.#elements.eliteCount.value = String(config.genetics.eliteCount);
    this.#elements.tournamentSize.value = String(config.genetics.tournamentSize);
    this.#elements.crossoverParentAChance.value = String(
      config.genetics.uniformCrossoverParentAChance * 100,
    );
    this.#elements.mutationChance.value = String(
      config.genetics.mutationChancePerGene * 100,
    );
    this.#elements.mutationStdDev.value = String(config.genetics.mutationStdDev);
    this.#elements.speed.value = String(speed);
    this.setHistoryView(historyView);
  }

  setHistoryView(view) {
    if (!["last50", "all"].includes(view)) {
      throw new RangeError("Modo de histórico inválido.");
    }
    this.#historyView = view;
    this.#elements.historyLast50.setAttribute("aria-pressed", String(view === "last50"));
    this.#elements.historyAll.setAttribute("aria-pressed", String(view === "all"));
    if (this.#lastSnapshot !== null) {
      this.#generationChart.render(this.#lastSnapshot.generationHistory, view);
    }
  }

  setMode(mode) {
    if (!Object.hasOwn(STATUS_COPY, mode)) {
      throw new RangeError(`Modo de interface desconhecido: ${mode}`);
    }

    this.#mode = mode;
    const copy = STATUS_COPY[mode];
    const isIdle = mode === "idle";

    this.#elements.simulationSeed.disabled = !isIdle;
    this.#elements.mapSeed.disabled = !isIdle;
    this.#elements.randomSimulationSeed.disabled = !isIdle;
    this.#elements.randomMapSeed.disabled = !isIdle;
    this.#elements.population.disabled = false;
    this.#elements.initialFood.disabled = false;
    this.#elements.spawnFood.disabled = false;
    this.#elements.maxFood.disabled = false;
    this.#elements.foodMinEnergy.disabled = false;
    this.#elements.foodMaxEnergy.disabled = false;
    this.#elements.foodInactivity.disabled = false;
    this.#elements.spawnInterval.disabled = false;
    this.#elements.generationDuration.disabled = false;
    this.#elements.movementCostCoefficient.disabled = false;
    this.#elements.movementCostExponent.disabled = false;
    this.#elements.turnCost.disabled = false;
    this.#elements.basalMetabolism.disabled = false;
    this.#elements.waterMovementCost.disabled = false;
    this.#elements.zeroEnergyDamage.disabled = false;
    this.#elements.healingEnergyThreshold.disabled = false;
    this.#elements.healingEnergyPerLife.disabled = false;
    this.#elements.healingMaxLife.disabled = false;
    this.#elements.eyeCount.disabled = !isIdle;
    this.#elements.eyeFov.disabled = !isIdle;
    this.#elements.eyeRange.disabled = !isIdle;
    this.#elements.brainFrequency.disabled = !isIdle;
    this.#elements.hiddenLayers.disabled = !isIdle;
    this.#elements.activation.disabled = !isIdle;
    this.#elements.initialGeneMin.disabled = !isIdle;
    this.#elements.initialGeneMax.disabled = !isIdle;
    this.#elements.geneMin.disabled = !isIdle;
    this.#elements.geneMax.disabled = !isIdle;
    this.#elements.eliteCount.disabled = false;
    this.#elements.tournamentSize.disabled = false;
    this.#elements.crossoverParentAChance.disabled = false;
    this.#elements.mutationChance.disabled = false;
    this.#elements.mutationStdDev.disabled = false;
    this.#elements.primary.textContent = isIdle ? "Iniciar" : "Reiniciar";
    this.#elements.pause.disabled = isIdle;
    this.#elements.pause.textContent = mode === "paused" ? "Continuar" : "Pausar";
    this.#elements.newExecution.disabled = isIdle;
    this.#elements.statusPill.dataset.state = mode;
    this.#elements.statusLabel.textContent = copy.label;
    this.#elements.statusMessage.dataset.state = mode;
    this.#elements.statusMessage.textContent = copy.message;
  }

  renderSnapshot(snapshot) {
    return this.#profiler.measure("ui.render-snapshot", () => {
      this.#lastSnapshot = snapshot;
      this.#profiler.measure("ui.metrics-hints", () => {
    this.#elements.generation.textContent = String(snapshot.generation);
    this.#elements.time.textContent = formatSimulatedTime(snapshot.simulatedTimeSeconds);
    this.#elements.totalTime.textContent = formatSimulatedTime(
      snapshot.totalSimulatedTimeSeconds,
    );
    this.#elements.tick.textContent = snapshot.tick.toLocaleString("pt-BR");
    this.#elements.completedGenerations.textContent = snapshot.completedGenerations
      .toLocaleString("pt-BR");
    this.#elements.foods.textContent = snapshot.foods.length.toLocaleString("pt-BR");
    this.#elements.aliveBeings.textContent = `${snapshot.population.aliveCount.toLocaleString("pt-BR")}/${snapshot.population.total.toLocaleString("pt-BR")}`;
    const desiredPopulationSize = this.#activeConfig?.population.size
      ?? snapshot.population.total;
    const populationPending = desiredPopulationSize !== snapshot.population.total;
    this.#elements.populationHint.dataset.pending = String(populationPending);
    this.#elements.populationHint.textContent = populationPending
      ? `Atual: ${snapshot.population.total.toLocaleString("pt-BR")} · próxima: ${desiredPopulationSize.toLocaleString("pt-BR")}`
      : `Atual: ${snapshot.population.total.toLocaleString("pt-BR")}`;
    const desiredInitialFoodCount = this.#activeConfig?.food.initialCount
      ?? snapshot.foodPolicy.initialCount;
    renderPendingHint(
      this.#elements.initialFoodHint,
      snapshot.foodPolicy.initialCount,
      desiredInitialFoodCount,
    );
    const currentDuration = snapshot.currentGenerationTimeline.configuredDurationSeconds;
    const desiredDuration = this.#activeConfig?.generation.durationSeconds ?? currentDuration;
    const durationPending = currentDuration !== desiredDuration;
    this.#elements.generationDurationHint.dataset.pending = String(durationPending);
    this.#elements.generationDurationHint.textContent = durationPending
      ? `Atual: ${currentDuration.toLocaleString("pt-BR")} s · próxima: ${desiredDuration.toLocaleString("pt-BR")} s`
      : `Atual: ${currentDuration.toLocaleString("pt-BR")} s`;
    const currentFoodMax = snapshot.foodPolicy.maxCount;
    const desiredFoodMax = this.#activeConfig?.food.maxCount ?? currentFoodMax;
    const foodMaxPending = currentFoodMax !== desiredFoodMax;
    this.#elements.maxFoodHint.dataset.pending = String(foodMaxPending);
    this.#elements.maxFoodHint.textContent = foodMaxPending
      ? `Atual: ${currentFoodMax.toLocaleString("pt-BR")} · próxima: ${desiredFoodMax.toLocaleString("pt-BR")}`
      : `Atual: ${currentFoodMax.toLocaleString("pt-BR")}`;
    const currentFoodMinEnergy = snapshot.foodPolicy.minEnergy;
    const currentFoodMaxEnergy = snapshot.foodPolicy.maxEnergy;
    const desiredFoodMinEnergy = this.#activeConfig?.food.minEnergy
      ?? currentFoodMinEnergy;
    const desiredFoodMaxEnergy = this.#activeConfig?.food.maxEnergy
      ?? currentFoodMaxEnergy;
    const foodEnergyPending = currentFoodMinEnergy !== desiredFoodMinEnergy
      || currentFoodMaxEnergy !== desiredFoodMaxEnergy;
    this.#elements.foodEnergyHint.dataset.pending = String(foodEnergyPending);
    this.#elements.foodEnergyHint.textContent = foodEnergyPending
      ? `Atual: ${currentFoodMinEnergy.toLocaleString("pt-BR")}–${currentFoodMaxEnergy.toLocaleString("pt-BR")} · próxima: ${desiredFoodMinEnergy.toLocaleString("pt-BR")}–${desiredFoodMaxEnergy.toLocaleString("pt-BR")}`
      : `Atual: ${currentFoodMinEnergy.toLocaleString("pt-BR")}–${currentFoodMaxEnergy.toLocaleString("pt-BR")}`;
    const currentInactivitySeconds = snapshot.foodPolicy.inactivityTimeoutTicks
      / (this.#activeConfig?.time.physicsHz ?? 30);
    const desiredInactivitySeconds = this.#activeConfig?.food.inactivityTimeoutSeconds
      ?? currentInactivitySeconds;
    const foodInactivityPending = currentInactivitySeconds !== desiredInactivitySeconds;
    const formatInactivity = (seconds) => seconds === 0
      ? "desativada"
      : `mínimo ${seconds.toLocaleString("pt-BR")} s`;
    this.#elements.foodInactivityHint.dataset.pending = String(foodInactivityPending);
    this.#elements.foodInactivityHint.textContent = foodInactivityPending
      ? `Atual: ${formatInactivity(currentInactivitySeconds)} · próxima: ${formatInactivity(desiredInactivitySeconds)}`
      : `Atual: ${formatInactivity(currentInactivitySeconds)}`;
    const desiredBeingPolicy = this.#activeConfig ?? snapshot.beingPolicy;
    const policyHints = [
      [this.#elements.movementCostCoefficientHint,
        snapshot.beingPolicy.movement.costCoefficient,
        desiredBeingPolicy.movement.costCoefficient, ""],
      [this.#elements.movementCostExponentHint,
        snapshot.beingPolicy.movement.costExponent,
        desiredBeingPolicy.movement.costExponent, ""],
      [this.#elements.turnCostHint,
        snapshot.beingPolicy.movement.turnCostAtMaxPerSecond,
        desiredBeingPolicy.movement.turnCostAtMaxPerSecond, "/s"],
      [this.#elements.basalMetabolismHint,
        snapshot.beingPolicy.energy.basalMetabolismPerSecond,
        desiredBeingPolicy.energy.basalMetabolismPerSecond, "/s"],
      [this.#elements.waterMovementCostHint,
        snapshot.beingPolicy.water.movementCostMultiplier,
        desiredBeingPolicy.water.movementCostMultiplier, "×"],
      [this.#elements.zeroEnergyDamageHint,
        snapshot.beingPolicy.life.zeroEnergyDamagePerSecond,
        desiredBeingPolicy.life.zeroEnergyDamagePerSecond, "/s"],
      [this.#elements.healingEnergyThresholdHint,
        snapshot.beingPolicy.healing.energyThreshold,
        desiredBeingPolicy.healing.energyThreshold, ""],
      [this.#elements.healingEnergyPerLifeHint,
        snapshot.beingPolicy.healing.energyPerLife,
        desiredBeingPolicy.healing.energyPerLife, ""],
      [this.#elements.healingMaxLifeHint,
        snapshot.beingPolicy.healing.maxLifePerSecond,
        desiredBeingPolicy.healing.maxLifePerSecond, "/s"],
    ];
    for (const [element, current, next, suffix] of policyHints) {
      renderPendingHint(element, current, next, suffix);
    }
    this.#elements.bestFitness.textContent = snapshot.population.bestFitness.toLocaleString(
      "pt-BR",
      { minimumFractionDigits: 2, maximumFractionDigits: 2 },
    );
    this.#elements.meanFitness.textContent = snapshot.population.meanFitness.toLocaleString(
      "pt-BR",
      { minimumFractionDigits: 2, maximumFractionDigits: 2 },
    );
    this.#elements.bestEver.textContent = snapshot.bestEver === null
      ? "—"
      : `${snapshot.bestEver.fitness.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} · G${snapshot.bestEver.generation}`;
        this.#elements.activeSimulationSeed.textContent = `Simulação: ${snapshot.seeds.simulation}`;
        this.#elements.activeMapSeed.textContent = `Mapa: ${snapshot.seeds.map}`;
      });
      this.#profiler.measure("ui.map-stats", () => {
        const islandCount = snapshot.map.islandCount.toLocaleString("pt-BR");
    const islandLabel = snapshot.map.islandCount === 1 ? "ilha" : "ilhas";
    const lakeCount = snapshot.map.lakeCount.toLocaleString("pt-BR");
    const lakeLabel = snapshot.map.lakeCount === 1 ? "lago" : "lagos";
    const mainIsland = snapshot.map.islands[0];
    const secondaryLandCount = snapshot.map.landCount - mainIsland.landCount;
    const secondaryProductivity = snapshot.map.totalProductivity
      - mainIsland.totalProductivity;
    const meanSecondaryProductivity = secondaryProductivity / secondaryLandCount;
    this.#elements.landStat.textContent = `${islandCount} ${islandLabel} · principal ${(mainIsland.landFraction * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% da terra · ${lakeCount} ${lakeLabel} · ${(snapshot.map.landFraction * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% do mapa`;
        this.#elements.productivityStat.textContent = `Produtividade média · principal ${mainIsland.meanProductivity.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} · secundárias ${meanSecondaryProductivity.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
      });
      this.#profiler.measure(
        "ui.history-chart",
        () => this.#generationChart.render(snapshot.generationHistory, this.#historyView),
      );
      this.#profiler.measure(
        "ui.timeline-charts",
        () => this.#renderGenerationTimeline(snapshot),
      );
      this.#profiler.measure("ui.inspector", () => this.#renderSelection(snapshot));
    });
  }

  renderConfig(config) {
    return this.#profiler.measure("ui.render-config", () => {
      this.#activeConfig = config;
      this.#elements.initialFood.max = String(config.food.maxCount);
      const compactSeed = (seed) => seed.length > 12 ? `${seed.slice(0, 8)}…` : seed;
      this.#elements.seedSummary.textContent = `simulação ${compactSeed(config.seeds.simulation)} · mapa ${compactSeed(config.seeds.map)}`;
      this.#elements.populationSummary.textContent = `${config.population.size.toLocaleString("pt-BR")} seres · ${formatConfigNumber(config.generation.durationSeconds)} s`;
      this.#elements.foodSummary.textContent = `${config.food.initialCount.toLocaleString("pt-BR")} iniciais · ${config.food.spawnCount.toLocaleString("pt-BR")} a cada ${formatConfigNumber(config.food.spawnIntervalSeconds)} s · máximo ${config.food.maxCount.toLocaleString("pt-BR")}`;
      this.#elements.networkSummary.textContent = `${config.derived.networkLayerSizes.join(" → ")} · ${config.network.activation} · ${config.time.brainHz} Hz`;
      this.#elements.geneticsSummary.textContent = `${config.genetics.eliteCount} elites globais · torneio ${config.genetics.tournamentSize} · mutação ${(config.genetics.mutationChancePerGene * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
      this.#elements.balanceSummary.textContent = `movimento ${formatConfigNumber(config.movement.costCoefficient)} × |v|^${formatConfigNumber(config.movement.costExponent)} · metabolismo ${formatConfigNumber(config.energy.basalMetabolismPerSecond)}/s · água ${formatConfigNumber(config.water.movementCostMultiplier)}×`;
    });
  }

  renderCamera(camera) {
    this.#elements.cameraZoomValue.value = `${Math.round(camera.zoom * 100)}%`;
    this.#elements.cameraZoomValue.textContent = `${Math.round(camera.zoom * 100)}%`;
    this.#elements.cameraZoomOut.disabled = camera.zoom <= camera.minZoom;
    this.#elements.cameraZoomIn.disabled = camera.zoom >= camera.maxZoom;
  }

  showRuntimeConfigApplied(receipt) {
    const populationMessage = receipt.populationChangePending
      ? ` População ${receipt.nextPopulationSize.toLocaleString("pt-BR")} será usada na próxima geração.`
      : "";
    const durationMessage = receipt.generationDurationChangePending
      ? ` Limite de ${receipt.nextGenerationDurationSeconds.toLocaleString("pt-BR")} s será usado na próxima geração.`
      : "";
    const foodMaxMessage = receipt.foodMaxChangePending
      ? ` Máximo de ${receipt.nextFoodMaxCount.toLocaleString("pt-BR")} comidas será usado na próxima geração.`
      : "";
    const initialFoodMessage = receipt.initialFoodChangePending
      ? ` ${receipt.nextInitialFoodCount.toLocaleString("pt-BR")} comidas iniciais serão usadas na próxima geração.`
      : "";
    const foodEnergyMessage = receipt.foodEnergyChangePending
      ? ` Energia ${receipt.nextFoodEnergyRange.minEnergy.toLocaleString("pt-BR")}–${receipt.nextFoodEnergyRange.maxEnergy.toLocaleString("pt-BR")} será usada na próxima geração.`
      : "";
    const foodInactivityMessage = receipt.foodInactivityChangePending
      ? ` Inatividade mínima de ${receipt.nextFoodInactivityTimeoutSeconds === 0 ? "zero (desativada)" : `${receipt.nextFoodInactivityTimeoutSeconds.toLocaleString("pt-BR")} s`} será usada na próxima geração.`
      : "";
    const beingPolicyMessage = receipt.beingPolicyChangePending
      ? " Custos e sobrevivência serão usados na próxima geração."
      : "";
    this.#showStatus(
      this.#mode,
      this.#mode === "paused" ? "Pausado" : "Executando",
      `Configuração atualizada no tick ${receipt.tick.toLocaleString("pt-BR")}.${populationMessage}${durationMessage}${foodMaxMessage}${initialFoodMessage}${foodEnergyMessage}${foodInactivityMessage}${beingPolicyMessage}`,
    );
  }

  showPreviewReady() {
    this.#showStatus(
      "idle",
      "Prévia atualizada",
      "Mapa, comida inicial, seres, cérebro e evolução foram aplicados sem iniciar ticks.",
    );
  }

  showPreviewPending() {
    this.#showStatus(
      "stale",
      "Atualizando prévia",
      "A configuração será aplicada quando você terminar de digitar.",
    );
  }

  showRuntimeConfigPending() {
    this.#showStatus(
      "stale",
      "Validando ajustes",
      "Spawn será atualizado agora; população, comida inicial, limites, custos, sobrevivência e evolução valerão na próxima geração.",
    );
  }

  showError(message) {
    this.#showStatus("error", "Erro", message);
  }

  showWarning(message) {
    this.#showStatus("stale", "Aviso", message);
  }

  showDefaultsRestored() {
    this.#showStatus(
      "idle",
      "Padrões restaurados",
      "A execução e o histórico foram limpos. As configurações voltaram aos defaults do projeto.",
    );
  }

  focusSimulationSeed() {
    this.#elements.simulationSeed.focus();
    this.#elements.simulationSeed.select();
  }

  setSelection(selection) {
    this.#selection = selection === null
      ? null
      : Object.freeze({ type: selection.type, id: selection.id });
    if (this.#lastSnapshot !== null) {
      this.#renderSelection(this.#lastSnapshot);
    }
  }

  setFollowTarget(target) {
    this.#followTarget = target;
    const followsBest = target?.mode === "best-alive";
    this.#elements.followBest.setAttribute("aria-pressed", String(followsBest));
    this.#elements.followBest.textContent = followsBest ? "Seguindo melhor" : "Seguir melhor";
    if (this.#lastSnapshot !== null) {
      this.#renderSelection(this.#lastSnapshot);
    }
  }

  clearSelection() {
    this.#selection = null;
    this.#followTarget = null;
    this.#elements.followBest.setAttribute("aria-pressed", "false");
    this.#elements.followBest.textContent = "Seguir melhor";
    this.#elements.inspectorEmpty.hidden = false;
    this.#elements.inspectorDetails.hidden = true;
    this.#elements.foodInspectorDetails.hidden = true;
  }

  resetGenerationTimelineSelection() {
    this.#timelineSelection = "current";
    this.#elements.generationTimelineSelect.value = "current";
    if (this.#lastSnapshot !== null) {
      this.#renderGenerationTimeline(this.#lastSnapshot);
    }
  }

  get mode() {
    return this.#mode;
  }

  #showStatus(state, label, message) {
    this.#elements.statusPill.dataset.state = state;
    this.#elements.statusLabel.textContent = label;
    this.#elements.statusMessage.dataset.state = state;
    this.#elements.statusMessage.textContent = message;
  }

  #renderSelection(snapshot) {
    if (this.#selection?.type === "food") {
      this.#renderSelectedFood(snapshot);
      return;
    }
    const selected = this.#selection?.type === "being"
      ? snapshot.beings.find((being) => being.id === this.#selection.id)
      : null;
    if (!selected) {
      this.#elements.inspectorEmpty.hidden = false;
      this.#elements.inspectorDetails.hidden = true;
      this.#elements.foodInspectorDetails.hidden = true;
      return;
    }

    this.#elements.inspectorEmpty.hidden = true;
    this.#elements.inspectorDetails.hidden = false;
    this.#elements.foodInspectorDetails.hidden = true;
    this.#elements.selectedBeingTitle.textContent = `Ser #${selected.id}${selected.alive ? "" : " — morto"}`;
    const followsBest = this.#followTarget?.mode === "best-alive"
      && snapshot.population.bestAliveBeingId === selected.id;
    const isFollowing = selected.alive && (followsBest
      || (this.#followTarget?.mode === "being" && this.#followTarget.id === selected.id));
    this.#elements.followBeing.disabled = !selected.alive;
    this.#elements.followBeing.textContent = followsBest
      ? "Seguindo melhor"
      : (isFollowing ? "Parar de seguir" : "Seguir ser");
    this.#elements.followBeing.setAttribute("aria-pressed", String(isFollowing));
    this.#elements.selectedBeingLife.textContent = selected.life.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
    this.#elements.selectedBeingEnergy.textContent = selected.energy.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
    this.#elements.selectedBeingFeeding.textContent = selected.isFeeding ? "Sim" : "Não";
    this.#elements.selectedBeingFeedingFood.textContent = selected.feedingFoodId === null
      ? "—"
      : `#${selected.feedingFoodId.toLocaleString("pt-BR")}`;
    this.#elements.selectedBeingSpeed.textContent = selected.speed.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    this.#elements.selectedBeingAge.textContent = `${selected.ageSeconds.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
    this.#elements.selectedBeingFitness.textContent = selected.fitness.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    this.#elements.selectedBeingAbsorbed.textContent = selected.absorbedEnergy.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
    const neuralModel = createNeuralInspectorModel(
      selected.brain,
      snapshot.neuralInputSchema,
    );
    this.#renderBrainRows(this.#elements.selectedBeingBrainInputs, neuralModel.inputs);
    this.#renderBrainRows(this.#elements.selectedBeingBrainOutputs, neuralModel.outputs);
    this.#elements.selectedBeingGeneCount.textContent = selected.brain.geneCount.toLocaleString("pt-BR");
  }

  #renderSelectedFood(snapshot) {
    const selected = snapshot.foods.find((food) => food.id === this.#selection.id);
    if (!selected || this.#activeConfig === null) {
      this.#elements.inspectorEmpty.hidden = false;
      this.#elements.inspectorDetails.hidden = true;
      this.#elements.foodInspectorDetails.hidden = true;
      return;
    }
    const tile = snapshot.map.tiles[(selected.row * snapshot.map.columns) + selected.column];
    const remainingRatio = Math.max(
      0,
      Math.min(1, selected.remainingEnergy / selected.initialEnergy),
    );

    this.#elements.inspectorEmpty.hidden = true;
    this.#elements.inspectorDetails.hidden = true;
    this.#elements.foodInspectorDetails.hidden = false;
    this.#elements.selectedFoodTitle.textContent = `Comida #${selected.id}`;
    this.#elements.selectedFoodColumn.textContent = selected.column.toLocaleString("pt-BR");
    this.#elements.selectedFoodRow.textContent = selected.row.toLocaleString("pt-BR");
    this.#elements.selectedFoodProductivity.textContent = tile.productivity.toLocaleString(
      "pt-BR",
      { minimumFractionDigits: 3, maximumFractionDigits: 6 },
    );
    this.#elements.selectedFoodInitialEnergy.textContent = selected.initialEnergy.toLocaleString(
      "pt-BR",
      { minimumFractionDigits: 2, maximumFractionDigits: 6 },
    );
    this.#elements.selectedFoodRemainingEnergy.textContent = selected.remainingEnergy
      .toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
    this.#elements.selectedFoodRatio.textContent = `${(remainingRatio * 100).toLocaleString(
      "pt-BR",
      { minimumFractionDigits: 1, maximumFractionDigits: 1 },
    )}%`;
    this.#elements.selectedFoodInactivity.textContent =
      selected.inactivityRemainingTicks === null
        ? "Desativada"
        : `${(selected.inactivityRemainingTicks / this.#activeConfig.time.physicsHz).toLocaleString(
          "pt-BR",
          { minimumFractionDigits: 1, maximumFractionDigits: 1 },
        )} s restantes · prazo ${(selected.inactivityTimeoutTicks
          / this.#activeConfig.time.physicsHz).toLocaleString(
          "pt-BR",
          { minimumFractionDigits: 1, maximumFractionDigits: 1 },
        )} s`;
  }

  #renderBrainRows(target, rows) {
    const fragment = this.#root.createDocumentFragment();
    for (const rowData of rows) {
      const row = this.#root.createElement("tr");
      for (const value of [
        rowData.label,
        rowData.description,
        rowData.value.toLocaleString("pt-BR", { maximumFractionDigits: 3 }),
      ]) {
        const cell = this.#root.createElement("td");
        cell.textContent = value;
        row.append(cell);
      }
      fragment.append(row);
    }
    target.replaceChildren(fragment);
  }

  #renderGenerationTimeline(snapshot) {
    const selectedTimeline = selectGenerationTimeline(snapshot, this.#timelineSelection);
    this.#timelineSelection = selectedTimeline.selection;
    const optionsKey = `${snapshot.generation}:${snapshot.generationHistory
      .map((record) => record.generation).join(",")}`;
    if (optionsKey !== this.#timelineOptionsKey) {
      const fragment = this.#root.createDocumentFragment();
      for (const optionData of selectedTimeline.options) {
        const option = this.#root.createElement("option");
        option.value = optionData.value;
        option.textContent = optionData.label;
        fragment.append(option);
      }
      this.#elements.generationTimelineSelect.replaceChildren(fragment);
      this.#elements.generationTimelineSelect.value = this.#timelineSelection;
      this.#timelineOptionsKey = optionsKey;
    }
    this.#elements.generationTimelineSelect.value = this.#timelineSelection;
    this.#elements.generationTimelinePrevious.disabled =
      getAdjacentGenerationTimelineSelection(snapshot, this.#timelineSelection, -1)
        === this.#timelineSelection;
    this.#elements.generationTimelineNext.disabled =
      getAdjacentGenerationTimelineSelection(snapshot, this.#timelineSelection, 1)
        === this.#timelineSelection;

    for (const chart of this.#timelineCharts) {
      chart.render(selectedTimeline.timeline, { completed: selectedTimeline.completed });
    }
  }

  #moveGenerationTimeline(direction) {
    if (this.#lastSnapshot === null) {
      return;
    }
    this.#timelineSelection = getAdjacentGenerationTimelineSelection(
      this.#lastSnapshot,
      this.#timelineSelection,
      direction,
    );
    this.#renderGenerationTimeline(this.#lastSnapshot);
  }
}
