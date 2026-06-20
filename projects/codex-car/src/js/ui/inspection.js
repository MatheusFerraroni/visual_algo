// Hover, painel fixado e estatísticas de inspeção dos veículos.
function displayFitnessForVehicle(vehicle, gaConfig = readGaConfig()) {
  if (!vehicle) return 0;
  return vehicle.alive
    ? vehicle.estimateCurrentFitness(gaConfig)
    : (vehicle.fitness || vehicle.estimateCurrentFitness(gaConfig));
}

function bestVehicleCurrentGeneration() {
  if (state.sim.vehicles.length === 0) return null;
  const gaConfig = readGaConfig();
  return state.sim.vehicles.reduce((best, vehicle) => {
    if (!best) return vehicle;
    const scoreA = best.bestProgress + displayFitnessForVehicle(best, gaConfig) * 0.001;
    const scoreB = vehicle.bestProgress + displayFitnessForVehicle(vehicle, gaConfig) * 0.001;
    return scoreB > scoreA ? vehicle : best;
  }, null);
}

function hoveredVehicleCurrentFrame() {
  if (!insideCanvas(mouseX, mouseY) || state.sim.vehicles.length === 0) return null;
  let best = null;
  let bestDistSq = UI_INTERACTION.vehicleHoverRadius * UI_INTERACTION.vehicleHoverRadius;
  for (const vehicle of state.sim.vehicles) {
    const screenPoint = worldToScreenPoint(vehicle.pos.x, vehicle.pos.y);
    const dx = screenPoint.x - mouseX;
    const dy = screenPoint.y - mouseY;
    const distSq = dx * dx + dy * dy;
    if (distSq <= bestDistSq) {
      bestDistSq = distSq;
      best = vehicle;
    }
  }
  return best;
}

// Resolve qual veículo deve aparecer no painel neste frame.
function resolveVehicleInspectionState() {
  if (state.inspect.pinnedVehicle && !vehicleStillAvailable(state.inspect.pinnedVehicle)) {
    clearVehicleInspectionState();
  }
  if (state.inspect.pinnedVehicle) {
    return {
      vehicle: state.inspect.pinnedVehicle,
      pinned: true,
      hoveredNow: false
    };
  }
  if (isEditorEnabled()) {
    state.inspect.lastHoverVehicle = null;
    return null;
  }

  const hovered = hoveredVehicleCurrentFrame();
  if (hovered) {
    state.inspect.lastHoverVehicle = hovered;
    state.inspect.lastHoverSeenAtMs = performance.now();
    state.inspect.panelAnchor = { x: mouseX, y: mouseY };
    return {
      vehicle: hovered,
      pinned: false,
      hoveredNow: true
    };
  }

  const hoverGraceMs = 260;
  const hoverStillFresh =
    state.inspect.lastHoverVehicle &&
    vehicleStillAvailable(state.inspect.lastHoverVehicle) &&
    performance.now() - state.inspect.lastHoverSeenAtMs <= hoverGraceMs;

  if ((state.inspect.hoverBoxHovered || hoverStillFresh) && vehicleStillAvailable(state.inspect.lastHoverVehicle)) {
    return {
      vehicle: state.inspect.lastHoverVehicle,
      pinned: false,
      hoveredNow: false
    };
  }

  state.inspect.lastHoverVehicle = null;
  return null;
}

