// Configurações globais, estado compartilhado e utilitários básicos.
const STORAGE_KEYS = {
  track: "ga-track-v1",
  bestBrain: "ga-best-brain-v1"
};

const PHYSICS = {
  maxSpeed: 220,
  maxReverseSpeed: 50,
  maxAccel: 90,
  friction: 0.42,
  maxTurnRate: Math.PI * 1.15,
  wheelBase: 26,
  minTurningSpeed: 6,
  steeringReferenceSpeed: 120,
  inputSpeedReference: 220,
  fuelSpeedReference: 220,
  lowSpeedSteerAngle: Math.PI * 0.24,
  highSpeedSteerAngle: Math.PI * 0.05,
  lowSpeedLateralGrip: 12,
  highSpeedLateralGrip: 3.4,
  driftGripPenalty: 0.78,
  sensorRange: 300,
  carRadius: 8,
  stallSeconds: 2.8,
  progressTimeout: 4.2,
  maxFuel: 100,
  fuelBaseBurn: 0.42,
  fuelSpeedBurn: 1.15,
  fuelAccelBurn: 1.45
};

const UI_INTERACTION = {
  vehicleHoverRadius: 22
};

const VIEWPORT = {
  minZoom: 0.25,
  maxZoom: 4.5,
  wheelZoomSpeed: 0.0015
};

const SIMULATION_MODES = {
  realtime: "realtime",
  event: "event"
};

const HISTORY_LIMIT = 250;
const DEFAULT_TRACK_PRESET_ID = "barcelona-catalunya";
const TFJS_CDN_URL = new URL("../../shared/libs/tf.min.js", window.location.href).href;
const INFERENCE_WORKER_SCRIPT_URL = "src/js/sim/inference-worker.js";
const INFERENCE_MAX_WORKERS = 4;
const INFERENCE_INIT_TIMEOUT_MS = 3500;
const INFERENCE_RETRY_COOLDOWN_MS = 5000;
const REALTIME_MAX_CATCHUP_SECONDS = 0.75;

// Estado central da aplicação. Os outros módulos leem e alteram estes dados.
const state = {
  track: null,
  trackGeom: null,
  sim: {
    running: false,
    paused: false,
    mode: SIMULATION_MODES.realtime,
    generation: 0,
    populationVersion: 0,
    elapsed: 0,
    lastWallClockMs: 0,
    backgroundWorker: null,
    backgroundIntervalId: null,
    fastLoopScheduled: false,
    fastLoopRunning: false,
    realtimeAdvanceRunning: false,
    queuedRealtimeTickNowMs: 0,
    avgStepWallMs: 0,
    lastStepWallMs: 0,
    avgObservedStepsPerSecond: 0,
    lastObservedStepsPerSecond: 0,
    cadenceWindowStartedAtMs: 0,
    cadenceWindowSteps: 0,
    vehicles: [],
    lastSummary: null,
    history: [],
    lastGenerationSnapshot: null,
    bestStopMarker: null,
    bestEverFitness: 0,
    bestBrainData: null,
    seedBrainData: null,
    signature: "",
    architectureChangedNotice: false,
    inference: {
      available: false,
      failed: false,
      hardDisabled: false,
      initializing: false,
      initPromise: null,
      workers: [],
      workerCount: 0,
      syncedPopulationKey: "",
      lastError: "",
      retryAfterMs: 0
    }
  },
  editor: {
    enabled: true,
    mode: "outer",
    dragging: null,
    draggingStart: false,
    undoStack: [],
    undoLimit: 120
  },
  inspect: {
    pinnedVehicle: null,
    lastHoverVehicle: null,
    lastHoverSeenAtMs: 0,
    panelAnchor: null,
    hoverBoxHovered: false
  },
  input: {
    spacePressed: false,
    shiftPressed: false
  },
  view: {
    zoom: 1,
    panX: 0,
    panY: 0,
    followLeader: false,
    isPanning: false,
    panLastScreen: null,
    pinchActive: false,
    pinchDistance: 0,
    pinchCenter: null
  },
  profiler: {
    enabled: true,
    current: null,
    recent: [],
    maxRecent: 40,
    lastSummary: null
  },
  ui: {},
  canvasReady: false,
  renderEnabled: true,
  renderFps: 0
};

