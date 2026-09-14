import { SeededRandom } from "./seeded-random.js";
import { PerlinNoise2D, fractalNoise2D } from "./perlin-noise-2d.js";
import { Tile } from "./tile.js";
import { NOOP_PERFORMANCE_PROFILER } from "../debug/performance-profiler.js";

export class MapGenerationError extends Error {
  constructor(message) {
    super(message);
    this.name = "MapGenerationError";
  }
}

function quantize(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function smoothstep(edgeStart, edgeEnd, value) {
  const normalized = Math.max(0, Math.min(1, (value - edgeStart) / (edgeEnd - edgeStart)));
  return normalized * normalized * (3 - (2 * normalized));
}

function sampleRange(random, min, max) {
  return min === max ? min : random.nextRange(min, max);
}

function isBorder(column, row, columns, rows) {
  return column === 0 || row === 0 || column === columns - 1 || row === rows - 1;
}

function findLandComponents(candidates, columns, rows) {
  const visited = new Uint8Array(candidates.length);
  const components = [];

  for (let start = 0; start < candidates.length; start += 1) {
    if (!candidates[start] || visited[start]) {
      continue;
    }

    const component = [];
    const queue = [start];
    visited[start] = 1;

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor];
      component.push(index);
      const column = index % columns;
      const row = Math.floor(index / columns);
      const neighbors = [];

      if (column > 0) neighbors.push(index - 1);
      if (column + 1 < columns) neighbors.push(index + 1);
      if (row > 0) neighbors.push(index - columns);
      if (row + 1 < rows) neighbors.push(index + columns);

      for (const neighbor of neighbors) {
        if (candidates[neighbor] && !visited[neighbor]) {
          visited[neighbor] = 1;
          queue.push(neighbor);
        }
      }
    }

    components.push({ start, indexes: component });
  }

  return components.sort(
    (first, second) => (second.indexes.length - first.indexes.length)
      || (first.start - second.start),
  );
}

function findWaterComponents(landMask, columns, rows) {
  const visited = new Uint8Array(landMask.length);
  const components = [];

  for (let start = 0; start < landMask.length; start += 1) {
    if (landMask[start] || visited[start]) {
      continue;
    }

    const indexes = [];
    const queue = [start];
    let touchesBorder = false;
    visited[start] = 1;

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor];
      indexes.push(index);
      const column = index % columns;
      const row = Math.floor(index / columns);
      touchesBorder ||= isBorder(column, row, columns, rows);
      const neighbors = [];

      if (column > 0) neighbors.push(index - 1);
      if (column + 1 < columns) neighbors.push(index + 1);
      if (row > 0) neighbors.push(index - columns);
      if (row + 1 < rows) neighbors.push(index + columns);

      for (const neighbor of neighbors) {
        if (!landMask[neighbor] && !visited[neighbor]) {
          visited[neighbor] = 1;
          queue.push(neighbor);
        }
      }
    }

    components.push({ start, indexes, touchesBorder });
  }

  return components.sort(
    (first, second) => (second.indexes.length - first.indexes.length)
      || (first.start - second.start),
  );
}

function findProductivityMultiplier(values, targetTotal) {
  const totalFor = (multiplier) => values.reduce(
    (total, value) => total + Math.min(1, value * multiplier),
    0,
  );

  let lower = 0;
  let upper = 1;
  while (totalFor(upper) < targetTotal) {
    upper *= 2;
    if (!Number.isFinite(upper)) {
      throw new MapGenerationError("Não foi possível ajustar a produtividade do mapa.");
    }
  }

  for (let iteration = 0; iteration < 64; iteration += 1) {
    const middle = (lower + upper) / 2;
    if (totalFor(middle) < targetTotal) {
      lower = middle;
    } else {
      upper = middle;
    }
  }

  return (lower + upper) / 2;
}

class MaxPriorityQueue {
  #items = [];

  get size() {
    return this.#items.length;
  }

