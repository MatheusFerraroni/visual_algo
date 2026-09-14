const READING_DECIMALS = 6;
const ANGLE_DECIMALS = 9;
const FULL_TURN = Math.PI * 2;
const EPSILON = 1e-12;

function quantize(value, decimals) {
  const factor = 10 ** decimals;
  const result = Math.round(value * factor) / factor;
  return Object.is(result, -0) ? 0 : result;
}

function normalizeSignedAngle(angle) {
  let normalized = (angle + Math.PI) % FULL_TURN;
  if (normalized < 0) {
    normalized += FULL_TURN;
  }
  return normalized - Math.PI;
}

function proximity(distance, range) {
  return quantize(Math.max(0, Math.min(1, 1 - (distance / range))), READING_DECIMALS);
}

function getContainingTile(worldMap, x, y, columns, rows) {
  const column = Math.min(columns - 1, Math.max(0, Math.floor(x)));
  const row = Math.min(rows - 1, Math.max(0, Math.floor(y)));
  return worldMap.getTile(column, row);
}

function raycastTerrainBoundaryOrBorder({ worldMap, x, y, angle, range, columns, rows }) {
  const startTile = getContainingTile(worldMap, x, y, columns, rows);
  if (x <= 0 || y <= 0 || x >= columns || y >= rows) {
    return 0;
  }
  const startTerrainType = startTile.type;

  const directionX = Math.cos(angle);
  const directionY = Math.sin(angle);
  let column = startTile.column;
  let row = startTile.row;
  const stepX = directionX > EPSILON ? 1 : directionX < -EPSILON ? -1 : 0;
  const stepY = directionY > EPSILON ? 1 : directionY < -EPSILON ? -1 : 0;
  const deltaX = stepX === 0 ? Infinity : Math.abs(1 / directionX);
  const deltaY = stepY === 0 ? Infinity : Math.abs(1 / directionY);
  let distanceX = stepX > 0
    ? ((column + 1) - x) / directionX
    : stepX < 0 ? (x - column) / -directionX : Infinity;
  let distanceY = stepY > 0
    ? ((row + 1) - y) / directionY
    : stepY < 0 ? (y - row) / -directionY : Infinity;

  while (true) {
    const distance = Math.min(distanceX, distanceY);
    if (!Number.isFinite(distance) || distance > range) {
      return null;
    }

    if (Math.abs(distanceX - distanceY) <= EPSILON) {
      column += stepX;
      row += stepY;
      distanceX += deltaX;
      distanceY += deltaY;
    } else if (distanceX < distanceY) {
      column += stepX;
      distanceX += deltaX;
    } else {
      row += stepY;
      distanceY += deltaY;
    }

    if (column < 0 || row < 0 || column >= columns || row >= rows) {
      return Math.max(0, distance);
    }
    if (worldMap.getTile(column, row).type !== startTerrainType) {
      return Math.max(0, distance);
    }
  }
}

export class EyeSensor {
  #count;
  #fieldOfViewRadians;
  #rangeTiles;

  constructor({ count, fieldOfViewDegrees, rangeTiles }) {
    if (!Number.isSafeInteger(count) || count <= 0) {
      throw new TypeError("A quantidade de olhos deve ser um inteiro seguro positivo.");
    }
    if (!Number.isFinite(fieldOfViewDegrees)
      || fieldOfViewDegrees <= 0 || fieldOfViewDegrees > 360) {
      throw new RangeError("O campo de visão deve estar entre 0 e 360 graus.");
    }
    if (!Number.isFinite(rangeTiles) || rangeTiles <= 0) {
      throw new RangeError("O alcance dos olhos deve ser positivo.");
    }
    this.#count = count;
    this.#fieldOfViewRadians = fieldOfViewDegrees * Math.PI / 180;
    this.#rangeTiles = rangeTiles;
    Object.freeze(this);
  }

  observe({ position, foods, worldMap }) {
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)
      || !Number.isFinite(position.directionRadians)) {
      throw new TypeError("A visão exige uma posição e direção finitas.");
    }
    if (!Array.isArray(foods)) {
      throw new TypeError("A visão exige uma lista de comidas.");
    }
    if (!worldMap || typeof worldMap.getTile !== "function"
      || typeof worldMap.getSnapshot !== "function") {
      throw new TypeError("A visão exige um WorldMap válido.");
    }

    const map = worldMap.getSnapshot();
    const sectorWidth = this.#fieldOfViewRadians / this.#count;
    const halfField = this.#fieldOfViewRadians / 2;
    const foodHits = Array.from({ length: this.#count }, () => null);

    for (const food of foods) {
      const foodX = food.column + 0.5;
      const foodY = food.row + 0.5;
      const deltaX = foodX - position.x;
      const deltaY = foodY - position.y;
      const distanceSquared = (deltaX * deltaX) + (deltaY * deltaY);
      if (distanceSquared > this.#rangeTiles ** 2) {
        continue;
      }
      const relativeAngle = distanceSquared === 0
        ? 0
        : normalizeSignedAngle(Math.atan2(deltaY, deltaX) - position.directionRadians);
      if (relativeAngle < -halfField - EPSILON || relativeAngle > halfField + EPSILON) {
        continue;
      }
      const sectorPosition = (relativeAngle + halfField) / sectorWidth;
      const sectorIndex = relativeAngle >= halfField - EPSILON
        ? this.#count - 1
        : Math.min(this.#count - 1, Math.max(0, Math.floor(sectorPosition + EPSILON)));
      const current = foodHits[sectorIndex];
      if (current === null || distanceSquared < current.distanceSquared
        || (distanceSquared === current.distanceSquared && food.id < current.id)) {
        foodHits[sectorIndex] = { id: food.id, distanceSquared };
      }
    }

    const eyes = [];
    for (let index = 0; index < this.#count; index += 1) {
      const angleOffset = -halfField + ((index + 0.5) * sectorWidth);
      const foodHit = foodHits[index];
      const foodDistance = foodHit === null ? null : Math.sqrt(foodHit.distanceSquared);
      const boundaryDistance = raycastTerrainBoundaryOrBorder({
        worldMap,
        x: position.x,
        y: position.y,
        angle: position.directionRadians + angleOffset,
        range: this.#rangeTiles,
        columns: map.columns,
        rows: map.rows,
      });
      eyes.push(Object.freeze({
        index,
        angleOffsetRadians: quantize(angleOffset, ANGLE_DECIMALS),
        foodProximity: foodDistance === null ? 0 : proximity(foodDistance, this.#rangeTiles),
        foodDistanceTiles: foodDistance === null
          ? null
          : quantize(foodDistance, READING_DECIMALS),
        detectedFoodId: foodHit?.id ?? null,
        boundaryProximity: boundaryDistance === null
          ? 0
          : proximity(boundaryDistance, this.#rangeTiles),
        boundaryDistanceTiles: boundaryDistance === null
          ? null
          : quantize(boundaryDistance, READING_DECIMALS),
      }));
    }
    return Object.freeze(eyes);
  }

  observeUnderBody({ position, worldMap }) {
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
      throw new TypeError("O olho inferior exige uma posição finita.");
    }
    if (!worldMap || typeof worldMap.getTile !== "function"
      || typeof worldMap.getSnapshot !== "function") {
      throw new TypeError("O olho inferior exige um WorldMap válido.");
    }
    const map = worldMap.getSnapshot();
    const tile = getContainingTile(
      worldMap,
      position.x,
      position.y,
      map.columns,
      map.rows,
    );
    return Object.freeze({
      terrainType: tile.type,
      waterProximity: tile.type === "water" ? 1 : 0,
    });
  }
}
