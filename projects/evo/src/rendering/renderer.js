import { Camera2D } from "./camera-2d.js";
import { createBeingStatusBarModel } from "./being-status-bars.js";
import { pickEntityAt } from "./entity-selection.js";
import { normalizeFollowTarget, resolveFollowedBeing } from "./follow-target.js";
import { NOOP_PERFORMANCE_PROFILER } from "../debug/performance-profiler.js";

const WATER_COLOR = [18, 55, 74];
const LOW_PRODUCTIVITY_COLOR = [170, 132, 70];
const HIGH_PRODUCTIVITY_COLOR = [62, 139, 81];
const FOOD_COLOR = [241, 201, 121];
const FOOD_OUTLINE_COLOR = [61, 42, 19];
const LOW_LIFE_COLOR = [211, 91, 78];
const HIGH_LIFE_COLOR = [91, 220, 177];
const BEING_OUTLINE_COLOR = [18, 29, 24];
const BEST_BEING_COLOR = [250, 210, 105];
const SELECTED_BEING_COLOR = [238, 248, 242];
const SELECTED_FOOD_COLOR = [255, 255, 255];
const FOOD_SENSOR_COLOR = [255, 213, 112];
const BOUNDARY_SENSOR_COLOR = [100, 211, 255];

function interpolateColor(start, end, amount) {
  return start.map((component, index) => Math.round(
    component + ((end[index] - component) * amount),
  ));
}

function midpoint(first, second) {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  };
}