  push(item) {
    let index = this.#items.length;
    this.#items.push(item);

    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (!MaxPriorityQueue.#comesFirst(item, this.#items[parent])) {
        break;
      }
      this.#items[index] = this.#items[parent];
      index = parent;
    }
    this.#items[index] = item;
  }

  pop() {
    if (this.#items.length === 0) {
      return null;
    }
    const first = this.#items[0];
    const last = this.#items.pop();
    if (this.#items.length === 0) {
      return first;
    }

    let index = 0;
    while (true) {
      const left = (index * 2) + 1;
      const right = left + 1;
      if (left >= this.#items.length) {
        break;
      }
      let next = left;
      if (right < this.#items.length
        && MaxPriorityQueue.#comesFirst(this.#items[right], this.#items[left])) {
        next = right;
      }
      if (!MaxPriorityQueue.#comesFirst(this.#items[next], last)) {
        break;
      }
      this.#items[index] = this.#items[next];
      index = next;
    }
    this.#items[index] = last;
    return first;
  }

  static #comesFirst(first, second) {
    return first.score > second.score
      || (first.score === second.score && first.index < second.index);
  }
}

function getCardinalNeighbors(index, columns, rows) {
  const column = index % columns;
  const row = Math.floor(index / columns);
  const neighbors = [];
  if (column > 0) neighbors.push(index - 1);
  if (column + 1 < columns) neighbors.push(index + 1);
  if (row > 0) neighbors.push(index - columns);
  if (row + 1 < rows) neighbors.push(index + columns);
  return neighbors;
}

function allocateIslandSizes(totalLandCount, settings, random) {
  const secondaryMinimum = settings.secondaryIslandCount
    * settings.minSecondaryIslandTiles;
  const sampledMainFraction = sampleRange(
    random,
    settings.minMainLandFraction,
    settings.maxMainLandFraction,
  );
  const mainLandCount = Math.min(
    Math.round(totalLandCount * sampledMainFraction),
    totalLandCount - secondaryMinimum,
  );
  if (mainLandCount <= 0) {
    return null;
  }

  const availableForSecondary = totalLandCount - mainLandCount;
  if (availableForSecondary < secondaryMinimum) {
    return null;
  }
  const remaining = availableForSecondary - secondaryMinimum;
  const weights = Array.from(
    { length: settings.secondaryIslandCount },
    () => random.nextRange(0.75, 1.25),
  );
  const weightTotal = weights.reduce((total, weight) => total + weight, 0);
  const allocations = weights.map((weight, index) => {
    const exact = remaining * weight / weightTotal;
    return {
      index,
      count: settings.minSecondaryIslandTiles + Math.floor(exact),
      remainder: exact - Math.floor(exact),
    };
  });
  let undistributed = availableForSecondary
    - allocations.reduce((total, allocation) => total + allocation.count, 0);
  const byRemainder = [...allocations].sort(
    (first, second) => (second.remainder - first.remainder)
      || (first.index - second.index),
  );
  for (let index = 0; index < undistributed; index += 1) {
    byRemainder[index].count += 1;
  }

  return [
    mainLandCount,
    ...allocations.sort((first, second) => first.index - second.index)
      .map((allocation) => allocation.count),
  ];
}

function createIslandDescriptors(columns, rows, targetSizes, settings, random) {
  const centerX = columns / 2;
  const centerY = rows / 2;
  const halfMinimumDimension = Math.min(columns, rows) / 2;
  const sectorAngle = (Math.PI * 2) / settings.secondaryIslandCount;
  const descriptors = [{
    id: 0,
    centerX,
    centerY,
    targetSize: targetSizes[0],
  }];

  for (let index = 0; index < settings.secondaryIslandCount; index += 1) {
    const jitter = random.nextRange(
      -settings.angularJitterFraction,
      settings.angularJitterFraction,
    );
    const angle = (index + 0.5 + jitter) * sectorAngle;
    const orbit = sampleRange(
      random,
      settings.satelliteOrbitMinFraction,
      settings.satelliteOrbitMaxFraction,
    ) * halfMinimumDimension;
    descriptors.push({
      id: index + 1,
      centerX: centerX + (Math.cos(angle) * orbit),
      centerY: centerY + (Math.sin(angle) * orbit),
      targetSize: targetSizes[index + 1],
    });
  }
  return descriptors;
}

