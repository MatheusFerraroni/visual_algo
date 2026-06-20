// Liga os controles HTML aos comportamentos da aplicação.
function eventTargetIsTextEditable(target) {
  if (!target || !(target instanceof Element)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function attachUI() {
  state.ui = {
    statusBox: $("statusBox"),
    renderToggle: $("renderToggle"),
    followLeaderToggle: $("followLeaderToggle"),
    mapEditorToggle: $("mapEditorToggle"),
    trackEditorControls: $("trackEditorControls"),
    defaultTrackSelect: $("defaultTrackSelect"),
    resetViewBtn: $("resetViewBtn"),
    batchPreviewModeBadge: $("batchPreviewModeBadge"),
    batchPreviewEmpty: $("batchPreviewEmpty"),
    batchPreviewPanel: $("batchPreviewPanel"),
    batchPreviewMeta: $("batchPreviewMeta"),
    batchPreviewSvg: $("batchPreviewSvg"),
    batchPreviewList: $("batchPreviewList"),
    canvasStage: document.querySelector(".canvas-stage"),
    canvasHolder: $("canvas-holder"),
    editorMode: $("editorMode"),
    showCheckpoints: $("showCheckpoints"),
    trackJson: $("trackJson"),
    hiddenLayers: $("hiddenLayers"),
    neuronsPerLayer: $("neuronsPerLayer"),
    activation: $("activation"),
    sensorCount: $("sensorCount"),
    sensorAngles: $("sensorAngles"),
    populationSize: $("populationSize"),
    mutationRate: $("mutationRate"),
    mutationStrength: $("mutationStrength"),
    elitism: $("elitism"),
    crossoverRate: $("crossoverRate"),
    maxGenerationTime: $("maxGenerationTime"),
    collisionPenalty: $("collisionPenalty"),
    progressBonus: $("progressBonus"),
    speedBonus: $("speedBonus"),
    showSensorsFor: $("showSensorsFor"),
    bestBrainJson: $("bestBrainJson"),
    historyEmpty: $("historyEmpty"),
    historyPanel: $("historyPanel"),
    historyChart: $("historyChart"),
    historyTableBody: $("historyTableBody"),
    vehicleHoverBox: $("vehicleHoverBox"),
    vehicleHoverContent: $("vehicleHoverContent"),
    statGeneration: $("statGeneration"),
    statAlive: $("statAlive"),
    statBestFitness: $("statBestFitness"),
    statAvgFitness: $("statAvgFitness"),
    statBestProgress: $("statBestProgress"),
    statTime: $("statTime"),
    statStepMs: $("statStepMs"),
    statFuel: $("statFuel"),
    statFuelRate: $("statFuelRate")
  };
  renderBatchPreview();
  syncCanvasInteractionClasses();
  populateDefaultTrackPresetOptions();

  // Controles principais da simulação.
  $("startBtn").addEventListener("click", startSimulation);
  state.ui.resetViewBtn.addEventListener("click", () => {
    resetViewTransform();
    setStatus("Visualização do canvas resetada para 100% e sem pan.", "info");
  });
  state.ui.renderToggle.addEventListener("change", event => {
    setRenderEnabled(event.target.checked);
    setStatus(
      event.target.checked
        ? "Renderização reativada. A execução voltou ao modo de tempo real."
        : "Renderização desativada. O simulador de eventos foi ativado para priorizar desempenho.",
      "info"
    );
  });
  state.ui.followLeaderToggle.addEventListener("change", event => {
    setFollowLeaderEnabled(event.target.checked);
    setStatus(
      event.target.checked
        ? "A câmera agora segue o veículo líder. O zoom continua manual, mas o pan foi bloqueado."
        : "Modo de seguir líder desativado. O pan manual da câmera voltou a ficar disponível.",
      "info"
    );
  });
  state.ui.mapEditorToggle.addEventListener("change", event => {
    const pausedSimulation = setMapEditorEnabled(event.target.checked);
    setStatus(
      event.target.checked
        ? pausedSimulation
          ? "Editor de mapa reativado. A simulação foi pausada para liberar a edição da pista."
          : "Editor de mapa reativado. O canvas voltou a aceitar edição da pista."
        : "Editor de mapa desativado. Agora você pode inspecionar veículos com hover e fixar o painel com clique.",
      "info"
    );
  });
  $("pauseBtn").addEventListener("click", () => {
    if (state.sim.vehicles.length === 0) return;
    if (state.sim.running && !state.sim.paused) {
      state.sim.paused = true;
      setStatus("Simulação pausada. Você pode inspecionar ou editar a pista.", "info");
    } else {
      setMapEditorEnabled(false);
      state.sim.running = true;
      state.sim.paused = false;
      if (state.sim.mode === SIMULATION_MODES.event) {
        scheduleFastSimulationLoop();
      }
      setStatus("Simulação retomada. O editor de pista foi desativado automaticamente.", "info");
    }
  });
  $("resetBtn").addEventListener("click", resetEvolution);
  $("nextGenBtn").addEventListener("click", () => {
    if (state.sim.vehicles.length === 0) {
      createInitialPopulation();
      state.sim.paused = true;
      state.sim.running = false;
      updateStats();
      return;
    }
    finishGeneration(true);
  });

  state.ui.editorMode.addEventListener("change", event => {
    state.editor.mode = event.target.value;
  });
  state.ui.vehicleHoverBox.addEventListener("mouseenter", () => {
    state.inspect.hoverBoxHovered = true;
  });
  state.ui.vehicleHoverBox.addEventListener("mouseleave", () => {
    state.inspect.hoverBoxHovered = false;
  });
  state.ui.vehicleHoverBox.addEventListener("click", event => {
    const closeBtn = event.target.closest("[data-close-vehicle-hover]");
    if (!closeBtn) return;
    event.preventDefault();
    event.stopPropagation();
    closePinnedVehiclePanel();
  });
  document.addEventListener("pointerdown", event => {
    if (!state.inspect.pinnedVehicle) return;
    if (state.ui.vehicleHoverBox.contains(event.target)) return;
    closePinnedVehiclePanel();
  }, true);
  document.addEventListener("keydown", event => {
    const undoShortcut = (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "z";
    if (!undoShortcut) return;
    if (eventTargetIsTextEditable(event.target)) return;
    if (!isEditorEnabled()) return;
    event.preventDefault();
    undoTrackEdit();
  });

  $("defaultTrackBtn").addEventListener("click", () => {
    loadBuiltInTrackPreset(state.ui.defaultTrackSelect.value);
  });
  $("clearTrackBtn").addEventListener("click", clearTrack);
  $("saveTrackBtn").addEventListener("click", saveTrackJson);
  $("loadTrackBtn").addEventListener("click", () => {
    try {
      loadTrack(JSON.parse(state.ui.trackJson.value));
    } catch (error) {
      setStatus(`Falha ao importar pista: ${error.message}`, "error");
    }
  });
  // Persistência local de pista e melhor rede.
  $("saveTrackLocalBtn").addEventListener("click", () => {
    localStorage.setItem(STORAGE_KEYS.track, JSON.stringify(state.track));
    setStatus("Pista salva no localStorage do navegador.", "success");
  });
  $("loadTrackLocalBtn").addEventListener("click", () => {
    const raw = localStorage.getItem(STORAGE_KEYS.track);
    if (!raw) {
      setStatus("Nenhuma pista salva no navegador.", "error");
      return;
    }
    try {
      loadTrack(JSON.parse(raw));
    } catch (error) {
      setStatus(`Não foi possível carregar a pista salva: ${error.message}`, "error");
    }
  });

  // Importação/exportação de pesos da melhor rede.
  $("spreadSensorsBtn").addEventListener("click", distributeSensorAngles);
  $("saveBestBtn").addEventListener("click", () => {
    const payload = state.sim.bestBrainData || state.sim.seedBrainData;
    if (!payload) {
      setStatus("Ainda não existe melhor rede para exportar.", "error");
      return;
    }
    state.ui.bestBrainJson.value = JSON.stringify(payload, null, 2);
    setStatus("JSON da melhor rede atualizado no textarea.", "success");
  });
  $("loadBestBtn").addEventListener("click", () => {
    try {
      loadBestBrainJson(JSON.parse(state.ui.bestBrainJson.value));
    } catch (error) {
      setStatus(`Falha ao importar rede: ${error.message}`, "error");
    }
  });
  $("saveBestLocalBtn").addEventListener("click", () => {
    const payload = state.sim.bestBrainData || state.sim.seedBrainData;
    if (!payload) {
      setStatus("Ainda não existe melhor rede para salvar no navegador.", "error");
      return;
    }
    localStorage.setItem(STORAGE_KEYS.bestBrain, JSON.stringify(payload));
    setStatus("Melhor rede salva no localStorage do navegador.", "success");
  });
  $("loadBestLocalBtn").addEventListener("click", () => {
    const raw = localStorage.getItem(STORAGE_KEYS.bestBrain);
    if (!raw) {
      setStatus("Nenhuma rede salva no navegador.", "error");
      return;
    }
    try {
      loadBestBrainJson(JSON.parse(raw));
    } catch (error) {
      setStatus(`Não foi possível carregar a rede salva: ${error.message}`, "error");
    }
  });
}

function populateDefaultTrackPresetOptions() {
  if (!state.ui.defaultTrackSelect) return;
  state.ui.defaultTrackSelect.innerHTML = "";
  for (const preset of getBuiltInTrackPresets()) {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.label;
    state.ui.defaultTrackSelect.appendChild(option);
  }
  syncDefaultTrackPresetSelection(DEFAULT_TRACK_PRESET_ID);
}

function syncDefaultTrackPresetSelection(presetId = "") {
  if (!state.ui.defaultTrackSelect) return;
  const select = state.ui.defaultTrackSelect;
  const customOption = select.querySelector('option[data-custom-track-option="true"]');
  if (customOption) {
    customOption.remove();
  }

  const hasPresetOption = presetId && Array.from(select.options).some(option => option.value === presetId);
  if (hasPresetOption) {
    select.value = presetId;
    return;
  }

  const option = document.createElement("option");
  option.value = "";
  option.textContent = "Pista atual (personalizada)";
  option.dataset.customTrackOption = "true";
  select.prepend(option);
  select.value = "";
}