// Preenche e posiciona a caixa flutuante de inspeção.
function updateVehicleHoverPanel(inspectState) {
  profilerMeasure("ui.updateVehicleHoverPanel", () => {
    if (!state.ui.vehicleHoverBox || !state.ui.vehicleHoverContent) return;
    if (!inspectState || !inspectState.vehicle) {
      state.ui.vehicleHoverBox.classList.add("d-none");
      state.ui.vehicleHoverBox.classList.remove("vehicle-hover-interactive");
      return;
    }
    const { vehicle, pinned, hoveredNow } = inspectState;

  const gaConfig = readGaConfig();
  const liveFitness = displayFitnessForVehicle(vehicle, gaConfig);
  const sensorLines = vehicle.netConfig.sensorAngles.map((angle, index) => {
    const normalized = vehicle.sensorReadings[index] ?? 0;
    const distance = normalized * PHYSICS.sensorRange;
    return `${String(index + 1).padStart(2, "0")}. ${formatAngleDegrees(angle, 1)} -> ${formatNumber(distance, 1)} px (${formatNumber(normalized, 3)})`;
  }).join("\n");

  const inputLines = [
    `velocidade_norm = ${formatNumber(vehicle.lastBrainInputs[0] ?? 0, 3)}`,
    `aceleracao_norm = ${formatNumber(vehicle.lastBrainInputs[1] ?? 0, 3)}`,
    ...vehicle.netConfig.sensorAngles.map((angle, index) =>
      `sensor_${index + 1} ${formatAngleDegrees(angle, 1)} = ${formatNumber(vehicle.lastBrainInputs[index + 2] ?? 0, 3)}`
    ),
    `curvatura = ${formatNumber(vehicle.lastBrainInputs[vehicle.lastBrainInputs.length - 1] ?? 0, 3)}`
  ].join("\n");

  const outputLines = [
    `aceleracao_saida = ${formatNumber(vehicle.lastBrainOutputs[0] ?? 0, 3)}`,
    `direcao_saida = ${formatNumber(vehicle.lastBrainOutputs[1] ?? 0, 3)}`,
    `aceleracao_fisica = ${formatNumber(vehicle.accel, 2)}`,
    `heading = ${formatAngleDegrees(vehicle.angle, 1)}`
  ].join("\n");

  if (hoveredNow) {
    state.inspect.panelAnchor = { x: mouseX, y: mouseY };
  } else if (!state.inspect.panelAnchor) {
    const fallback = worldToScreenPoint(vehicle.pos.x, vehicle.pos.y);
    state.inspect.panelAnchor = { x: fallback.x, y: fallback.y };
  }

  state.ui.vehicleHoverContent.innerHTML = `
    <div class="vehicle-hover-header">
      <h3 class="section-title">${pinned ? "Veículo fixado" : "Veículo sob o mouse"}</h3>
      ${pinned ? '<button type="button" class="btn btn-soft btn-sm vehicle-hover-close" data-close-vehicle-hover aria-label="Fechar painel">×</button>' : ""}
    </div>
    <div class="vehicle-hover-grid">
      <div class="vehicle-hover-metric"><span>Fitness atual</span><strong>${escapeHtml(formatNumber(liveFitness, 2))}</strong></div>
      <div class="vehicle-hover-metric"><span>Velocidade</span><strong>${escapeHtml(formatNumber(vehicle.worldSpeed || Math.abs(vehicle.speed), 2))}</strong></div>
      <div class="vehicle-hover-metric"><span>Veloc. frente</span><strong>${escapeHtml(formatNumber(vehicle.speed, 2))}</strong></div>
      <div class="vehicle-hover-metric"><span>Combustível</span><strong>${escapeHtml(formatNumber(vehicle.fuel, 2))} / ${escapeHtml(formatNumber(vehicle.maxFuel, 0))}</strong></div>
      <div class="vehicle-hover-metric"><span>Consumo inst.</span><strong>${escapeHtml(formatNumber(vehicle.instantFuelConsumption, 3))}/s</strong></div>
      <div class="vehicle-hover-metric"><span>Deslize lateral</span><strong>${escapeHtml(formatNumber(vehicle.lateralSlip || 0, 2))}</strong></div>
      <div class="vehicle-hover-metric"><span>Ângulo do carro</span><strong>${escapeHtml(formatAngleDegrees(vehicle.angle, 1))}</strong></div>
      <div class="vehicle-hover-metric"><span>Estado</span><strong>${escapeHtml(vehicle.alive ? "vivo" : `morto (${vehicle.deadReason || "n/d"})`)}</strong></div>
    </div>

    <div class="vehicle-hover-section">
      <div class="vehicle-hover-title">Distâncias por Ângulo</div>
      <pre class="vehicle-hover-pre">${escapeHtml(sensorLines)}</pre>
    </div>

    <div class="vehicle-hover-section">
      <div class="vehicle-hover-title">Entradas da Rede</div>
      <pre class="vehicle-hover-pre">${escapeHtml(inputLines)}</pre>
    </div>

    <div class="vehicle-hover-section">
      <div class="vehicle-hover-title">Saídas da Rede</div>
      <pre class="vehicle-hover-pre">${escapeHtml(outputLines)}</pre>
    </div>

    <div class="vehicle-hover-section">
      <div class="vehicle-hover-title">Pesos da Rede Neural</div>
      <pre class="vehicle-hover-pre">${escapeHtml(vehicle.getWeightSnapshot())}</pre>
    </div>
  `;

  state.ui.vehicleHoverBox.classList.remove("d-none");
  state.ui.vehicleHoverBox.classList.toggle("vehicle-hover-interactive", pinned || !isEditorEnabled());
  const stageRect = state.ui.canvasStage.getBoundingClientRect();
  const panelWidth = state.ui.vehicleHoverBox.offsetWidth || Math.min(420, Math.max(260, stageRect.width - 32));
  const panelHeight = state.ui.vehicleHoverBox.offsetHeight || 320;
  const maxLeft = Math.max(8, stageRect.width - panelWidth - 8);
  const maxTop = Math.max(8, stageRect.height - panelHeight - 8);
  const anchor = state.inspect.panelAnchor || { x: mouseX, y: mouseY };
  const left = clamp(anchor.x + 18, 8, maxLeft);
  const top = clamp(anchor.y + 18, 8, maxTop);
    state.ui.vehicleHoverBox.style.left = `${left}px`;
    state.ui.vehicleHoverBox.style.top = `${top}px`;
  });
}

