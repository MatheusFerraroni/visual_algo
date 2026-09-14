function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function assertFinitePoint(x, y, label) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new TypeError(`${label} exige coordenadas finitas.`);
  }
}

export class Camera2D {
  #worldWidth;
  #worldHeight;
  #viewportWidth;
  #viewportHeight;
  #minZoom;
  #maxZoom;
  #zoom;
  #offsetX = 0;
  #offsetY = 0;
  #snapshot = null;

  constructor({
    worldWidth,
    worldHeight,
    viewportWidth = worldWidth,
    viewportHeight = worldHeight,
    minZoom = 1,
    maxZoom = 8,
  }) {
    for (const [label, value] of Object.entries({
      worldWidth,
      worldHeight,
      viewportWidth,
      viewportHeight,
      minZoom,
      maxZoom,
    })) {
      if (!Number.isFinite(value) || value <= 0) {
        throw new RangeError(`${label} deve ser um número finito positivo.`);
      }
    }
    if (maxZoom <= minZoom) {
      throw new RangeError("O zoom máximo deve ser maior que o mínimo.");
    }
    this.#worldWidth = worldWidth;
    this.#worldHeight = worldHeight;
    this.#viewportWidth = viewportWidth;
    this.#viewportHeight = viewportHeight;
    this.#minZoom = minZoom;
    this.#maxZoom = maxZoom;
    this.#zoom = minZoom;
    this.#clampOffsets();
  }

  worldToScreen(x, y) {
    assertFinitePoint(x, y, "A projeção para a tela");
    return Object.freeze({
      x: (x * this.#zoom) + this.#offsetX,
      y: (y * this.#zoom) + this.#offsetY,
    });
  }

  screenToWorld(x, y) {
    assertFinitePoint(x, y, "A projeção para o mundo");
    return Object.freeze({
      x: (x - this.#offsetX) / this.#zoom,
      y: (y - this.#offsetY) / this.#zoom,
    });
  }

  zoomAt(screenX, screenY, requestedZoom) {
    assertFinitePoint(screenX, screenY, "O zoom ancorado");
    if (!Number.isFinite(requestedZoom) || requestedZoom <= 0) {
      throw new RangeError("O zoom solicitado deve ser finito e positivo.");
    }
    const worldAnchor = this.screenToWorld(screenX, screenY);
    this.#zoom = clamp(requestedZoom, this.#minZoom, this.#maxZoom);
    this.#offsetX = screenX - (worldAnchor.x * this.#zoom);
    this.#offsetY = screenY - (worldAnchor.y * this.#zoom);
    this.#clampOffsets();
    this.#snapshot = null;
    return this.getSnapshot();
  }

  panBy(deltaX, deltaY) {
    assertFinitePoint(deltaX, deltaY, "O deslocamento da câmera");
    this.#offsetX += deltaX;
    this.#offsetY += deltaY;
    this.#clampOffsets();
    this.#snapshot = null;
    return this.getSnapshot();
  }

  centerOn(worldX, worldY) {
    assertFinitePoint(worldX, worldY, "A centralização da câmera");
    this.#offsetX = (this.#viewportWidth / 2) - (worldX * this.#zoom);
    this.#offsetY = (this.#viewportHeight / 2) - (worldY * this.#zoom);
    this.#clampOffsets();
    this.#snapshot = null;
    return this.getSnapshot();
  }

  reset() {
    this.#zoom = this.#minZoom;
    this.#offsetX = 0;
    this.#offsetY = 0;
    this.#clampOffsets();
    this.#snapshot = null;
    return this.getSnapshot();
  }

  getSnapshot() {
    if (this.#snapshot === null) {
      this.#snapshot = Object.freeze({
        zoom: this.#zoom,
        offsetX: this.#offsetX,
        offsetY: this.#offsetY,
        minZoom: this.#minZoom,
        maxZoom: this.#maxZoom,
      });
    }
    return this.#snapshot;
  }

  #clampOffsets() {
    const minimumX = Math.min(0, this.#viewportWidth - (this.#worldWidth * this.#zoom));
    const minimumY = Math.min(0, this.#viewportHeight - (this.#worldHeight * this.#zoom));
    this.#offsetX = clamp(this.#offsetX, minimumX, 0);
    this.#offsetY = clamp(this.#offsetY, minimumY, 0);
  }
}
