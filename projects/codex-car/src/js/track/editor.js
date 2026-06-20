// Carregamento de pista e interações de edição no canvas.
function cloneTrackForEditorHistory(track = state.track) {
  if (!track) return null;
  return {
    version: Number(track.version) || 1,
    name: track.name ? String(track.name) : "",
    presetId: track.presetId ? String(track.presetId) : "",
    outer: clonePoints(track.outer || []),
    inner: clonePoints(track.inner || []),
    start: {
      x: Number(track.start?.x) || 0,
      y: Number(track.start?.y) || 0,
      angle: Number(track.start?.angle) || 0
    }
  };
}

function resetTrackUndoHistory() {
  state.editor.undoStack = [];
}

function pushTrackUndoSnapshot() {
  const snapshot = cloneTrackForEditorHistory();
  if (!snapshot) return;
  const signature = JSON.stringify(snapshot);
  const lastEntry = state.editor.undoStack[state.editor.undoStack.length - 1];
  if (lastEntry?.signature === signature) return;
  state.editor.undoStack.push({ snapshot, signature });
  if (state.editor.undoStack.length > state.editor.undoLimit) {
    state.editor.undoStack.splice(0, state.editor.undoStack.length - state.editor.undoLimit);
  }
}

function applyTrackSnapshot(snapshot) {
  if (!snapshot) return false;
  state.track = cloneTrackForEditorHistory(snapshot);
  state.trackGeom = buildTrackGeometry(state.track);
  if (state.ui.defaultTrackSelect) {
    syncDefaultTrackPresetSelection(state.track.presetId);
  }
  state.ui.trackJson.value = JSON.stringify(state.track, null, 2);
  return true;
}

function undoTrackEdit() {
  const entry = state.editor.undoStack.pop();
  if (!entry) {
    setStatus("Não há mais alterações da pista para desfazer.", "info");
    return false;
  }
  const applied = applyTrackSnapshot(entry.snapshot);
  if (!applied) return false;
  state.editor.dragging = null;
  state.editor.draggingStart = false;
  setStatus("Última edição da pista desfeita.", "info");
  return true;
}

function loadTrack(trackData) {
  profilerMeasure("track.loadTrack", () => {
    if (!trackData || !Array.isArray(trackData.outer) || !Array.isArray(trackData.inner) || !trackData.start) {
      throw new Error("Formato de pista inválido.");
    }
    state.track = {
      version: Number(trackData.version) || 1,
      name: trackData.name ? String(trackData.name) : "",
      presetId: trackData.presetId ? String(trackData.presetId) : "",
      outer: trackData.outer.map(clonePoint),
      inner: trackData.inner.map(clonePoint),
      start: {
        x: Number(trackData.start.x),
        y: Number(trackData.start.y),
        angle: Number(trackData.start.angle) || 0
      }
    };
    state.trackGeom = buildTrackGeometry(state.track);
    resetTrackUndoHistory();
    if (state.ui.defaultTrackSelect) {
      syncDefaultTrackPresetSelection(state.track.presetId);
    }
    state.ui.trackJson.value = JSON.stringify(state.track, null, 2);
    resetEvolution();
    const trackLabel = state.track.name || "Pista";
    setStatus(`${trackLabel} carregada. Você pode editar ou iniciar a evolução.`, "success");
  });
}

function loadBuiltInTrackPreset(presetId = DEFAULT_TRACK_PRESET_ID) {
  const preset = getBuiltInTrackPresetById(presetId) || getBuiltInTrackPresetById(DEFAULT_TRACK_PRESET_ID);
  if (!preset) {
    setStatus("Nenhuma pista padrão disponível para carregar.", "error");
    return;
  }
  loadTrack(preset.data);
}

function clearTrack() {
  state.track = {
    version: 1,
    name: "Pista vazia",
    presetId: "",
    outer: [],
    inner: [],
    start: { x: 220, y: 220, angle: 0 }
  };
  state.trackGeom = null;
  resetTrackUndoHistory();
  if (state.ui.defaultTrackSelect) {
    syncDefaultTrackPresetSelection("");
  }
  state.ui.trackJson.value = JSON.stringify(state.track, null, 2);
  resetEvolution();
  setStatus("Pista limpa. Desenhe primeiro a parede externa e depois a interna.", "info");
}

function saveTrackJson() {
  state.ui.trackJson.value = JSON.stringify(state.track, null, 2);
  setStatus("JSON da pista atualizado no textarea.", "success");
}