function $(id) {
  return document.getElementById(id);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function normalizeAngle(angle) {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function signedAngleDiff(target, current) {
  return normalizeAngle(target - current);
}

function polygonArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area * 0.5;
}

function clonePoint(point) {
  return { x: point.x, y: point.y };
}

function clonePoints(points) {
  return points.map(clonePoint);
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function currentViewTransform() {
  return state.view;
}

// Converte coordenadas da tela para o espaço do mundo desenhado no canvas.
function screenToWorldPoint(x, y) {
  const view = currentViewTransform();
  return {
    x: (x - view.panX) / view.zoom,
    y: (y - view.panY) / view.zoom
  };
}

function worldToScreenPoint(x, y) {
  const view = currentViewTransform();
  return {
    x: x * view.zoom + view.panX,
    y: y * view.zoom + view.panY
  };
}

// Mantém o ponto sob o cursor parado enquanto o zoom muda.
function zoomAroundScreenPoint(nextZoom, screenX, screenY) {
  const view = currentViewTransform();
  const clampedZoom = clamp(nextZoom, VIEWPORT.minZoom, VIEWPORT.maxZoom);
  const worldAnchor = screenToWorldPoint(screenX, screenY);
  view.zoom = clampedZoom;
  view.panX = screenX - worldAnchor.x * view.zoom;
  view.panY = screenY - worldAnchor.y * view.zoom;
}

function panViewByScreenDelta(dx, dy) {
  const view = currentViewTransform();
  view.panX += dx;
  view.panY += dy;
}

function resetViewTransform() {
  state.view.zoom = 1;
  state.view.panX = 0;
  state.view.panY = 0;
  state.view.isPanning = false;
  state.view.panLastScreen = null;
  state.view.pinchActive = false;
  state.view.pinchDistance = 0;
  state.view.pinchCenter = null;
  syncCanvasInteractionClasses();
}

function setFollowLeaderEnabled(enabled) {
  state.view.followLeader = Boolean(enabled);
  if (state.ui.followLeaderToggle) {
    state.ui.followLeaderToggle.checked = state.view.followLeader;
  }
  if (state.view.followLeader) {
    state.view.isPanning = false;
    state.view.panLastScreen = null;
  }
  syncCanvasInteractionClasses();
}

// Sincroniza classes CSS para feedback visual de pan/grab.
function syncCanvasInteractionClasses() {
  if (!state.ui.canvasStage) return;
  const panMode = !state.view.followLeader && (state.input.spacePressed || state.input.shiftPressed || state.view.isPanning);
  state.ui.canvasStage.classList.toggle("canvas-pan-mode", panMode);
  state.ui.canvasStage.classList.toggle("canvas-panning", state.view.isPanning);
}

function isShiftPanPressed() {
  return state.input.shiftPressed || (typeof keyIsDown === "function" && keyIsDown(SHIFT));
}

function shouldStartPanFromMouse() {
  if (state.view.followLeader) return false;
  return mouseButton === CENTER || (mouseButton === LEFT && (state.input.spacePressed || isShiftPanPressed()));
}

function isEditorEnabled() {
  return state.editor.enabled;
}

function clearVehicleInspectionDebugSnapshot(vehicle) {
  if (!vehicle) return;
  vehicle.lastBrainInputs.length = 0;
  vehicle.lastBrainOutputs.length = 0;
  vehicle.weightSnapshotCache = "";
  vehicle.weightSnapshotAt = -Infinity;
}

function clearAllVehicleInspectionDebugSnapshots(exceptVehicle = null) {
  for (const vehicle of state.sim.vehicles) {
    if (vehicle === exceptVehicle) continue;
    clearVehicleInspectionDebugSnapshot(vehicle);
  }
}

// Só mantemos cópias de debug para o veículo que está sendo inspecionado agora.
function shouldCaptureVehicleInspectionDebug(vehicle) {
  if (!vehicle) return false;
  if (state.inspect.pinnedVehicle === vehicle) return true;
  if (!state.renderEnabled || isEditorEnabled()) return false;
  return state.inspect.lastHoverVehicle === vehicle;
}

function clearVehicleInspectionState() {
  state.inspect.pinnedVehicle = null;
  state.inspect.lastHoverVehicle = null;
  state.inspect.lastHoverSeenAtMs = 0;
  state.inspect.panelAnchor = null;
  state.inspect.hoverBoxHovered = false;
  clearAllVehicleInspectionDebugSnapshots();
  if (state.ui.vehicleHoverBox) {
    state.ui.vehicleHoverBox.classList.add("d-none");
    state.ui.vehicleHoverBox.classList.remove("vehicle-hover-interactive");
  }
}

function closePinnedVehiclePanel() {
  clearVehicleInspectionState();
}

function setMapEditorEnabled(enabled) {
  const pausedSimulation = enabled && state.sim.running && !state.sim.paused;
  state.editor.enabled = enabled;
  state.editor.dragging = null;
  state.editor.draggingStart = false;
  if (pausedSimulation) {
    state.sim.paused = true;
  }
  if (state.ui.mapEditorToggle) {
    state.ui.mapEditorToggle.checked = enabled;
  }
  if (state.ui.trackEditorControls) {
    state.ui.trackEditorControls.classList.toggle("d-none", !enabled);
  }
  if (enabled) {
    clearVehicleInspectionState();
  }
  return pausedSimulation;
}

function vehicleStillAvailable(vehicle) {
  return Boolean(vehicle) && state.sim.vehicles.includes(vehicle);
}

// Guarda qual veículo ficou fixado no painel de inspeção.
function pinVehiclePanel(vehicle, screenX = mouseX, screenY = mouseY) {
  if (!vehicleStillAvailable(vehicle)) return;
  state.inspect.pinnedVehicle = vehicle;
  state.inspect.lastHoverVehicle = vehicle;
  state.inspect.lastHoverSeenAtMs = performance.now();
  state.inspect.panelAnchor = { x: screenX, y: screenY };
  clearAllVehicleInspectionDebugSnapshots(vehicle);
}

function beginCanvasPan(screenX, screenY) {
  if (state.view.followLeader) return;
  state.view.isPanning = true;
  state.view.panLastScreen = { x: screenX, y: screenY };
  syncCanvasInteractionClasses();
}

function updateCanvasPan(screenX, screenY) {
  if (!state.view.isPanning || !state.view.panLastScreen) return;
  const dx = screenX - state.view.panLastScreen.x;
  const dy = screenY - state.view.panLastScreen.y;
  panViewByScreenDelta(dx, dy);
  state.view.panLastScreen = { x: screenX, y: screenY };
}

function endCanvasPan() {
  state.view.isPanning = false;
  state.view.panLastScreen = null;
  syncCanvasInteractionClasses();
}

function touchDistance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function touchCenter(a, b) {
  return {
    x: (a.x + b.x) * 0.5,
    y: (a.y + b.y) * 0.5
  };
}

function randomGaussian() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}
