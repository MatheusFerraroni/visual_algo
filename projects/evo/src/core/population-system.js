import { Being } from "./being.js";
import { EyeSensor } from "./eye-sensor.js";
import { findFoodWithinDistance } from "./food-proximity.js";
import { GenerationInitializer } from "./generation-initializer.js";
import { NeuralController } from "./neural-controller.js";
import { createNeuralInputSchema } from "./neural-input-schema.js";
import { NeuralNetwork } from "./neural-network.js";
import { SeededRandom } from "./seeded-random.js";
import { NOOP_PERFORMANCE_PROFILER } from "../debug/performance-profiler.js";

function quantize(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export class PopulationSystem {
  #config;
  #worldMap;
  #beings;
  #beingsById;
  #eyeSensor;
  #inputSchema;
  #profiler;
  #lastProcessedTick = 0;
  #snapshot = null;
  #summary = null;

  constructor({
    worldMap,
    config,
    generation,
    mapSeed,
    simulationSeed,
    initialFoods = [],
    initialGenomes = null,
    profiler = NOOP_PERFORMANCE_PROFILER,
    stageGroup = "execution",
  }) {
    if (!worldMap || typeof worldMap.getSnapshot !== "function"
      || typeof worldMap.getMainIslandTiles !== "function") {
      throw new TypeError("PopulationSystem exige um WorldMap válido.");
    }
    if (!config || !config.population || !config.being || !config.eyes || !config.network) {
      throw new TypeError("PopulationSystem exige uma configuração válida.");
    }
    if (!Array.isArray(initialFoods)) {
      throw new TypeError("PopulationSystem exige uma lista inicial de comidas.");
    }
    if (initialGenomes !== null) {
      if (!Array.isArray(initialGenomes)
        || initialGenomes.length !== config.population.size) {
        throw new RangeError(
          `PopulationSystem exige exatamente ${config.population.size} genomas iniciais.`,
        );
      }
      for (const [index, genome] of initialGenomes.entries()) {
        if (!Array.isArray(genome)
          || genome.length !== config.derived.networkGeneCount) {
          throw new RangeError(
            `O genoma inicial ${index + 1} deve conter ${config.derived.networkGeneCount} genes.`,
          );
        }
      }
    }

    const spawnStage = stageGroup === "execution"
      ? "execution.spawn-points"
      : "evolution.next-spawn-points";
    const spawnPoints = profiler.measure(spawnStage, () => (
      GenerationInitializer.createSpawnPoints({
        worldMap,
        mapSeed,
        generation,
        count: config.population.size,
      })
    ));
    const simulationRandom = SeededRandom.fromSeed(simulationSeed);
    const inputSchema = createNeuralInputSchema(config.eyes.count);

    this.#config = config;
    this.#worldMap = worldMap;
    this.#eyeSensor = new EyeSensor(config.eyes);
    this.#inputSchema = inputSchema;
    this.#profiler = profiler;
    const networksStage = stageGroup === "execution"
      ? "execution.networks"
      : "evolution.next-networks";
    this.#beings = profiler.measure(networksStage, () => spawnPoints.map((spawnPoint) => {
      const headingRandom = simulationRandom.fork(
        `generation:${generation}:being:${spawnPoint.id}:initial-heading`,
      );
      const networkOptions = {
        inputCount: config.derived.networkInputCount,
        hiddenLayers: config.network.hiddenLayers,
        outputCount: config.network.outputCount,
        activation: config.network.activation,
        geneMin: config.network.geneMin,
        geneMax: config.network.geneMax,
        quantizationDecimals: config.network.quantizationDecimals,
      };
      const network = initialGenomes === null
        ? NeuralNetwork.createRandom({
          ...networkOptions,
          random: simulationRandom.fork(
            `generation:${generation}:being:${spawnPoint.id}:initial-genome`,
          ),
          initialGeneMin: config.network.initialGeneMin,
          initialGeneMax: config.network.initialGeneMax,
        })
        : new NeuralNetwork({
          ...networkOptions,
          genome: initialGenomes[spawnPoint.id - 1],
        });
      return new Being({
        id: spawnPoint.id,
        x: spawnPoint.x,
        y: spawnPoint.y,
        directionRadians: headingRandom.nextRange(0, Math.PI * 2),
        config: config.being,
        physicsHz: config.time.physicsHz,
        brain: new NeuralController({ network }),
      });
    }));
    this.#beingsById = new Map(this.#beings.map((being) => [being.id, being]));
    const perceptionStage = stageGroup === "execution"
      ? "execution.initial-perception"
      : "evolution.next-perception";
    profiler.measure(perceptionStage, () => {
      for (const being of this.#beings) {
        this.#updatePerception(being, initialFoods, false, { profile: false });
      }
    });
  }

  processTick(completedTick, foodSystem) {
    if (!Number.isSafeInteger(completedTick) || completedTick !== this.#lastProcessedTick + 1) {
      throw new RangeError("PopulationSystem exige ticks inteiros, positivos e consecutivos.");
    }
    if (!foodSystem || typeof foodSystem.getSnapshot !== "function"
      || typeof foodSystem.resolveConsumption !== "function") {
      throw new TypeError("PopulationSystem exige um FoodSystem válido.");
    }

    const shouldDecide = completedTick === 1
      || (completedTick - 1) % this.#config.derived.brainIntervalTicks === 0;
    const foodSnapshot = foodSystem.getSnapshot();
    if (shouldDecide) {
      for (const being of this.#beings) {
        if (being.alive) {
          this.#updatePerception(being, foodSnapshot, true);
        }
      }
    }
    this.#profiler.measure("population.physics", () => {
      for (const being of this.#beings) {
        if (!being.alive) {
          continue;
        }
        const action = being.getBrainAction();
        being.applyAction(action, {
          dtSeconds: this.#config.derived.dtSeconds,
          worldWidthTiles: this.#config.world.columns,
          worldHeightTiles: this.#config.world.rows,
          getTileType: (x, y) => this.#getTileType(x, y),
          movement: this.#config.movement,
          energy: this.#config.energy,
          water: this.#config.water,
        });
      }
    });

    const requests = this.#profiler.measure("population.consumption-search", () => {
      const pending = [];
      for (const being of this.#beings) {
        const request = being.createConsumptionRequest(
          foodSnapshot,
          this.#config.food,
          this.#config.derived.dtSeconds,
        );
        if (request !== null) {
          pending.push(request);
        }
      }
      return pending;
    });
    const grants = foodSystem.resolveConsumption(requests);
    let currentFoods;
    this.#profiler.measure("population.apply-grants", () => {
      for (const grant of grants) {
        this.#beingsById.get(grant.beingId).applyConsumptionGrant(grant);
      }
      currentFoods = foodSystem.getSnapshot();
      for (const being of this.#beings) {
        being.reconcileFeedingTarget(currentFoods, this.#config.food);
      }
    });
    this.#profiler.measure("population.survival", () => {
      for (const being of this.#beings) {
        being.finishTick({
          life: this.#config.life,
          healing: this.#config.healing,
        });
      }
    });
    this.#profiler.measure("population.visual-sensors", () => {
      for (const being of this.#beings) {
        if (being.alive) {
          this.#refreshVisualPerception(being, currentFoods);
        }
      }
    });

    this.#lastProcessedTick = completedTick;
    this.#snapshot = null;
    this.#summary = null;
  }

  getSnapshot() {
    this.#buildSnapshotsIfNeeded();
    return this.#snapshot;
  }

  getSummary() {
    this.#buildSnapshotsIfNeeded();
    return this.#summary;
  }

  getGenome(beingId) {
    if (!Number.isSafeInteger(beingId) || beingId <= 0) {
      throw new TypeError("O ID do ser deve ser um inteiro seguro positivo.");
    }
    return this.#beingsById.get(beingId)?.getGenome() ?? null;
  }

  getInputSchema() {
    return this.#inputSchema;
  }

  getEvolutionCandidates() {
    return Object.freeze(this.#beings.map((being) => Object.freeze({
      id: being.id,
      fitness: being.getSnapshot().fitness,
      genome: being.getGenome(),
    })));
  }

  #getTileType(x, y) {
    const column = Math.min(this.#config.world.columns - 1, Math.max(0, Math.floor(x)));
    const row = Math.min(this.#config.world.rows - 1, Math.max(0, Math.floor(y)));
    return this.#worldMap.getTile(column, row).type;
  }

  #updatePerception(being, foods, decide, { profile = true } = {}) {
    const observe = () => {
      const { position, eyes, underBodyEye } = this.#observe(being, foods);
      const state = being.getSnapshot();
      const inputs = [];
      for (const eye of eyes) {
        inputs.push(eye.foodProximity, eye.boundaryProximity);
      }
      inputs.push(
        Number(findFoodWithinDistance({
          foods,
          x: position.x,
          y: position.y,
          maxDistanceTiles: this.#config.derived.foodSafeEatingDistanceTiles,
        }) !== null),
        Number(state.isFeeding),
      );
      inputs.push(
        state.energy / this.#config.being.maxEnergy,
        state.life / this.#config.being.maxLife,
        state.speed,
        underBodyEye.waterProximity,
      );
      return { eyes, underBodyEye, inputs };
    };
    const perception = profile
      ? this.#profiler.measure("population.decision-sensors", observe)
      : observe();
    const apply = () => being.setPerception(
      perception.eyes,
      perception.underBodyEye,
      perception.inputs,
      { decide },
    );
    return profile
      ? this.#profiler.measure("population.decision-neural", apply)
      : apply();
  }

  #refreshVisualPerception(being, foods) {
    const { eyes, underBodyEye } = this.#observe(being, foods);
    being.updateVisualPerception(eyes, underBodyEye);
  }

  #observe(being, foods) {
    const position = being.getPosition();
    return {
      position,
      eyes: this.#eyeSensor.observe({
        position,
        foods,
        worldMap: this.#worldMap,
      }),
      underBodyEye: this.#eyeSensor.observeUnderBody({
        position,
        worldMap: this.#worldMap,
      }),
    };
  }

  #buildSnapshotsIfNeeded() {
    if (this.#snapshot !== null) {
      return;
    }
    this.#profiler.measure("population.snapshot-build", () => {
      this.#snapshot = Object.freeze(this.#beings.map((being) => being.getSnapshot()));
    const aliveCount = this.#snapshot.reduce(
      (total, being) => total + Number(being.alive),
      0,
    );
    const aliveBeings = this.#snapshot.filter((being) => being.alive);
    const best = [...this.#snapshot].sort(
      (first, second) => (second.fitness - first.fitness) || (first.id - second.id),
    )[0];
    const bestAlive = this.#snapshot
      .filter((being) => being.alive)
      .sort(
        (first, second) => (second.fitness - first.fitness) || (first.id - second.id),
      )[0] ?? null;
    const meanFitness = quantize(
      this.#snapshot.reduce((total, being) => total + being.fitness, 0)
        / this.#snapshot.length,
      6,
    );
    const meanAliveValue = (selector) => aliveCount === 0
      ? null
      : quantize(
        aliveBeings.reduce((total, being) => total + selector(being), 0) / aliveCount,
        6,
      );
    const aliveInWaterCount = aliveBeings.reduce(
      (total, being) => total + Number(being.underBodyEye?.terrainType === "water"),
      0,
    );
      this.#summary = Object.freeze({
      total: this.#snapshot.length,
      aliveCount,
      cumulativeDeaths: this.#snapshot.length - aliveCount,
      bestBeingId: best.id,
      bestAliveBeingId: bestAlive?.id ?? null,
      bestFitness: best.fitness,
      meanFitness,
      meanAliveEnergy: meanAliveValue((being) => being.energy),
      meanAliveLife: meanAliveValue((being) => being.life),
      meanAliveAbsoluteSpeed: meanAliveValue((being) => Math.abs(being.speed)),
      aliveInWaterCount,
      aliveInWaterFraction: aliveCount === 0
        ? null
        : quantize(aliveInWaterCount / aliveCount, 6),
      });
    });
  }
}
