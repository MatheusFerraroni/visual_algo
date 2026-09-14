import { Food } from "./food.js";
import { NOOP_PERFORMANCE_PROFILER } from "../debug/performance-profiler.js";

const ENERGY_QUANTIZATION_DECIMALS = 6;
const ENERGY_SCALE = 10 ** ENERGY_QUANTIZATION_DECIMALS;

function quantize(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function assertRandom(random, label) {
  if (!random || typeof random.nextFloat !== "function") {
    throw new TypeError(`${label} deve expor nextFloat().`);
  }
}

export class FoodSystem {
  #columns;
  #initialCount;
  #spawnCount;
  #spawnIntervalTicks;
  #maxCount;
  #minEnergy;
  #maxEnergy;
  #inactivityTimeoutTicks;
  #nextSpawnTick;
  #spawnRandom;
  #relocationRandom;
  #initialInactivityRandom;
  #spawnInactivityRandom;
  #relocationInactivityRandom;
  #eligibleTiles;
  #occupiedIndexes = new Set();
  #foods = [];
  #nextId = 1;
  #lastProcessedTick = 0;
  #totalCreated = 0;
  #totalDepleted = 0;
  #snapshot = null;
  #metricsSnapshot = null;
  #profiler;

  constructor({
    mapSnapshot,
    config,
    spawnIntervalTicks,
    inactivityTimeoutTicks,
    initialRandom,
    spawnRandom,
    relocationRandom,
    initialInactivityRandom,
    spawnInactivityRandom,
    relocationInactivityRandom,
    profiler = NOOP_PERFORMANCE_PROFILER,
  }) {
    if (!mapSnapshot || !Array.isArray(mapSnapshot.tiles)
      || !Number.isInteger(mapSnapshot.columns) || mapSnapshot.columns <= 0) {
      throw new TypeError("FoodSystem exige um snapshot de mapa válido.");
    }
    if (!config || !Number.isInteger(config.initialCount) || config.initialCount < 0
      || !Number.isInteger(config.spawnCount) || config.spawnCount <= 0
      || !Number.isInteger(config.maxCount) || config.maxCount <= 0) {
      throw new TypeError("FoodSystem exige uma configuração de comida válida.");
    }
    if (config.initialCount > config.maxCount) {
      throw new RangeError("A quantidade inicial não pode exceder o máximo de comidas.");
    }
    if (!Number.isFinite(config.minEnergy) || !Number.isFinite(config.maxEnergy)
      || config.minEnergy <= 0 || config.maxEnergy < config.minEnergy) {
      throw new RangeError("Os limites de energia da comida são inválidos.");
    }
    if (!Number.isSafeInteger(spawnIntervalTicks) || spawnIntervalTicks <= 0) {
      throw new TypeError("O intervalo de spawn deve ser uma quantidade positiva de ticks.");
    }
    if (!Number.isSafeInteger(inactivityTimeoutTicks) || inactivityTimeoutTicks < 0) {
      throw new TypeError("O limite de inatividade deve ser uma quantidade não negativa de ticks.");
    }
    if (inactivityTimeoutTicks > Math.floor(Number.MAX_SAFE_INTEGER / 2)) {
      throw new RangeError("O limite de inatividade não comporta o acréscimo aleatório seguro.");
    }
    assertRandom(initialRandom, "O stream da leva inicial");
    assertRandom(spawnRandom, "O stream dos eventos de spawn");
    assertRandom(relocationRandom, "O stream das realocações");
    assertRandom(initialInactivityRandom, "O stream de inatividade da leva inicial");
    assertRandom(spawnInactivityRandom, "O stream de inatividade dos spawns");
    assertRandom(relocationInactivityRandom, "O stream de inatividade das realocações");

    this.#columns = mapSnapshot.columns;
    this.#initialCount = config.initialCount;
    this.#spawnCount = config.spawnCount;
    this.#spawnIntervalTicks = spawnIntervalTicks;
    this.#maxCount = config.maxCount;
    this.#minEnergy = config.minEnergy;
    this.#maxEnergy = config.maxEnergy;
    this.#inactivityTimeoutTicks = inactivityTimeoutTicks;
    this.#nextSpawnTick = spawnIntervalTicks;
    this.#spawnRandom = spawnRandom;
    this.#relocationRandom = relocationRandom;
    this.#initialInactivityRandom = initialInactivityRandom;
    this.#spawnInactivityRandom = spawnInactivityRandom;
    this.#relocationInactivityRandom = relocationInactivityRandom;
    this.#profiler = profiler;
    this.#eligibleTiles = mapSnapshot.tiles
      .filter((tile) => tile.type === "land" && tile.productivity > 0)
      .map((tile) => ({
        column: tile.column,
        row: tile.row,
        index: (tile.row * mapSnapshot.columns) + tile.column,
        productivity: tile.productivity,
      }))
      .sort((first, second) => first.index - second.index);

    this.#spawn(config.initialCount, initialRandom, 0, this.#initialInactivityRandom);
  }

  processTick(completedTick) {
    if (!Number.isSafeInteger(completedTick) || completedTick !== this.#lastProcessedTick + 1) {
      throw new RangeError("FoodSystem exige ticks inteiros, positivos e consecutivos.");
    }

    this.#lastProcessedTick = completedTick;
    if (this.#inactivityTimeoutTicks > 0 && this.#foods.length > 0) {
      this.#snapshot = null;
    }
    if (completedTick === this.#nextSpawnTick) {
      this.#spawn(
        this.#spawnCount,
        this.#spawnRandom,
        completedTick,
        this.#spawnInactivityRandom,
      );
      this.#nextSpawnTick += this.#spawnIntervalTicks;
    }
  }

  updateSpawnPolicy({ spawnCount, spawnIntervalTicks }) {
    if (!Number.isSafeInteger(spawnCount) || spawnCount <= 0) {
      throw new TypeError("A quantidade por spawn deve ser um inteiro positivo.");
    }
    if (!Number.isSafeInteger(spawnIntervalTicks) || spawnIntervalTicks <= 0) {
      throw new TypeError("O intervalo de spawn deve ser uma quantidade positiva de ticks.");
    }

    if (spawnIntervalTicks !== this.#spawnIntervalTicks) {
      const nextSpawnTick = this.#lastProcessedTick + spawnIntervalTicks;
      if (!Number.isSafeInteger(nextSpawnTick)) {
        throw new RangeError("O próximo tick de spawn excede o limite inteiro seguro.");
      }
      this.#spawnIntervalTicks = spawnIntervalTicks;
      this.#nextSpawnTick = nextSpawnTick;
    }
    this.#spawnCount = spawnCount;
    return this.getSpawnPolicySnapshot();
  }

  getSpawnPolicySnapshot() {
    return Object.freeze({
      initialCount: this.#initialCount,
      spawnCount: this.#spawnCount,
      spawnIntervalTicks: this.#spawnIntervalTicks,
      nextSpawnTick: this.#nextSpawnTick,
      maxCount: this.#maxCount,
      minEnergy: this.#minEnergy,
      maxEnergy: this.#maxEnergy,
      inactivityTimeoutTicks: this.#inactivityTimeoutTicks,
    });
  }

  getSnapshot() {
    if (this.#snapshot === null) {
      this.#snapshot = this.#profiler.measure("food.snapshot-build", () => Object.freeze(
        this.#foods.map((food) => food.getSnapshot({ currentTick: this.#lastProcessedTick })),
      ));
    }
    return this.#snapshot;
  }

  getMetricsSnapshot() {
    if (this.#metricsSnapshot === null) {
      this.#metricsSnapshot = Object.freeze({
        availableCount: this.#foods.length,
        totalRemainingEnergy: quantize(
          this.#foods.reduce((total, food) => total + food.remainingEnergyUnits, 0)
            / ENERGY_SCALE,
          ENERGY_QUANTIZATION_DECIMALS,
        ),
        totalCreated: this.#totalCreated,
        totalDepleted: this.#totalDepleted,
      });
    }
    return this.#metricsSnapshot;
  }

  resolveConsumption(requests) {
    return this.#profiler.measure("food.consume", () => {
      if (!Array.isArray(requests)) {
        throw new TypeError("As solicitações de consumo devem ser uma lista.");
      }

      const normalizedRequests = this.#profiler.measure("food.consume-normalize", () => {
        const foodsById = new Map(this.#foods.map((food) => [food.id, food]));
        const seenBeings = new Set();
        return requests.map((request) => {
          if (!request || !Number.isSafeInteger(request.beingId) || request.beingId <= 0
            || !Number.isSafeInteger(request.foodId) || request.foodId <= 0
            || !Number.isFinite(request.requestedEnergy) || request.requestedEnergy <= 0) {
            throw new TypeError("Solicitação de consumo inválida.");
          }
          if (seenBeings.has(request.beingId)) {
            throw new RangeError("Cada ser pode solicitar energia de somente uma comida por tick.");
          }
          const food = foodsById.get(request.foodId);
          if (!food) {
            throw new RangeError(`A comida ${request.foodId} não existe.`);
          }
          const requestedUnits = Math.round(request.requestedEnergy * ENERGY_SCALE);
          if (!Number.isSafeInteger(requestedUnits) || requestedUnits <= 0) {
            throw new RangeError("A energia solicitada excede a precisão segura suportada.");
          }
          seenBeings.add(request.beingId);
          return {
            beingId: request.beingId,
            foodId: request.foodId,
            requestedUnits,
            food,
          };
        }).sort(
          (first, second) => (first.foodId - second.foodId)
            || (first.beingId - second.beingId),
        );
      });

      const granted = this.#profiler.measure("food.consume-allocate", () => {
        const allocations = [];
        for (let start = 0; start < normalizedRequests.length;) {
          let end = start + 1;
          while (end < normalizedRequests.length
            && normalizedRequests[end].foodId === normalizedRequests[start].foodId) {
            end += 1;
          }
          const group = normalizedRequests.slice(start, end);
          const food = group[0].food;
          const totalRequestedUnits = group.reduce(
            (total, request) => total + request.requestedUnits,
            0,
          );
          const availableUnits = food.remainingEnergyUnits;
          const grantsForFood = totalRequestedUnits <= availableUnits
            ? group.map((request) => ({ request, units: request.requestedUnits }))
            : this.#allocateProportionally(group, availableUnits, totalRequestedUnits);
          const removedUnits = grantsForFood.reduce((total, grant) => total + grant.units, 0);
          food.removeEnergyUnits(removedUnits, this.#lastProcessedTick);
          for (const grant of grantsForFood) {
            allocations.push(Object.freeze({
              beingId: grant.request.beingId,
              foodId: grant.request.foodId,
              energy: grant.units / ENERGY_SCALE,
            }));
          }
          start = end;
        }
        return allocations;
      });

      this.#profiler.measure("food.depleted-cleanup", () => {
        const depletedFoods = this.#foods.filter((food) => food.remainingEnergyUnits === 0);
        if (depletedFoods.length > 0) {
          for (const food of depletedFoods) {
            this.#occupiedIndexes.delete((food.row * this.#columns) + food.column);
          }
          this.#foods = this.#foods.filter((food) => food.remainingEnergyUnits > 0);
          this.#totalDepleted += depletedFoods.length;
        }
        if (requests.length > 0) {
          this.#snapshot = null;
          this.#metricsSnapshot = null;
        }
      });
      this.#profiler.measure("food.relocation", () => this.#relocateExpiredFoods());
      granted.sort((first, second) => first.beingId - second.beingId);
      return Object.freeze(granted);
    });
  }

  #spawn(requestedCount, random, createdTick, inactivityRandom) {
    const availableCapacity = Math.max(0, this.#maxCount - this.#foods.length);
    const spawnLimit = Math.min(requestedCount, availableCapacity);

    for (let created = 0; created < spawnLimit; created += 1) {
      const tile = this.#selectTile(random);
      if (tile === null) {
        break;
      }

      this.#createFood(tile, createdTick, inactivityRandom);
    }
  }

  #createFood(tile, createdTick, inactivityRandom) {
    const initialEnergy = quantize(
      this.#minEnergy + ((this.#maxEnergy - this.#minEnergy) * tile.productivity),
      ENERGY_QUANTIZATION_DECIMALS,
    );
    this.#foods.push(new Food({
      id: this.#nextId,
      column: tile.column,
      row: tile.row,
      initialEnergy,
      createdTick,
      inactivityTimeoutTicks: this.#createInactivityTimeout(inactivityRandom),
    }));
    this.#occupiedIndexes.add(tile.index);
    this.#nextId += 1;
    this.#totalCreated += 1;
    this.#snapshot = null;
    this.#metricsSnapshot = null;
  }

  #relocateExpiredFoods() {
    if (this.#inactivityTimeoutTicks === 0 || this.#foods.length === 0) {
      return;
    }
    const expiredFoods = this.#foods.filter(
      (food) => this.#lastProcessedTick - food.lastConsumedTick
        >= food.inactivityTimeoutTicks,
    );
    if (expiredFoods.length === 0) {
      return;
    }

    const expiredIds = new Set(expiredFoods.map((food) => food.id));
    for (const food of expiredFoods) {
      this.#occupiedIndexes.delete((food.row * this.#columns) + food.column);
    }
    this.#foods = this.#foods.filter((food) => !expiredIds.has(food.id));
    this.#snapshot = null;
    this.#metricsSnapshot = null;

    for (const food of expiredFoods) {
      const previousIndex = (food.row * this.#columns) + food.column;
      const tile = this.#selectTile(this.#relocationRandom, previousIndex);
      if (tile !== null) {
        this.#createFood(
          tile,
          this.#lastProcessedTick,
          this.#relocationInactivityRandom,
        );
      }
    }
  }

  #createInactivityTimeout(random) {
    if (this.#inactivityTimeoutTicks === 0) {
      return 0;
    }
    const randomValue = random.nextFloat();
    if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
      throw new RangeError("O stream de inatividade deve produzir valores em [0, 1).");
    }
    const jitterTicks = Math.floor(randomValue * (this.#inactivityTimeoutTicks + 1));
    return this.#inactivityTimeoutTicks + jitterTicks;
  }

  #selectTile(random, excludedIndex = null) {
    let totalWeight = 0;
    for (const tile of this.#eligibleTiles) {
      if (!this.#occupiedIndexes.has(tile.index) && tile.index !== excludedIndex) {
        totalWeight += tile.productivity;
      }
    }

    if (!(totalWeight > 0)) {
      return null;
    }

    const randomValue = random.nextFloat();
    if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
      throw new RangeError("O stream aleatório deve produzir valores em [0, 1).");
    }
    const target = randomValue * totalWeight;
    let cumulativeWeight = 0;
    let fallback = null;

    for (const tile of this.#eligibleTiles) {
      if (this.#occupiedIndexes.has(tile.index) || tile.index === excludedIndex) {
        continue;
      }
      cumulativeWeight += tile.productivity;
      fallback = tile;
      if (target < cumulativeWeight) {
        return tile;
      }
    }

    return fallback;
  }

  #allocateProportionally(group, availableUnits, totalRequestedUnits) {
    const available = BigInt(availableUnits);
    const totalRequested = BigInt(totalRequestedUnits);
    const allocations = group.map((request) => {
      const numerator = BigInt(request.requestedUnits) * available;
      return {
        request,
        units: Number(numerator / totalRequested),
        remainder: numerator % totalRequested,
      };
    });
    let remainingUnits = availableUnits - allocations.reduce(
      (total, allocation) => total + allocation.units,
      0,
    );
    const byRemainder = [...allocations].sort(
      (first, second) => {
        if (first.remainder === second.remainder) {
          return first.request.beingId - second.request.beingId;
        }
        return first.remainder > second.remainder ? -1 : 1;
      },
    );
    for (let index = 0; remainingUnits > 0; index += 1) {
      byRemainder[index].units += 1;
      remainingUnits -= 1;
    }
    return allocations;
  }
}