function assignTerritories(columns, rows, descriptors, settings) {
  const owners = new Int16Array(columns * rows);
  owners.fill(-1);

  for (let row = 1; row < rows - 1; row += 1) {
    for (let column = 1; column < columns - 1; column += 1) {
      const index = (row * columns) + column;
      let selectedId = -1;
      let selectedDistance = Number.POSITIVE_INFINITY;
      for (const descriptor of descriptors) {
        const distance = (
          ((column + 0.5 - descriptor.centerX) ** 2)
          + ((row + 0.5 - descriptor.centerY) ** 2)
        ) / descriptor.targetSize;
        if (distance < selectedDistance
          || (distance === selectedDistance && descriptor.id < selectedId)) {
          selectedId = descriptor.id;
          selectedDistance = distance;
        }
      }
      owners[index] = selectedId;
    }
  }

  const eligible = new Uint8Array(owners.length);
  for (let row = 1; row < rows - 1; row += 1) {
    for (let column = 1; column < columns - 1; column += 1) {
      const index = (row * columns) + column;
      const owner = owners[index];
      let separated = true;
      for (let rowOffset = -settings.separationTiles;
        rowOffset <= settings.separationTiles && separated;
        rowOffset += 1) {
        for (let columnOffset = -settings.separationTiles;
          columnOffset <= settings.separationTiles;
          columnOffset += 1) {
          if (Math.abs(columnOffset) + Math.abs(rowOffset) > settings.separationTiles) {
            continue;
          }
          const neighborColumn = column + columnOffset;
          const neighborRow = row + rowOffset;
          if (neighborColumn <= 0 || neighborRow <= 0
            || neighborColumn >= columns - 1 || neighborRow >= rows - 1
            || owners[(neighborRow * columns) + neighborColumn] !== owner) {
            separated = false;
            break;
          }
        }
      }
      eligible[index] = Number(separated);
    }
  }
  return { owners, eligible };
}

function findNearestEligibleIndex(descriptor, owner, eligible, owners, columns) {
  let selectedIndex = -1;
  let selectedDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < eligible.length; index += 1) {
    if (!eligible[index] || owners[index] !== owner) {
      continue;
    }
    const column = index % columns;
    const row = Math.floor(index / columns);
    const distance = ((column + 0.5 - descriptor.centerX) ** 2)
      + ((row + 0.5 - descriptor.centerY) ** 2);
    if (distance < selectedDistance
      || (distance === selectedDistance && index < selectedIndex)) {
      selectedIndex = index;
      selectedDistance = distance;
    }
  }
  return selectedIndex;
}

function calculateElevations(columns, rows, descriptors, owners, noiseValues, terrain) {
  return noiseValues.map((noiseValue, index) => {
    const owner = owners[index] < 0 ? 0 : owners[index];
    const descriptor = descriptors[owner];
    const column = index % columns;
    const row = Math.floor(index / columns);
    const radius = Math.sqrt(descriptor.targetSize / Math.PI) * 1.35;
    const normalizedDistance = Math.hypot(
      column + 0.5 - descriptor.centerX,
      row + 0.5 - descriptor.centerY,
    ) / radius;
    const radialMask = 1 - smoothstep(0.15, 1, normalizedDistance);
    return quantize(
      (noiseValue * terrain.noiseWeight)
        + (radialMask * (1 - terrain.noiseWeight)),
      terrain.quantizationDecimals,
    );
  });
}

function growIsland(
  descriptor,
  eligible,
  owners,
  elevations,
  columns,
  rows,
  landMask,
) {
  const start = findNearestEligibleIndex(
    descriptor,
    descriptor.id,
    eligible,
    owners,
    columns,
  );
  if (start < 0) {
    return false;
  }

  const queued = new Uint8Array(eligible.length);
  const queue = new MaxPriorityQueue();
  queue.push({ index: start, score: elevations[start] });
  queued[start] = 1;
  let count = 0;

  while (queue.size > 0 && count < descriptor.targetSize) {
    const { index } = queue.pop();
    landMask[index] = 1;
    count += 1;
    for (const neighbor of getCardinalNeighbors(index, columns, rows)) {
      if (!queued[neighbor]
        && eligible[neighbor]
        && owners[neighbor] === descriptor.id) {
        queued[neighbor] = 1;
        queue.push({ index: neighbor, score: elevations[neighbor] });
      }
    }
  }
  return count === descriptor.targetSize;
}