function loadBestBrainJson(brainData) {
  if (!brainData || !brainData.weights || !brainData.netConfig) {
    throw new Error("JSON da rede inválido.");
  }
  state.sim.seedBrainData = brainData;
  state.ui.bestBrainJson.value = JSON.stringify(brainData, null, 2);
  if (brainData.netConfig.sensorAnglesDeg) {
    state.ui.hiddenLayers.value = brainData.netConfig.hiddenLayers;
    state.ui.neuronsPerLayer.value = brainData.netConfig.neuronsPerLayer;
    state.ui.activation.value = brainData.netConfig.activation;
    state.ui.sensorCount.value = brainData.netConfig.sensorAnglesDeg.length;
    state.ui.sensorAngles.value = brainData.netConfig.sensorAnglesDeg.join(",");
  }
  setStatus("Melhor rede carregada como semente para a próxima população.", "success");
}

function currentEditablePoints() {
  if (state.editor.mode === "outer") return state.track.outer;
  if (state.editor.mode === "inner") return state.track.inner;
  return null;
}

function nearestVertexIndex(points, x, y, threshold = 16) {
  let best = -1;
  let bestDist = threshold * threshold;
  for (let i = 0; i < points.length; i++) {
    const dx = points[i].x - x;
    const dy = points[i].y - y;
    const d = dx * dx + dy * dy;
    if (d <= bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

function nearestSegmentIndex(points, point) {
  if (points.length < 2) return Math.max(points.length - 1, 0);
  let bestIndex = 0;
  let bestDist = Infinity;
  for (let i = 0; i < points.length; i++) {
    const seg = distancePointToSegment(point, points[i], points[(i + 1) % points.length]);
    if (seg.distance < bestDist) {
      bestDist = seg.distance;
      bestIndex = i;
    }
  }
  return bestIndex;
}

function markTrackAsCustom() {
  if (!state.track) return;
  const baseName = state.track.name || "Pista personalizada";
  if (state.track.presetId) {
    state.track.name = /\(editada\)$/.test(baseName) ? baseName : `${baseName} (editada)`;
  } else if (!state.track.name) {
    state.track.name = "Pista personalizada";
  }
  state.track.presetId = "";
}

// Recalcula a geometria derivada sempre que a pista muda.
function refreshTrackGeometry(markAsCustom = false) {
  profilerMeasure("track.refreshGeometry", () => {
    if (markAsCustom) {
      markTrackAsCustom();
    }
    state.trackGeom = buildTrackGeometry(state.track);
    if (state.ui.defaultTrackSelect) {
      syncDefaultTrackPresetSelection(state.track.presetId);
    }
    state.ui.trackJson.value = JSON.stringify(state.track, null, 2);
  });
}

function insideCanvas(mx, my) {
  return mx >= 0 && my >= 0 && mx <= width && my <= height;
}

// p5 mousePressed: ou edita a pista, ou fixa a inspeção, ou inicia pan.
function mousePressed() {
  if (!state.canvasReady || !insideCanvas(mouseX, mouseY)) return true;
  if (shouldStartPanFromMouse()) {
    beginCanvasPan(mouseX, mouseY);
    return false;
  }
  if (!isEditorEnabled()) {
    if (mouseButton === LEFT) {
      const hoveredVehicle = hoveredVehicleCurrentFrame();
      if (hoveredVehicle) {
        pinVehiclePanel(hoveredVehicle, mouseX, mouseY);
      } else if (state.inspect.pinnedVehicle) {
        closePinnedVehiclePanel();
      }
    }
    return false;
  }
  if (state.sim.running && !state.sim.paused) return false;

  const worldMouse = screenToWorldPoint(mouseX, mouseY);

  if (state.editor.mode === "start") {
    pushTrackUndoSnapshot();
    state.editor.draggingStart = true;
    state.track.start.x = worldMouse.x;
    state.track.start.y = worldMouse.y;
    refreshTrackGeometry(true);
    return false;
  }

  const points = currentEditablePoints();
  if (!points) return false;
  const hitThreshold = 16 / state.view.zoom;

  if (mouseButton === RIGHT) {
    const idx = nearestVertexIndex(points, worldMouse.x, worldMouse.y, hitThreshold);
    if (idx >= 0 && points.length > 3) {
      pushTrackUndoSnapshot();
      points.splice(idx, 1);
      refreshTrackGeometry(true);
    }
    return false;
  }

  const vertexIdx = nearestVertexIndex(points, worldMouse.x, worldMouse.y, hitThreshold);
  pushTrackUndoSnapshot();
  if (vertexIdx >= 0) {
    state.editor.dragging = { collection: state.editor.mode, index: vertexIdx };
  } else if (points.length < 2) {
    points.push({ x: worldMouse.x, y: worldMouse.y });
    state.editor.dragging = { collection: state.editor.mode, index: points.length - 1 };
  } else {
    const insertAfter = nearestSegmentIndex(points, worldMouse);
    points.splice(insertAfter + 1, 0, { x: worldMouse.x, y: worldMouse.y });
    state.editor.dragging = { collection: state.editor.mode, index: insertAfter + 1 };
  }
  refreshTrackGeometry(true);
  return false;
}

function mouseDragged() {
  if (!state.canvasReady) return true;
  if (state.view.isPanning) {
    updateCanvasPan(mouseX, mouseY);
    return false;
  }
  if (!insideCanvas(mouseX, mouseY)) return true;
  if (state.sim.running && !state.sim.paused) return false;

  const worldMouse = screenToWorldPoint(mouseX, mouseY);

  if (state.editor.draggingStart) {
    state.track.start.angle = Math.atan2(worldMouse.y - state.track.start.y, worldMouse.x - state.track.start.x);
    refreshTrackGeometry(true);
    return false;
  }

  if (!state.editor.dragging) return true;
  const points = state.editor.dragging.collection === "outer" ? state.track.outer : state.track.inner;
  const point = points[state.editor.dragging.index];
  if (!point) return true;
  point.x = worldMouse.x;
  point.y = worldMouse.y;
  refreshTrackGeometry(true);
  return false;
}

function mouseReleased() {
  if (state.view.isPanning) {
    endCanvasPan();
    return false;
  }
  if (!state.canvasReady || !insideCanvas(mouseX, mouseY)) {
    state.editor.dragging = null;
    state.editor.draggingStart = false;
    return true;
  }
  const worldMouse = screenToWorldPoint(mouseX, mouseY);
  if (state.editor.draggingStart) {
    state.track.start.angle = Math.atan2(worldMouse.y - state.track.start.y, worldMouse.x - state.track.start.x);
    refreshTrackGeometry(true);
  }
  state.editor.dragging = null;
  state.editor.draggingStart = false;
  return false;
}

function mouseWheel(event) {
  if (!state.canvasReady || !insideCanvas(mouseX, mouseY)) return true;
  if (
    state.ui.vehicleHoverBox &&
    !state.ui.vehicleHoverBox.classList.contains("d-none") &&
    state.inspect.hoverBoxHovered
  ) {
    return true;
  }
  const factor = Math.exp(-event.deltaY * VIEWPORT.wheelZoomSpeed);
  zoomAroundScreenPoint(state.view.zoom * factor, mouseX, mouseY);
  return false;
}

function touchStarted() {
  if (!state.canvasReady) return true;
  if (touches.length === 2) {
    const [a, b] = touches;
    if (!insideCanvas(a.x, a.y) && !insideCanvas(b.x, b.y)) return true;
    state.view.pinchActive = true;
    state.view.pinchDistance = touchDistance(a, b);
    state.view.pinchCenter = touchCenter(a, b);
    state.editor.dragging = null;
    state.editor.draggingStart = false;
    return false;
  }
  return true;
}

function touchMoved() {
  if (!state.canvasReady) return true;
  if (state.view.pinchActive && touches.length === 2) {
    const [a, b] = touches;
    const nextCenter = touchCenter(a, b);
    const nextDistance = touchDistance(a, b);
    if (state.view.pinchCenter) {
      panViewByScreenDelta(
        nextCenter.x - state.view.pinchCenter.x,
        nextCenter.y - state.view.pinchCenter.y
      );
    }
    if (state.view.pinchDistance > 0 && nextDistance > 0) {
      const ratio = nextDistance / state.view.pinchDistance;
      zoomAroundScreenPoint(state.view.zoom * ratio, nextCenter.x, nextCenter.y);
    }
    state.view.pinchCenter = nextCenter;
    state.view.pinchDistance = nextDistance;
    return false;
  }
  return true;
}

function touchEnded() {
  state.view.pinchActive = false;
  state.view.pinchDistance = 0;
  state.view.pinchCenter = null;
  return true;
}
