import { findFoodWithinDistance } from "./food-proximity.js";

const STATE_SCALE = 1_000_000;
const POSITION_DECIMALS = 9;
const FULL_TURN = Math.PI * 2;

function quantize(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function toStateUnits(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} deve ser um número finito não negativo.`);
  }
  const units = Math.round(value * STATE_SCALE);
  if (!Number.isSafeInteger(units)) {
    throw new RangeError(`${label} excede a precisão segura suportada.`);
  }
  return units;
}

function fromStateUnits(units) {
  return units / STATE_SCALE;
}

function normalizeDirection(direction) {
  const normalized = direction % FULL_TURN;
  return quantize(normalized < 0 ? normalized + FULL_TURN : normalized, POSITION_DECIMALS);
}

function reflectAxis(position, limit) {
  let reflected = false;
  let result = position;

  while (result < 0 || result > limit) {
    reflected = true;
    result = result < 0 ? -result : (2 * limit) - result;
  }

  return { position: result, reflected };
}

function assertNormalized(value, label) {
  if (!Number.isFinite(value) || value < -1 || value > 1) {
    throw new RangeError(`${label} deve estar entre -1 e 1.`);
  }
}

export class Being {
  #id;
  #x;
  #y;
  #directionRadians;
  #speed = 0;
  #turn = 0;
  #lifeUnits;
  #maxLifeUnits;
  #energyUnits;
  #maxEnergyUnits;
  #absorbedEnergyUnits = 0;
  #feedingFoodId = null;
  #ageTicks = 0;
  #physicsHz;
  #alive;
  #brain;
  #eyes = Object.freeze([]);
  #underBodyEye = null;
  #snapshot = null;

  constructor({ id, x, y, directionRadians, config, physicsHz, brain = null }) {
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new TypeError("O ID do ser deve ser um inteiro seguro maior que zero.");
    }
    if (!Number.isFinite(x) || x < 0 || !Number.isFinite(y) || y < 0) {
      throw new RangeError("A posição do ser deve ser finita e não negativa.");
    }
    if (!Number.isFinite(directionRadians)) {
      throw new TypeError("A direção do ser deve ser finita.");
    }
    if (!config || !Number.isFinite(config.initialLife) || !Number.isFinite(config.maxLife)
      || !Number.isFinite(config.initialEnergy) || !Number.isFinite(config.maxEnergy)) {
      throw new TypeError("Being exige uma configuração de vida e energia válida.");
    }
    if (!Number.isSafeInteger(physicsHz) || physicsHz <= 0) {
      throw new TypeError("Being exige uma frequência física inteira positiva.");
    }
    if (brain !== null && (typeof brain.prime !== "function"
      || typeof brain.decide !== "function"
      || typeof brain.getAction !== "function"
      || typeof brain.getGenome !== "function"
      || typeof brain.getSnapshot !== "function")) {
      throw new TypeError("O cérebro do ser é inválido.");
    }

    this.#id = id;
    this.#x = quantize(x, POSITION_DECIMALS);
    this.#y = quantize(y, POSITION_DECIMALS);
    this.#directionRadians = normalizeDirection(directionRadians);
    this.#lifeUnits = toStateUnits(config.initialLife, "A vida inicial");
    this.#maxLifeUnits = toStateUnits(config.maxLife, "A vida máxima");
    this.#energyUnits = toStateUnits(config.initialEnergy, "A energia inicial");
    this.#maxEnergyUnits = toStateUnits(config.maxEnergy, "A energia máxima");
    if (this.#lifeUnits > this.#maxLifeUnits || this.#energyUnits > this.#maxEnergyUnits) {
      throw new RangeError("Vida ou energia inicial excede o respectivo máximo.");
    }
    this.#physicsHz = physicsHz;
    this.#alive = this.#lifeUnits > 0;
    this.#brain = brain;
    Object.freeze(this);
  }

  get id() {
    return this.#id;
  }

  get alive() {
    return this.#alive;
  }

  get energy() {
    return fromStateUnits(this.#energyUnits);
  }

  #setFeedingFoodId(foodId) {
    if (this.#feedingFoodId !== foodId) {
      this.#feedingFoodId = foodId;
      this.#snapshot = null;
    }
  }

  getPosition() {
    return Object.freeze({
      x: this.#x,
      y: this.#y,
      directionRadians: this.#directionRadians,
    });
  }

  setPerception(eyes, underBodyEye, inputs, { decide = false } = {}) {
    if (this.#brain === null) {
      throw new Error("Este ser não possui cérebro neural.");
    }
    this.updateVisualPerception(eyes, underBodyEye);
    const action = decide ? this.#brain.decide(inputs) : this.#brain.prime(inputs);
    this.#snapshot = null;
    return action;
  }

  updateVisualPerception(eyes, underBodyEye) {
    if (!Array.isArray(eyes) || eyes.some((eye) => !Object.isFrozen(eye))) {
      throw new TypeError("A percepção deve ser uma lista de olhos imutáveis.");
    }
    if (!underBodyEye || !Object.isFrozen(underBodyEye)
      || !["land", "water"].includes(underBodyEye.terrainType)
      || ![0, 1].includes(underBodyEye.waterProximity)) {
      throw new TypeError("O olho inferior deve ser um snapshot imutável válido.");
    }
    this.#eyes = Object.isFrozen(eyes) ? eyes : Object.freeze([...eyes]);
    this.#underBodyEye = underBodyEye;
    this.#snapshot = null;
  }

  getBrainAction() {
    return this.#brain?.getAction() ?? Object.freeze({ speed: 0, turn: 0 });
  }

  getGenome() {
    if (this.#brain === null) {
      return null;
    }
    return this.#brain.getGenome();
  }

  applyAction(action, environment) {
    if (!this.#alive) {
      return;
    }
    if (!action || !environment) {
      throw new TypeError("A física do ser exige ação e ambiente.");
    }
    assertNormalized(action.speed, "A velocidade normalizada");
    assertNormalized(action.turn, "O giro normalizado");

    const {
      dtSeconds,
      worldWidthTiles,
      worldHeightTiles,
      getTileType,
      movement,
      energy,
      water,
    } = environment;
    if (!Number.isFinite(dtSeconds) || dtSeconds <= 0
      || !Number.isFinite(worldWidthTiles) || worldWidthTiles <= 0
      || !Number.isFinite(worldHeightTiles) || worldHeightTiles <= 0
      || typeof getTileType !== "function") {
      throw new TypeError("O ambiente físico do ser é inválido.");
    }

    const canAct = this.#energyUnits > 0;
    const effectiveSpeed = canAct ? action.speed : 0;
    const effectiveTurn = canAct ? action.turn : 0;
    let direction = this.#directionRadians
      + (effectiveTurn * movement.maxTurnDegreesPerSecond * Math.PI / 180 * dtSeconds);
    const distance = effectiveSpeed * movement.maxSpeedTilesPerSecond * dtSeconds;
    const reflectedX = reflectAxis(this.#x + (Math.cos(direction) * distance), worldWidthTiles);
    const reflectedY = reflectAxis(this.#y + (Math.sin(direction) * distance), worldHeightTiles);

    if (reflectedX.reflected) {
      direction = Math.PI - direction;
    }
    if (reflectedY.reflected) {
      direction = -direction;
    }

    this.#x = quantize(reflectedX.position, POSITION_DECIMALS);
    this.#y = quantize(reflectedY.position, POSITION_DECIMALS);
    this.#directionRadians = normalizeDirection(direction);
    this.#speed = quantize(effectiveSpeed, POSITION_DECIMALS);
    this.#turn = quantize(effectiveTurn, POSITION_DECIMALS);

    const tileType = getTileType(this.#x, this.#y);
    if (tileType !== "land" && tileType !== "water") {
      throw new RangeError("O ambiente retornou um tipo de tile inválido.");
    }
    const terrainMultiplier = tileType === "water" ? water.movementCostMultiplier : 1;
    const costPerSecond = energy.basalMetabolismPerSecond
      + (movement.costCoefficient
        * (Math.abs(effectiveSpeed) ** movement.costExponent)
        * terrainMultiplier)
      + (movement.turnCostAtMaxPerSecond * Math.abs(effectiveTurn));
    const costUnits = toStateUnits(costPerSecond * dtSeconds, "O custo energético do tick");
    this.#energyUnits = Math.max(0, this.#energyUnits - costUnits);
    this.#snapshot = null;
  }

  createConsumptionRequest(foods, foodConfig, dtSeconds) {
    if (!this.#alive) {
      this.#setFeedingFoodId(null);
      return null;
    }

    const startThresholdUnits = toStateUnits(
      foodConfig.feedingStartEnergyThreshold,
      "O limiar para iniciar a alimentação",
    );
    let targetFood = this.#feedingFoodId === null
      ? null
      : findFoodWithinDistance({
        foods,
        x: this.#x,
        y: this.#y,
        maxDistanceTiles: foodConfig.eatDistanceTiles,
        foodId: this.#feedingFoodId,
      });

    if (this.#feedingFoodId !== null
      && (targetFood === null || this.#energyUnits >= this.#maxEnergyUnits)) {
      this.#setFeedingFoodId(null);
    }

    if (targetFood === null) {
      if (this.#energyUnits >= startThresholdUnits) {
        return null;
      }
      targetFood = findFoodWithinDistance({
        foods,
        x: this.#x,
        y: this.#y,
        maxDistanceTiles: foodConfig.eatDistanceTiles,
      });
      if (targetFood === null) {
        return null;
      }
      this.#setFeedingFoodId(targetFood.id);
    }

    const perTickUnits = toStateUnits(
      foodConfig.maxConsumptionPerSecond * dtSeconds,
      "O consumo por tick",
    );
    const requestedUnits = Math.min(perTickUnits, this.#maxEnergyUnits - this.#energyUnits);
    if (requestedUnits <= 0) {
      this.#setFeedingFoodId(null);
      return null;
    }

    return Object.freeze({
      beingId: this.#id,
      foodId: targetFood.id,
      requestedEnergy: fromStateUnits(requestedUnits),
    });
  }

  applyConsumptionGrant({ foodId, energy }) {
    if (!this.#alive) {
      return;
    }
    if (!Number.isSafeInteger(foodId) || foodId <= 0 || foodId !== this.#feedingFoodId) {
      throw new RangeError("A concessão de energia não pertence à refeição ativa.");
    }
    const receivedUnits = toStateUnits(energy, "A energia recebida");
    if (receivedUnits > this.#maxEnergyUnits - this.#energyUnits) {
      throw new RangeError("A concessão de energia excede a capacidade do ser.");
    }
    this.#energyUnits += receivedUnits;
    this.#absorbedEnergyUnits += receivedUnits;
    if (this.#energyUnits === this.#maxEnergyUnits) {
      this.#setFeedingFoodId(null);
    }
    this.#snapshot = null;
  }

  reconcileFeedingTarget(foods, foodConfig) {
    if (this.#feedingFoodId === null) {
      return;
    }
    const targetFood = findFoodWithinDistance({
      foods,
      x: this.#x,
      y: this.#y,
      maxDistanceTiles: foodConfig.eatDistanceTiles,
      foodId: this.#feedingFoodId,
    });
    if (!this.#alive || this.#energyUnits >= this.#maxEnergyUnits || targetFood === null) {
      this.#setFeedingFoodId(null);
    }
  }

  finishTick({ life, healing }) {
    if (!this.#alive) {
      return;
    }

    this.#ageTicks += 1;
    if (this.#energyUnits === 0) {
      const damageUnits = toStateUnits(
        life.zeroEnergyDamagePerSecond / this.#physicsHz,
        "O dano de fome por tick",
      );
      this.#lifeUnits = Math.max(0, this.#lifeUnits - damageUnits);
    } else {
      const thresholdUnits = toStateUnits(healing.energyThreshold, "O limiar de cura");
      if (this.#energyUnits > thresholdUnits && this.#lifeUnits < this.#maxLifeUnits) {
        const rateLimitUnits = toStateUnits(
          healing.maxLifePerSecond / this.#physicsHz,
          "A cura máxima por tick",
        );
        const energyLimitedUnits = Math.floor(
          (this.#energyUnits - thresholdUnits) / healing.energyPerLife,
        );
        const healedUnits = Math.min(
          rateLimitUnits,
          energyLimitedUnits,
          this.#maxLifeUnits - this.#lifeUnits,
        );
        const energyCostUnits = Math.ceil(healedUnits * healing.energyPerLife);
        this.#lifeUnits += healedUnits;
        this.#energyUnits -= energyCostUnits;
      }
    }

    if (this.#lifeUnits === 0) {
      this.#alive = false;
      this.#setFeedingFoodId(null);
      this.#speed = 0;
      this.#turn = 0;
    }
    this.#snapshot = null;
  }

  getSnapshot() {
    if (this.#snapshot === null) {
      const ageSeconds = quantize(this.#ageTicks / this.#physicsHz, 6);
      const absorbedEnergy = fromStateUnits(this.#absorbedEnergyUnits);
      this.#snapshot = Object.freeze({
        id: this.#id,
        x: this.#x,
        y: this.#y,
        directionRadians: this.#directionRadians,
        speed: this.#speed,
        turn: this.#turn,
        life: fromStateUnits(this.#lifeUnits),
        energy: fromStateUnits(this.#energyUnits),
        ageSeconds,
        alive: this.#alive,
        isFeeding: this.#feedingFoodId !== null,
        feedingFoodId: this.#feedingFoodId,
        absorbedEnergy,
        fitness: quantize(ageSeconds + absorbedEnergy, 6),
        eyes: this.#eyes,
        underBodyEye: this.#underBodyEye,
        brain: this.#brain?.getSnapshot() ?? null,
      });
    }
    return this.#snapshot;
  }
}