function expandIsland(
  descriptor,
  protectedWater,
  eligible,
  owners,
  elevations,
  columns,
  rows,
  landMask,
) {
  const queued = new Uint8Array(eligible.length);
  const queue = new MaxPriorityQueue();
  let count = 0;

  for (let index = 0; index < landMask.length; index += 1) {
    if (!landMask[index] || owners[index] !== descriptor.id) {
      continue;
    }
    count += 1;
    for (const neighbor of getCardinalNeighbors(index, columns, rows)) {
      if (!landMask[neighbor]
        && !protectedWater[neighbor]
        && !queued[neighbor]
        && eligible[neighbor]
        && owners[neighbor] === descriptor.id) {
        queued[neighbor] = 1;
        queue.push({ index: neighbor, score: elevations[neighbor] });
      }
    }
  }

  while (queue.size > 0 && count < descriptor.targetSize) {
    const { index } = queue.pop();
    if (landMask[index] || protectedWater[index]) {
      continue;
    }
    landMask[index] = 1;
    count += 1;
    for (const neighbor of getCardinalNeighbors(index, columns, rows)) {
      if (!landMask[neighbor]
        && !protectedWater[neighbor]
        && !queued[neighbor]
        && eligible[neighbor]
        && owners[neighbor] === descriptor.id) {
        queued[neighbor] = 1;
        queue.push({ index: neighbor, score: elevations[neighbor] });
      }
    }
  }
  return count >= descriptor.targetSize;
}

function carveLakes(
  landMask,
  noiseValues,
  columns,
  rows,
  terrain,
  settings,
  random,
) {
  const targetLakeCount = random.nextInt(
    settings.minLakeCount,
    settings.maxLakeCount + 1,
  );
  let lakes = findWaterComponents(landMask, columns, rows)
    .filter((component) => !component.touchesBorder);

  while (lakes.length < targetLakeCount) {
    const targetSize = random.nextInt(terrain.minLakeTiles, settings.maxLakeTiles + 1);
    const waterDistances = calculateWaterDistances(landMask, columns, rows);
    const candidates = [];
    for (let index = 0; index < landMask.length; index += 1) {
      if (landMask[index] && waterDistances[index] >= settings.lakeMinDepthTiles) {
        candidates.push(index);
      }
    }
    candidates.sort((first, second) => (noiseValues[first] - noiseValues[second])
      || (first - second));
    if (candidates.length === 0) {
      return null;
    }
    const candidateOffset = random.nextInt(Math.min(64, candidates.length));
    let carved = false;

    for (let candidatePosition = 0;
      candidatePosition < Math.min(candidates.length, 512);
      candidatePosition += 1) {
      const start = candidates[(candidateOffset + candidatePosition) % candidates.length];
      if (!landMask[start] || waterDistances[start] < settings.lakeMinDepthTiles) {
        continue;
      }
      const queue = new MaxPriorityQueue();
      const queued = new Uint8Array(landMask.length);
      const proposed = [];
      queue.push({ index: start, score: -noiseValues[start] });
      queued[start] = 1;

      while (queue.size > 0 && proposed.length < targetSize) {
        const { index } = queue.pop();
        proposed.push(index);
        for (const neighbor of getCardinalNeighbors(index, columns, rows)) {
          if (!queued[neighbor]
            && landMask[neighbor]
            && waterDistances[neighbor] >= settings.lakeMinDepthTiles) {
            queued[neighbor] = 1;
            queue.push({ index: neighbor, score: -noiseValues[neighbor] });
          }
        }
      }
      if (proposed.length !== targetSize) {
        continue;
      }

      for (const index of proposed) {
        landMask[index] = 0;
      }
      const nextLandComponents = findLandComponents(landMask, columns, rows);
      const nextLakes = findWaterComponents(landMask, columns, rows)
        .filter((component) => !component.touchesBorder);
      if (nextLandComponents.length === settings.secondaryIslandCount + 1
        && nextLakes.length === lakes.length + 1) {
        lakes = nextLakes;
        carved = true;
        break;
      }
      for (const index of proposed) {
        landMask[index] = 1;
      }
    }

    if (!carved) {
      return null;
    }
  }
  return lakes;
}