function distance(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

export class Renderer {
  #instance;
  #config;
  #onFrame;
  #onSelectionChange;
  #onFollowChange;
  #onCameraChange;
  #camera;
  #profiler;
  #cachedMapSnapshot = null;
  #mapLayer = null;
  #lastSnapshot = null;
  #selection = null;
  #followTarget = null;
  #canvasElement = null;
  #eventAbortController = new AbortController();
  #pointers = new Map();
  #primaryPointerId = null;
  #pointerStart = null;
  #lastPointer = null;
  #didPan = false;
  #pinchDistance = null;
  #pinchMidpoint = null;

  constructor({
    p5Constructor,
    container,
    config,
    onFrame,
    onSelectionChange,
    onFollowChange = () => {},
    onCameraChange = () => {},
    profiler = NOOP_PERFORMANCE_PROFILER,
  }) {
    if (typeof p5Constructor !== "function") {
      throw new TypeError("Renderer exige o construtor do p5.js.");
    }
    if (!(container instanceof HTMLElement)) {
      throw new TypeError("Renderer exige um container HTML.");
    }
    if (typeof onFrame !== "function") {
      throw new TypeError("Renderer exige um callback onFrame.");
    }
    if (typeof onSelectionChange !== "function") {
      throw new TypeError("Renderer exige um callback onSelectionChange.");
    }
    if (typeof onFollowChange !== "function") {
      throw new TypeError("Renderer exige um callback onFollowChange válido.");
    }
    if (typeof onCameraChange !== "function") {
      throw new TypeError("Renderer exige um callback onCameraChange válido.");
    }

    this.#config = config;
    this.#onFrame = onFrame;
    this.#onSelectionChange = onSelectionChange;
    this.#onFollowChange = onFollowChange;
    this.#onCameraChange = onCameraChange;
    this.#profiler = profiler;
    this.#camera = new Camera2D({
      worldWidth: config.derived.worldWidthPx,
      worldHeight: config.derived.worldHeightPx,
      viewportWidth: config.derived.worldWidthPx,
      viewportHeight: config.derived.worldHeightPx,
      minZoom: config.camera.minZoom,
      maxZoom: config.camera.maxZoom,
    });
    this.#instance = new p5Constructor((p5) => {
      p5.setup = () => this.#setup(p5, container);
      p5.draw = () => this.#draw(p5);
    }, container);
  }

  setConfig(config) {
    if (!config || !config.eyes || !config.network || !config.camera) {
      throw new TypeError("A configuração do renderer é inválida.");
    }
    this.#config = config;
  }

  setSelection(selection) {
    if (selection !== null
      && (!selection || !["being", "food"].includes(selection.type)
        || !Number.isSafeInteger(selection.id) || selection.id <= 0)) {
      throw new TypeError("A seleção deve identificar uma entidade válida ou ser nula.");
    }
    this.#selection = selection === null
      ? null
      : Object.freeze({ type: selection.type, id: selection.id });
  }

  setFollowTarget(target) {
    const normalized = normalizeFollowTarget(target);
    if (this.#followTarget?.mode === normalized?.mode
      && this.#followTarget?.id === normalized?.id) {
      return;
    }
    this.#followTarget = normalized;
    this.#onFollowChange(normalized);
  }

  getFollowTarget() {
    return this.#followTarget;
  }

  zoomIn() {
    const camera = this.#camera.getSnapshot();
    this.#zoomAtCenter(camera.zoom * this.#config.camera.buttonZoomFactor);
  }

  zoomOut() {
    const camera = this.#camera.getSnapshot();
    this.#zoomAtCenter(camera.zoom / this.#config.camera.buttonZoomFactor);
  }

  resetCamera() {
    this.setFollowTarget(null);
    this.#notifyCamera(this.#camera.reset());
  }

  getCameraSnapshot() {
    return this.#camera.getSnapshot();
  }

  destroy() {
    this.#eventAbortController.abort();
    this.#mapLayer?.remove();
    this.#instance.remove();
  }

  #setup(p5, container) {
    p5.pixelDensity(1);
    const canvas = p5.createCanvas(
      this.#config.derived.worldWidthPx,
      this.#config.derived.worldHeightPx,
    );
    canvas.parent(container);
    canvas.elt.setAttribute(
      "aria-label",
      "Simulação determinística do arquipélago; a terra representa produtividade, círculos amarelos representam comida, círculos coloridos representam seres e as barras verde e amarela indicam vida e energia.",
    );
    this.#canvasElement = canvas.elt;
    this.#installCameraEvents();
    this.#notifyCamera(this.#camera.getSnapshot());
  }

  #draw(p5) {
    return this.#profiler.measure("frame.draw", () => {
      const snapshot = this.#profiler.measure(
        "frame.update",
        () => this.#onFrame(p5.deltaTime),
      );
      this.#lastSnapshot = snapshot;
      this.#profiler.measure(
        "render.interaction",
        () => this.#reconcileInteraction(snapshot),
      );

      if (snapshot.map !== this.#cachedMapSnapshot) {
        this.#profiler.measure(
          "render.map-cache",
          () => this.#cacheMapLayer(p5, snapshot.map),
        );
      }

      this.#profiler.measure(
        "render.follow-camera",
        () => this.#updateFollowing(snapshot),
      );
      const camera = this.#camera.getSnapshot();
      this.#profiler.measure("render.background-map", () => {
        p5.background(...WATER_COLOR);
        p5.push();
        p5.translate(camera.offsetX, camera.offsetY);
        p5.scale(camera.zoom);
        p5.image(this.#mapLayer, 0, 0);
      });
      this.#profiler.measure(
        "render.sensors",
        () => this.#drawSensors(p5, snapshot, camera.zoom),
      );
      this.#profiler.measure(
        "render.foods",
        () => this.#drawFoods(p5, snapshot, camera.zoom),
      );
      this.#profiler.measure(
        "render.beings",
        () => this.#drawBeings(p5, snapshot, camera.zoom),
      );
      p5.pop();
    });
  }

  #drawSensors(p5, snapshot, cameraZoom) {
    const visibleIds = new Set([
      snapshot.population.bestAliveBeingId,
      this.#selection?.type === "being" ? this.#selection.id : null,
    ]);
    const foodById = new Map(snapshot.foods.map((food) => [food.id, food]));
    const tileSize = snapshot.map.tileSizePx;
    const rangePx = this.#config.eyes.rangeTiles * tileSize;

    for (const being of snapshot.beings) {
      if (!being.alive || !visibleIds.has(being.id) || being.eyes.length === 0) {
        continue;
      }
      const centerX = being.x * tileSize;
      const centerY = being.y * tileSize;
      const isSelected = this.#selection?.type === "being"
        && this.#selection.id === being.id;
      p5.push();
      p5.noFill();

      for (const eye of being.eyes) {
        const angle = being.directionRadians + eye.angleOffsetRadians;
        const boundaryLength = eye.boundaryDistanceTiles === null
          ? rangePx
          : eye.boundaryDistanceTiles * tileSize;
        p5.stroke(
          ...BOUNDARY_SENSOR_COLOR,
          eye.boundaryDistanceTiles === null ? (isSelected ? 110 : 72) : 210,
        );
        p5.strokeWeight((isSelected ? 1.7 : 1.4) / cameraZoom);
        p5.line(
          centerX,
          centerY,
          centerX + (Math.cos(angle) * boundaryLength),
          centerY + (Math.sin(angle) * boundaryLength),
        );
        if (eye.boundaryDistanceTiles !== null) {
          p5.fill(...BOUNDARY_SENSOR_COLOR, 210);
          p5.noStroke();
          p5.circle(
            centerX + (Math.cos(angle) * boundaryLength),
            centerY + (Math.sin(angle) * boundaryLength),
            4 / cameraZoom,
          );
          p5.noFill();
        }

        const food = foodById.get(eye.detectedFoodId);
        if (food) {
          p5.stroke(...FOOD_SENSOR_COLOR, 210);
          p5.strokeWeight(1.8 / cameraZoom);
          p5.line(
            centerX,
            centerY,
            (food.column + 0.5) * tileSize,
            (food.row + 0.5) * tileSize,
          );
        }
      }
      p5.pop();
    }
  }

  #drawBeings(p5, snapshot, cameraZoom) {
    const diameter = snapshot.map.tileSizePx * 0.7;
    const radius = diameter / 2;

    for (const being of snapshot.beings) {
      if (!being.alive) {
        continue;
      }
      const lifeRatio = Math.max(0, Math.min(1, being.life / this.#config.being.maxLife));
      const color = interpolateColor(LOW_LIFE_COLOR, HIGH_LIFE_COLOR, lifeRatio);
      p5.push();
      if (this.#selection?.type === "being" && being.id === this.#selection.id) {
        p5.stroke(...SELECTED_BEING_COLOR);
        p5.strokeWeight(4 / cameraZoom);
      } else if (being.id === snapshot.population.bestAliveBeingId) {
        p5.stroke(...BEST_BEING_COLOR);
        p5.strokeWeight(3 / cameraZoom);
      } else {
        p5.stroke(...BEING_OUTLINE_COLOR);
        p5.strokeWeight(1.5 / cameraZoom);
      }
      p5.fill(...color);
      const centerX = being.x * snapshot.map.tileSizePx;
      const centerY = being.y * snapshot.map.tileSizePx;
      p5.circle(centerX, centerY, diameter);
      p5.stroke(...BEING_OUTLINE_COLOR);
      p5.strokeWeight(1.5 / cameraZoom);
      p5.line(
        centerX,
        centerY,
        centerX + (Math.cos(being.directionRadians) * radius * 0.78),
        centerY + (Math.sin(being.directionRadians) * radius * 0.78),
      );
      p5.fill(...SELECTED_BEING_COLOR);
      p5.stroke(...BEING_OUTLINE_COLOR);
      p5.strokeWeight(1 / cameraZoom);
      p5.circle(centerX, centerY, diameter * 0.32);
      p5.noStroke();
      p5.fill(...(being.underBodyEye?.terrainType === "water"
        ? BOUNDARY_SENSOR_COLOR
        : BEING_OUTLINE_COLOR));
      p5.circle(centerX, centerY, diameter * 0.15);
      p5.pop();
    }

    for (const being of snapshot.beings) {
      const model = createBeingStatusBarModel({
        being,
        tileSizePx: snapshot.map.tileSizePx,
        worldHeightPx: snapshot.map.heightPx,
        maxLife: this.#config.being.maxLife,
        maxEnergy: this.#config.being.maxEnergy,
      });
      if (model === null) {
        continue;
      }
      p5.push();
      for (const bar of model.bars) {
        p5.noStroke();
        p5.fill(...model.trackColor);
        p5.rect(bar.x, bar.y, bar.width, bar.height);
        if (bar.ratio > 0) {
          p5.fill(...bar.color);
          p5.rect(bar.x, bar.y, bar.width * bar.ratio, bar.height);
        }
        p5.noFill();
        p5.stroke(...model.outlineColor);
        p5.strokeWeight(0.75 / cameraZoom);
        p5.rect(bar.x, bar.y, bar.width, bar.height);
      }
      p5.pop();
    }
  }

  #drawFoods(p5, snapshot, cameraZoom) {
    p5.push();
    p5.fill(...FOOD_COLOR);

    for (const food of snapshot.foods) {
      const energyRatio = Math.max(
        0,
        Math.min(1, food.remainingEnergy / food.initialEnergy),
      );
      const diameter = snapshot.map.tileSizePx * (0.25 + (0.55 * energyRatio));
      if (this.#selection?.type === "food" && food.id === this.#selection.id) {
        p5.stroke(...SELECTED_FOOD_COLOR);
        p5.strokeWeight(4 / cameraZoom);
      } else {
        p5.stroke(...FOOD_OUTLINE_COLOR);
        p5.strokeWeight(1.5 / cameraZoom);
      }
      p5.circle(
        (food.column + 0.5) * snapshot.map.tileSizePx,
        (food.row + 0.5) * snapshot.map.tileSizePx,
        diameter,
      );
    }

    p5.pop();
  }

  #cacheMapLayer(p5, mapSnapshot) {
    this.#mapLayer?.remove();
    const layer = p5.createGraphics(mapSnapshot.widthPx, mapSnapshot.heightPx);
    layer.pixelDensity(1);
    layer.noStroke();

    for (const tile of mapSnapshot.tiles) {
      const color = tile.type === "water"
        ? WATER_COLOR
        : interpolateColor(
          LOW_PRODUCTIVITY_COLOR,
          HIGH_PRODUCTIVITY_COLOR,
          tile.productivity,
        );
      layer.fill(...color);
      layer.rect(
        tile.column * mapSnapshot.tileSizePx,
        tile.row * mapSnapshot.tileSizePx,
        mapSnapshot.tileSizePx,
        mapSnapshot.tileSizePx,
      );
    }

    layer.stroke(232, 239, 233, 22);
    layer.strokeWeight(1);
    for (let column = 0; column <= mapSnapshot.columns; column += 1) {
      const x = column * mapSnapshot.tileSizePx;
      layer.line(x, 0, x, mapSnapshot.heightPx);
    }
    for (let row = 0; row <= mapSnapshot.rows; row += 1) {
      const y = row * mapSnapshot.tileSizePx;
      layer.line(0, y, mapSnapshot.widthPx, y);
    }

    this.#cachedMapSnapshot = mapSnapshot;
    this.#mapLayer = layer;
  }

  #installCameraEvents() {
    const options = { signal: this.#eventAbortController.signal };
    this.#canvasElement.addEventListener("wheel", (event) => {
      event.preventDefault();
      const point = this.#eventToLogicalPoint(event);
      const current = this.#camera.getSnapshot();
      const normalizedDelta = Math.max(-1_000, Math.min(1_000, event.deltaY));
      const factor = Math.exp(-normalizedDelta * this.#config.camera.wheelSensitivity);
      this.#notifyCamera(this.#camera.zoomAt(point.x, point.y, current.zoom * factor));
    }, { ...options, passive: false });
    this.#canvasElement.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }
      event.preventDefault();
      this.#canvasElement.setPointerCapture(event.pointerId);
      const point = this.#eventToLogicalPoint(event);
      this.#pointers.set(event.pointerId, point);
      if (this.#pointers.size === 1) {
        this.#primaryPointerId = event.pointerId;
        this.#pointerStart = { clientX: event.clientX, clientY: event.clientY };
        this.#lastPointer = point;
        this.#didPan = false;
      } else if (this.#pointers.size === 2) {
        const [first, second] = [...this.#pointers.values()];
        this.#pinchDistance = distance(first, second);
        this.#pinchMidpoint = midpoint(first, second);
        this.#didPan = true;
      }
      this.#canvasElement.classList.add("is-grabbing");
    }, options);
    this.#canvasElement.addEventListener("pointermove", (event) => {
      if (!this.#pointers.has(event.pointerId)) {
        return;
      }
      event.preventDefault();
      const point = this.#eventToLogicalPoint(event);
      this.#pointers.set(event.pointerId, point);
      if (this.#pointers.size >= 2) {
        this.setFollowTarget(null);
        const [first, second] = [...this.#pointers.values()];
        const nextDistance = distance(first, second);
        const nextMidpoint = midpoint(first, second);
        if (this.#pinchDistance > 0) {
          this.#camera.panBy(
            nextMidpoint.x - this.#pinchMidpoint.x,
            nextMidpoint.y - this.#pinchMidpoint.y,
          );
          const current = this.#camera.getSnapshot();
          this.#camera.zoomAt(
            nextMidpoint.x,
            nextMidpoint.y,
            current.zoom * (nextDistance / this.#pinchDistance),
          );
          this.#notifyCamera(this.#camera.getSnapshot());
        }
        this.#pinchDistance = nextDistance;
        this.#pinchMidpoint = nextMidpoint;
        this.#didPan = true;
        return;
      }

      if (event.pointerId === this.#primaryPointerId && this.#lastPointer !== null) {
        if (this.#pointerStart !== null) {
          const cssDistance = Math.hypot(
            event.clientX - this.#pointerStart.clientX,
            event.clientY - this.#pointerStart.clientY,
          );
          if (cssDistance > this.#config.camera.dragThresholdCssPx) {
            this.#didPan = true;
            this.setFollowTarget(null);
          }
        }
        if (this.#didPan) {
          this.#notifyCamera(this.#camera.panBy(
            point.x - this.#lastPointer.x,
            point.y - this.#lastPointer.y,
          ));
        }
        this.#lastPointer = point;
      }
    }, options);

    const finishPointer = (event, cancelled) => {
      if (!this.#pointers.has(event.pointerId)) {
        return;
      }
      const point = this.#eventToLogicalPoint(event);
      const wasSingleClick = !cancelled
        && this.#pointers.size === 1
        && event.pointerId === this.#primaryPointerId
        && !this.#didPan;
      this.#pointers.delete(event.pointerId);
      if (wasSingleClick) {
        this.#selectEntityAt(point.x, point.y);
      }

      if (this.#pointers.size === 1) {
        const [remainingId, remainingPoint] = [...this.#pointers.entries()][0];
        this.#primaryPointerId = remainingId;
        this.#pointerStart = null;
        this.#lastPointer = remainingPoint;
        this.#didPan = true;
      } else if (this.#pointers.size === 0) {
        this.#primaryPointerId = null;
        this.#pointerStart = null;
        this.#lastPointer = null;
        this.#didPan = false;
        this.#canvasElement.classList.remove("is-grabbing");
      }
      this.#pinchDistance = null;
      this.#pinchMidpoint = null;
    };
    this.#canvasElement.addEventListener("pointerup", (event) => finishPointer(event, false), options);
    this.#canvasElement.addEventListener("pointercancel", (event) => finishPointer(event, true), options);
  }

  #eventToLogicalPoint(event) {
    const rect = this.#canvasElement.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (this.#instance.width / rect.width),
      y: (event.clientY - rect.top) * (this.#instance.height / rect.height),
    };
  }

  #selectEntityAt(screenX, screenY) {
    this.#profiler.measure("events.selection", () => {
      if (this.#lastSnapshot === null) {
        return;
      }
      const world = this.#camera.screenToWorld(screenX, screenY);
      const selection = pickEntityAt({
        snapshot: this.#lastSnapshot,
        worldX: world.x,
        worldY: world.y,
      });
      if (this.#followTarget !== null) {
        this.setFollowTarget(selection?.type === "being"
          ? { mode: "being", id: selection.id }
          : null);
      }
      this.setSelection(selection);
      this.#onSelectionChange(this.#selection);
    });
  }

  #reconcileInteraction(snapshot) {
    if (this.#selection?.type === "food"
      && !snapshot.foods.some(({ id }) => id === this.#selection.id)) {
      this.setSelection(null);
      this.#onSelectionChange(null);
    }
    if (this.#selection?.type === "being"
      && !snapshot.beings.some(({ id }) => id === this.#selection.id)) {
      this.setSelection(null);
      this.#onSelectionChange(null);
    }
    if (this.#followTarget?.mode === "being"
      && resolveFollowedBeing(snapshot, this.#followTarget) === null) {
      this.setFollowTarget(null);
    }
  }

  #updateFollowing(snapshot) {
    if (this.#followTarget === null) {
      return;
    }
    const being = resolveFollowedBeing(snapshot, this.#followTarget);
    if (!being) {
      if (this.#followTarget.mode === "being") {
        this.setFollowTarget(null);
      }
      return;
    }
    if (this.#followTarget.mode === "best-alive"
      && (this.#selection?.type !== "being" || this.#selection.id !== being.id)) {
      this.setSelection({ type: "being", id: being.id });
      this.#onSelectionChange(this.#selection);
    }
    const before = this.#camera.getSnapshot();
    const after = this.#camera.centerOn(
      being.x * snapshot.map.tileSizePx,
      being.y * snapshot.map.tileSizePx,
    );
    if (after.offsetX !== before.offsetX || after.offsetY !== before.offsetY) {
      this.#notifyCamera(after);
    }
  }

  #zoomAtCenter(zoom) {
    this.#notifyCamera(this.#camera.zoomAt(
      this.#config.derived.worldWidthPx / 2,
      this.#config.derived.worldHeightPx / 2,
      zoom,
    ));
  }

  #notifyCamera(snapshot) {
    this.#profiler.measure("events.camera", () => this.#onCameraChange(snapshot));
  }
}