// Atualiza os indicadores numéricos da HUD lateral.
function updateStats() {
  if (!state.ui.statGeneration) return;
  const alive = state.sim.vehicles.filter(v => v.alive).length;
  const gaConfig = readGaConfig();
  const bestVehicle = bestVehicleCurrentGeneration();
  const geomLength = state.trackGeom ? state.trackGeom.totalLength : 1;
  const summary = state.sim.lastSummary;
  const useSummary = Boolean(summary) && state.sim.vehicles.length === 0;
  const liveFitnessValues = useSummary
    ? []
    : state.sim.vehicles.map(vehicle => displayFitnessForVehicle(vehicle, gaConfig));
  const bestFitness = useSummary
    ? summary.bestFitness
    : liveFitnessValues.length
      ? Math.max(...liveFitnessValues)
      : 0;
  const avgFitness = useSummary
    ? summary.avgFitness
    : liveFitnessValues.length
      ? liveFitnessValues.reduce((sum, value) => sum + value, 0) / liveFitnessValues.length
      : 0;
  const progress = useSummary
    ? summary.bestProgress
    : bestVehicle
      ? bestVehicle.bestProgress
      : 0;

  state.ui.statGeneration.textContent = String(state.sim.generation);
  state.ui.statAlive.textContent = String(alive);
  state.ui.statBestFitness.textContent = formatNumber(bestFitness, 1);
  state.ui.statAvgFitness.textContent = formatNumber(avgFitness, 1);
  state.ui.statBestProgress.textContent = `${formatNumber((progress / geomLength) * 100, 1)}%`;
  state.ui.statTime.textContent = `${formatNumber(state.sim.elapsed, 1)}s`;
  state.ui.statStepMs.textContent = formatSimulationRate(state.sim.avgObservedStepsPerSecond, 1);
  state.ui.statFuel.textContent = bestVehicle
    ? `${formatNumber((bestVehicle.fuel / bestVehicle.maxFuel) * 100, 1)}%`
    : "0%";
  state.ui.statFuelRate.textContent = bestVehicle
    ? `${formatNumber(bestVehicle.instantFuelConsumption, 2)}/s`
    : "0/s";
}