function generateArchipelagoLayout(columns, rows, noiseValues, terrain, mapRandom) {
  const settings = terrain.archipelago;
  const minimumLand = Math.ceil(columns * rows * settings.minLandFraction);
  const maximumLand = Math.floor(columns * rows * settings.maxLandFraction);
  const centerIndex = (Math.floor(rows / 2) * columns) + Math.floor(columns / 2);

  for (let attempt = 0; attempt < settings.maxLayoutAttempts; attempt += 1) {
    const random = mapRandom.fork(`archipelago-layout:${attempt}`);
    const totalLandCount = random.nextInt(minimumLand, maximumLand + 1);
    const targetSizes = allocateIslandSizes(totalLandCount, settings, random);
    if (targetSizes === null) {
      continue;
    }
    const descriptors = createIslandDescriptors(columns, rows, targetSizes, settings, random);
    const { owners, eligible } = assignTerritories(columns, rows, descriptors, settings);
    const elevations = calculateElevations(
      columns,
      rows,
      descriptors,
      owners,
      noiseValues,
      terrain,
    );
    const landMask = new Uint8Array(columns * rows);
    if (!descriptors.every((descriptor) => growIsland(
      descriptor,
      eligible,
      owners,
      elevations,
      columns,
      rows,
      landMask,
    ))) {
      continue;
    }

    const initialLakes = findWaterComponents(landMask, columns, rows)
      .filter((component) => !component.touchesBorder);
    for (const lake of initialLakes) {
      if (lake.indexes.length < terrain.minLakeTiles) {
        for (const index of lake.indexes) {
          landMask[index] = 1;
        }
      }
    }

    const protectedLakes = carveLakes(
      landMask,
      noiseValues,
      columns,
      rows,
      terrain,
      settings,
      random,
    );
    if (protectedLakes === null) {
      continue;
    }
    const protectedWater = new Uint8Array(landMask.length);
    for (const lake of protectedLakes) {
      for (const index of lake.indexes) {
        protectedWater[index] = 1;
      }
    }
    if (!descriptors.every((descriptor) => expandIsland(
      descriptor,
      protectedWater,
      eligible,
      owners,
      elevations,
      columns,
      rows,
      landMask,
    ))) {
      continue;
    }

    const postExpansionLakes = findWaterComponents(landMask, columns, rows)
      .filter((component) => !component.touchesBorder);
    for (const lake of postExpansionLakes) {
      if (lake.indexes.length < terrain.minLakeTiles) {
        for (const index of lake.indexes) {
          landMask[index] = 1;
        }
      }
    }

    const components = findLandComponents(landMask, columns, rows);
    const lakes = findWaterComponents(landMask, columns, rows)
      .filter((component) => !component.touchesBorder);
    const landCount = components.reduce(
      (total, component) => total + component.indexes.length,
      0,
    );
    const landFraction = landCount / (columns * rows);
    const mainLandFraction = components[0]?.indexes.length / landCount;
    if (components.length !== settings.secondaryIslandCount + 1
      || !components[0].indexes.includes(centerIndex)
      || landFraction < settings.minLandFraction
      || landFraction > settings.maxLandFraction
      || mainLandFraction < settings.minMainLandFraction
      || mainLandFraction > settings.maxMainLandFraction
      || lakes.length < settings.minLakeCount
      || components.slice(1).some(
        (component) => component.indexes.length < settings.minSecondaryIslandTiles,
      )) {
      continue;
    }

    return { landMask, elevations, components, attempt };
  }

  throw new MapGenerationError(
    `Não foi possível gerar um arquipélago válido em ${settings.maxLayoutAttempts} tentativas.`,
  );
}

function allocateProductivityTargets(components, productivity) {
  const factor = 10 ** productivity.quantizationDecimals;
  const totalUnits = Math.round(productivity.targetTotal * factor);
  const largestSize = components[0].indexes.length;
  const weighted = components.map((component) => {
    const size = component.indexes.length;
    const weight = 1 + (productivity.islandSizeBonus
      * (1 - Math.sqrt(size / largestSize)));
    return { component, size, weight, weightedSize: size * weight };
  });
  const weightedTotal = weighted.reduce((total, entry) => total + entry.weightedSize, 0);
  const allocations = weighted.map((entry) => {
    const exact = totalUnits * entry.weightedSize / weightedTotal;
    return {
      ...entry,
      units: Math.floor(exact),
      remainder: exact - Math.floor(exact),
    };
  });
  let undistributed = totalUnits
    - allocations.reduce((total, allocation) => total + allocation.units, 0);
  const byRemainder = [...allocations].sort(
    (first, second) => (second.remainder - first.remainder)
      || (first.component.start - second.component.start),
  );
  for (let index = 0; index < undistributed; index += 1) {
    byRemainder[index].units += 1;
  }
  for (const allocation of allocations) {
    if (allocation.units > allocation.size * factor) {
      throw new MapGenerationError(
        `A ilha com ${allocation.size} tiles não comporta a massa de produtividade atribuída.`,
      );
    }
  }
  return allocations;
}

function calculateWaterDistances(landMask, columns, rows) {
  const distances = new Int32Array(landMask.length);
  distances.fill(-1);
  const queue = new Int32Array(landMask.length);
  let queueLength = 0;

  for (let index = 0; index < landMask.length; index += 1) {
    if (!landMask[index]) {
      distances[index] = 0;
      queue[queueLength] = index;
      queueLength += 1;
    }
  }

  for (let cursor = 0; cursor < queueLength; cursor += 1) {
    const index = queue[cursor];
    const column = index % columns;
    const row = Math.floor(index / columns);
    const neighbors = [];

    if (column > 0) neighbors.push(index - 1);
    if (column + 1 < columns) neighbors.push(index + 1);
    if (row > 0) neighbors.push(index - columns);
    if (row + 1 < rows) neighbors.push(index + columns);

    for (const neighbor of neighbors) {
      if (distances[neighbor] === -1) {
        distances[neighbor] = distances[index] + 1;
        queue[queueLength] = neighbor;
        queueLength += 1;
      }
    }
  }

  return distances;
}

function calculateWaterProximity(distance, rangeTiles) {
  return Math.max(0, (rangeTiles + 1 - distance) / rangeTiles);
}

function buildSnapshot(
  seed,
  worldConfig,
  tiles,
  landComponents,
  lakes,
  layoutAttempt,
) {
  const landCount = landComponents.reduce(
    (total, component) => total + component.indexes.length,
    0,
  );
  const totalProductivity = quantize(
    tiles.reduce((total, tile) => total + tile.productivity, 0),
    worldConfig.productivity.quantizationDecimals,
  );
  const islands = Object.freeze(landComponents.map((component, index) => {
    const componentProductivity = quantize(
      component.indexes.reduce(
        (total, tileIndex) => total + tiles[tileIndex].productivity,
        0,
      ),
      worldConfig.productivity.quantizationDecimals,
    );
    return Object.freeze({
      rank: index + 1,
      landCount: component.indexes.length,
      landFraction: quantize(component.indexes.length / landCount, 6),
      totalProductivity: componentProductivity,
      meanProductivity: quantize(
        componentProductivity / component.indexes.length,
        worldConfig.productivity.quantizationDecimals,
      ),
    });
  }));
  const tileSnapshots = Object.freeze(tiles.map((tile) => Object.freeze({
    column: tile.column,
    row: tile.row,
    type: tile.type,
    elevation: tile.elevation,
    productivity: tile.productivity,
  })));

  return Object.freeze({
    seed: String(seed),
    columns: worldConfig.columns,
    rows: worldConfig.rows,
    widthPx: worldConfig.columns * worldConfig.tileSizePx,
    heightPx: worldConfig.rows * worldConfig.tileSizePx,
    tileSizePx: worldConfig.tileSizePx,
    landCount,
    waterCount: tiles.length - landCount,
    landFraction: quantize(landCount / tiles.length, 6),
    islandCount: landComponents.length,
    largestIslandLandCount: landComponents[0].indexes.length,
    lakeCount: lakes.length,
    lakeTileCount: lakes.reduce((total, lake) => total + lake.indexes.length, 0),
    layoutAttempt,
    totalProductivity,
    meanLandProductivity: quantize(
      totalProductivity / landCount,
      worldConfig.productivity.quantizationDecimals,
    ),
    islands,
    tiles: tileSnapshots,
  });
}

export class WorldMap {
  #columns;
  #rows;
  #tiles;
  #mainIslandTiles;
  #snapshot;

  constructor(columns, rows, tiles, mainIslandTiles, snapshot) {
    this.#columns = columns;
    this.#rows = rows;
    this.#tiles = tiles;
    this.#mainIslandTiles = mainIslandTiles;
    this.#snapshot = snapshot;
    Object.freeze(this);
  }

  static generate(worldConfig, mapSeed, { profiler = NOOP_PERFORMANCE_PROFILER } = {}) {
    return profiler.measure("map.generate", () => {
      const { columns, rows, terrain, productivity } = worldConfig;
      const mapRandom = SeededRandom.fromSeed(mapSeed);
      const terrainNoise = new PerlinNoise2D(mapRandom.fork("terrain"));
      const productivityNoise = new PerlinNoise2D(mapRandom.fork("productivity"));
      const noiseValues = new Array(columns * rows);

      profiler.measure("map.terrain-noise", () => {
        for (let row = 0; row < rows; row += 1) {
          for (let column = 0; column < columns; column += 1) {
            const index = (row * columns) + column;
            noiseValues[index] = fractalNoise2D(
              terrainNoise,
              column * terrain.noiseScale,
              row * terrain.noiseScale,
              terrain,
            );
          }
        }
      });

      const layout = profiler.measure("map.archipelago", () => {
        const generated = generateArchipelagoLayout(
          columns,
          rows,
          noiseValues,
          terrain,
          mapRandom,
        );
        return {
          ...generated,
          lakes: findWaterComponents(generated.landMask, columns, rows)
            .filter((component) => !component.touchesBorder),
        };
      });
      const {
        landMask,
        elevations,
        components: finalLandComponents,
        attempt: layoutAttempt,
        lakes,
      } = layout;
      const landIndexes = finalLandComponents.flatMap((component) => component.indexes);

      if (landIndexes.length < productivity.targetTotal) {
        throw new MapGenerationError(
          `O arquipélago tem ${landIndexes.length} tiles terrestres, menos que a massa de produtividade ${productivity.targetTotal}.`,
        );
      }

      const productivityByIndex = profiler.measure("map.productivity", () => {
        const waterDistances = calculateWaterDistances(landMask, columns, rows);
        const valuesByIndex = new Float64Array(columns * rows);
        const productivityFactor = 10 ** productivity.quantizationDecimals;
        const productivityTargets = allocateProductivityTargets(
          finalLandComponents,
          productivity,
        );

        for (const target of productivityTargets) {
          const componentIndexes = [...target.component.indexes]
            .sort((first, second) => first - second);
          const rawProductivities = componentIndexes.map((index) => {
            const column = index % columns;
            const row = Math.floor(index / columns);
            const noiseProductivity = fractalNoise2D(
              productivityNoise,
              column * productivity.noiseScale,
              row * productivity.noiseScale,
              productivity,
            );
            const waterProximity = calculateWaterProximity(
              waterDistances[index],
              productivity.waterProximityRangeTiles,
            );
            return Math.min(
              1,
              noiseProductivity + (waterProximity * productivity.waterProximityBonus),
            );
          });
          const targetTotal = target.units / productivityFactor;
          const multiplier = findProductivityMultiplier(rawProductivities, targetTotal);
          const units = rawProductivities.map((value) => Math.round(
            Math.min(1, value * multiplier) * productivityFactor,
          ));
          let remainingUnits = target.units - units.reduce((total, value) => total + value, 0);

          for (let position = 0;
            remainingUnits !== 0;
            position = (position + 1) % componentIndexes.length) {
            const direction = Math.sign(remainingUnits);
            const nextValue = units[position] + direction;
            if (nextValue >= 0 && nextValue <= productivityFactor) {
              units[position] = nextValue;
              remainingUnits -= direction;
            }
          }
          for (let position = 0; position < componentIndexes.length; position += 1) {
            valuesByIndex[componentIndexes[position]] = units[position] / productivityFactor;
          }
        }
        return valuesByIndex;
      });

      return profiler.measure("map.tiles-snapshot", () => {
        const tiles = elevations.map((elevation, index) => new Tile({
          column: index % columns,
          row: Math.floor(index / columns),
          type: landMask[index] ? "land" : "water",
          elevation,
          productivity: productivityByIndex[index],
        }));
        Object.freeze(tiles);

        const mainIslandTiles = Object.freeze(
          [...finalLandComponents[0].indexes]
            .sort((first, second) => first - second)
            .map((index) => tiles[index]),
        );

        return new WorldMap(
          columns,
          rows,
          tiles,
          mainIslandTiles,
          buildSnapshot(
            mapSeed,
            worldConfig,
            tiles,
            finalLandComponents,
            lakes,
            layoutAttempt,
          ),
        );
      });
    });
  }

  getTile(column, row) {
    if (!Number.isInteger(column) || !Number.isInteger(row)
      || column < 0 || row < 0 || column >= this.#columns || row >= this.#rows) {
      return null;
    }
    return this.#tiles[(row * this.#columns) + column];
  }

  getSnapshot() {
    return this.#snapshot;
  }

  getMainIslandTiles() {
    return this.#mainIslandTiles;
  }
}
