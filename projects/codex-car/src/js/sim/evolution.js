// Veículo controlado pela rede neural e evoluído pelo algoritmo genético.
class Vehicle {
  constructor(netConfig, brainData = null) {
    this.netConfig = netConfig;
    this.brainData = brainData ? cloneBrainData(brainData) : null;
    this.brain = this.brainData ? createModelFromBrainData(this.brainData) : createBrainModel(netConfig);
    if (!this.brainData) {
      // Para redes aleatórias da geração inicial, extraímos o snapshot uma vez
      // na criação do veículo e o reutilizamos nas sincronizações futuras.
      this.brainData = extractBrainData(this.brain, this.netConfig);
    }
    this.reset();
  }

  reset() {
    const start = state.track.start;
    this.pos = createVector(start.x, start.y);
    this.angle = start.angle;
    this.velocity = createVector(0, 0);
    this.speed = 0;
    this.worldSpeed = 0;
    this.accel = 0;
    this.steerAngle = 0;
    this.lateralSlip = 0;
    this.alive = true;
    this.deadReason = "";
    this.age = 0;
    this.stillAge = 0;
    this.lastProgressAge = 0;
    this.progress = 0;
    this.bestProgress = 0;
    this.fitness = 0;
    this.prevRawS = state.trackGeom ? state.trackGeom.startS : 0;
    this.projectedS = this.prevRawS;
    this.meanSpeedAccumulator = 0;
    this.maxFuel = PHYSICS.maxFuel;
    this.fuel = this.maxFuel;
    this.instantFuelConsumption = 0;
    this.sensorReadings = [];
    this.sensorHits = [];
    this.curvature = 0;
    this.collided = false;
    this.lastBrainInputs = [];
    this.lastBrainOutputs = [];
    this.weightSnapshotCache = "";
    this.weightSnapshotAt = -Infinity;
  }

  dispose() {
    if (this.brain) this.brain.dispose();
  }

  // Executa uma inferência da rede com as entradas do frame atual.
  buildBrainInputs() {
    return [
      clamp(this.speed / PHYSICS.inputSpeedReference, -1, 1),
      clamp(this.accel / PHYSICS.maxAccel, -1, 1),
      ...this.sensorReadings,
      this.curvature
    ];
  }

  captureBrainDebugSnapshot(inputs, outputs) {
    const captureDebug = shouldCaptureVehicleInspectionDebug(this);
    if (captureDebug) {
      this.lastBrainInputs = inputs.slice();
      this.lastBrainOutputs = outputs.slice();
    } else if (this.lastBrainInputs.length || this.lastBrainOutputs.length || this.weightSnapshotCache) {
      clearVehicleInspectionDebugSnapshot(this);
    }
  }

  runBrainInference(inputs) {
    return profilerMeasure("vehicle.think", () => {
      const outputs = tf.tidy(() => {
        const tensor = tf.tensor2d([inputs]);
        const output = this.brain.predict(tensor);
        return Array.from(output.dataSync());
      });
      this.captureBrainDebugSnapshot(inputs, outputs);
      return outputs;
    });
  }

  prepareStepInputs(dt) {
    if (!this.alive) return null;
    this.age += dt;
    this.sense();
    this.estimateCurvature();
    return this.buildBrainInputs();
  }

  estimateCurrentFitness(gaConfig) {
    const avgSpeed = this.age > 0 ? this.meanSpeedAccumulator / this.age : 0;
    let score = 0;
    score += Math.max(0, this.bestProgress) * gaConfig.progressBonus;
    score += avgSpeed * gaConfig.speedBonus;
    score += this.age * 2.5;
    if (this.collided) score -= gaConfig.collisionPenalty;
    return Math.max(0.01, score);
  }

  getWeightSnapshot() {
    return profilerMeasure("ui.getWeightSnapshot", () => {
      const now = typeof millis === "function" ? millis() : Date.now();
      if (this.weightSnapshotCache && now - this.weightSnapshotAt < 250) {
        return this.weightSnapshotCache;
      }

      const tensors = this.brain.getWeights();
      const sections = tensors.map((tensor, index) => {
        const values = Array.from(tensor.dataSync()).map(value => formatNumber(value, 3)).join(", ");
        return `L${index} shape=[${tensor.shape.join("x")}]\n${values}`;
      });
      // Aqui não descartamos os tensores retornados por getWeights():
      // para este modelo eles continuam ligados aos pesos ativos e fazer dispose()
      // quebraria as próximas inferências ao passar o mouse.

      this.weightSnapshotCache = sections.join("\n\n");
      this.weightSnapshotAt = now;
      profilerObserveMax("hover.weightSnapshotBytes", this.weightSnapshotCache.length * 2);
      return this.weightSnapshotCache;
    });
  }

  // Lê os sensores de distância para as paredes.
  sense() {
    profilerMeasure("vehicle.sense", () => {
      this.sensorReadings = [];
      this.sensorHits = [];
      for (const relAngle of this.netConfig.sensorAngles) {
        const worldAngle = this.angle + relAngle;
        const hit = nearestRayDistance(this.pos, worldAngle, state.trackGeom.walls, PHYSICS.sensorRange);
        this.sensorReadings.push(clamp(hit.distance / PHYSICS.sensorRange, 0, 1));
        this.sensorHits.push(hit.point);
      }
    });
  }

  estimateCurvature() {
    profilerMeasure("vehicle.estimateCurvature", () => {
      const geom = state.trackGeom;
      const projection = projectPointToClosedPolyline(this.pos, geom.centerline, geom.cumulative);
      this.projectedS = projection.s;

      // Curvatura aproximada:
      // 1. projetamos o carro no centro da pista;
      // 2. olhamos alguns pixels à frente nessa linha central;
      // 3. comparamos o heading atual do carro com a direção esperada do próximo trecho;
      // 4. a diferença angular assinada é normalizada para [-1, 1].
      const lookAheadDistance = 70;
      const expectedHeading = tangentOnClosedPath(geom.centerline, geom.cumulative, projection.s + lookAheadDistance);
      this.curvature = clamp(signedAngleDiff(expectedHeading, this.angle) / Math.PI, -1, 1);
    });
  }

  updateProgress() {
    profilerMeasure("vehicle.updateProgress", () => {
      const geom = state.trackGeom;
      const currentS = this.projectedS;
      const delta = wrapProgressDelta(currentS - this.prevRawS, geom.totalLength);
      this.prevRawS = currentS;

      // Trabalhamos em um circuito fechado, então o progresso precisa "dar a volta"
      // sem explodir quando o veículo cruza o final/início da pista.
      // Como a ordem da centerline já foi alinhada ao start.angle, delta positivo
      // representa avanço no sentido correto e delta negativo representa andar para trás.
      if (Math.abs(delta) < 120) {
        this.progress += delta;
        if (this.progress > this.bestProgress) {
          this.bestProgress = this.progress;
          this.lastProgressAge = this.age;
        }
      }
    });
  }

  kill(reason, collided = false) {
    this.alive = false;
    this.deadReason = reason;
    this.collided = collided;
  }

  applyBrainOutputs(dt, outputs) {
    if (!this.alive) return;
    const [throttle, steer] = outputs;
    const forward = createVector(Math.cos(this.angle), Math.sin(this.angle));
    const right = createVector(-forward.y, forward.x);
    const currentForwardSpeed = this.velocity.x * forward.x + this.velocity.y * forward.y;
    const currentLateralSpeed = this.velocity.x * right.x + this.velocity.y * right.y;
    const steerInput = clamp(steer, -1, 1);
    const throttleInput = clamp(throttle, -1, 1);
    const steerSpeedFactor = clamp(Math.abs(currentForwardSpeed) / PHYSICS.steeringReferenceSpeed, 0, 1);

    // Em baixa velocidade o carro esterça mais; em alta, o ângulo máximo de roda
    // cai para evitar curvas instantâneas irreais. Parado, o carro não gira.
    const maxSteerAngle = lerp(PHYSICS.lowSpeedSteerAngle, PHYSICS.highSpeedSteerAngle, steerSpeedFactor);
    this.steerAngle = steerInput * maxSteerAngle;
    const canTurn = Math.abs(currentForwardSpeed) >= PHYSICS.minTurningSpeed;
    const turnDirection = currentForwardSpeed >= 0 ? 1 : -0.7;
    const yawRate = canTurn
      ? clamp(
          (currentForwardSpeed / PHYSICS.wheelBase) * Math.tan(this.steerAngle),
          -PHYSICS.maxTurnRate,
          PHYSICS.maxTurnRate
        ) * turnDirection
      : 0;
    this.angle += yawRate * dt;

    this.accel = throttleInput * PHYSICS.maxAccel;
    const nextForwardSpeed = clamp(
      currentForwardSpeed + this.accel * dt - currentForwardSpeed * PHYSICS.friction * dt,
      -PHYSICS.maxReverseSpeed,
      PHYSICS.maxSpeed
    );

    // A componente lateral é amortecida pelo "grip" do pneu. Em alta velocidade,
    // especialmente com bastante esterço, reduzimos esse grip para permitir uma
    // pequena derrapagem lateral em vez de um trilho perfeito.
    const speedGripFactor = clamp(Math.abs(currentForwardSpeed) / PHYSICS.steeringReferenceSpeed, 0, 1);
    const baseGrip = lerp(PHYSICS.lowSpeedLateralGrip, PHYSICS.highSpeedLateralGrip, speedGripFactor);
    const steerGripPenalty = Math.abs(steerInput) * PHYSICS.driftGripPenalty;
    const lateralGrip = Math.max(0.4, baseGrip * (1 - steerGripPenalty));
    const nextLateralSpeed = currentLateralSpeed * Math.max(0, 1 - lateralGrip * dt);

    const nextForward = createVector(Math.cos(this.angle), Math.sin(this.angle));
    const nextRight = createVector(-nextForward.y, nextForward.x);
    this.velocity = p5.Vector.add(
      p5.Vector.mult(nextForward, nextForwardSpeed),
      p5.Vector.mult(nextRight, nextLateralSpeed)
    );

    this.speed = nextForwardSpeed;
    this.worldSpeed = this.velocity.mag();
    this.lateralSlip = nextLateralSpeed;
    this.pos.add(p5.Vector.mult(this.velocity, dt));

    // O consumo instantâneo responde à velocidade e ao esforço longitudinal.
    // Assim carros rápidos ou acelerando/freando forte queimam mais combustível.
    const speedFactor = clamp(this.worldSpeed / PHYSICS.fuelSpeedReference, 0, 1);
    const accelFactor = clamp(Math.abs(this.accel) / PHYSICS.maxAccel, 0, 1);
    this.instantFuelConsumption =
      PHYSICS.fuelBaseBurn +
      speedFactor * PHYSICS.fuelSpeedBurn +
      accelFactor * PHYSICS.fuelAccelBurn;
    this.fuel = Math.max(0, this.fuel - this.instantFuelConsumption * dt);
    if (this.fuel <= 0) {
      this.kill("sem combustível");
      return;
    }

    this.meanSpeedAccumulator += this.worldSpeed * dt;
    this.updateProgress();

    if (this.worldSpeed < 5) {
      this.stillAge += dt;
    } else {
      this.stillAge = 0;
    }

    const insideTrack = state.trackGeom.contains(this.pos);
    const minWallDistance = minDistanceToWalls(this.pos, state.trackGeom.walls);
    if (!insideTrack || minWallDistance <= PHYSICS.carRadius) {
      this.kill("colisão", true);
      return;
    }

    if (this.stillAge > PHYSICS.stallSeconds) {
      this.kill("parado");
      return;
    }

    if (this.age - this.lastProgressAge > PHYSICS.progressTimeout) {
      this.kill("sem progresso");
    }
  }

  // Fallback local: prepara entradas, roda a rede e aplica a física no main thread.
  update(dt) {
    if (!this.alive) return;
    profilerMeasure("vehicle.update.total", () => {
      const inputs = this.prepareStepInputs(dt);
      const outputs = this.runBrainInference(inputs);
      this.applyBrainOutputs(dt, outputs);
    });
  }

  computeFitness(gaConfig) {
    return profilerMeasure("ga.computeFitness", () => {
      const avgSpeed = this.age > 0 ? this.meanSpeedAccumulator / this.age : 0;
      let score = 0;
      score += Math.max(0, this.bestProgress) * gaConfig.progressBonus;
      score += avgSpeed * gaConfig.speedBonus;
      score += this.age * 2.5;
      if (this.collided) score -= gaConfig.collisionPenalty;
      this.fitness = Math.max(0.01, score);
      return this.fitness;
    });
  }
}

// Libera os modelos TensorFlow.js da população atual.
function disposeVehicles() {
  clearVehicleInspectionState();
  state.sim.vehicles.forEach(vehicle => vehicle.dispose());
  state.sim.vehicles = [];
}

// Cria a geração inicial usando, se houver, uma rede semente compatível.
function createInitialPopulation() {
  if (!state.trackGeom) {
    setStatus("A pista precisa ter paredes interna e externa fechadas antes de iniciar.", "error");
    return false;
  }

  const netConfig = readNetConfig();
  const gaConfig = readGaConfig();
  const signature = netSignature(netConfig);
  const seeds = [];
  const compatibleSeed =
    state.sim.seedBrainData && signature === brainDataSignature(state.sim.seedBrainData)
      ? cloneBrainData(state.sim.seedBrainData)
      : null;

  if (compatibleSeed) {
    seeds.push(compatibleSeed);
  }
  if (compatibleSeed && seeds.length < gaConfig.populationSize) {
    const variant = mutateBrainData(
      cloneBrainData(compatibleSeed),
      gaConfig.mutationRate,
      gaConfig.mutationStrength
    );
    seeds.push(variant);
  }

  while (seeds.length < gaConfig.populationSize) {
    seeds.push(null);
  }

  profilerMeasure("ga.createInitialPopulation.models", () => {
    disposeVehicles();
    state.sim.vehicles = seeds.map(brainData => new Vehicle(netConfig, brainData));
    state.sim.populationVersion += 1;
  });
  state.sim.signature = signature;
  state.sim.elapsed = 0;
  state.sim.generation = 1;
  state.sim.lastSummary = null;
  state.sim.architectureChangedNotice = false;
  profilerStartGeneration(state.sim.generation);
  renderHistory();
  setStatus("População criada. A geração 1 já está pronta para evoluir.", "success");
  return true;
}

function selectParent(pool) {
  return profilerMeasure("ga.selectParent", () => {
    const total = pool.reduce((sum, item) => sum + item.fitness, 0) || 1;
    let roll = Math.random() * total;
    for (const item of pool) {
      roll -= item.fitness;
      if (roll <= 0) return item;
    }
    return pool[pool.length - 1];
  });
}

// Fecha a geração, calcula fitness e produz a próxima população.
function finishGeneration(forceStep = false) {
  if (state.sim.vehicles.length === 0) {
    createInitialPopulation();
    updateStats();
    return;
  }

  // O fitness é calculado no final da geração; em seguida aplicamos elitismo,
  // seleção probabilística, crossover e mutação para montar a próxima população.
  const gaConfig = readGaConfig();
  const netConfig = readNetConfig();
  const currentSignature = netSignature(netConfig);
  const previousBestEver = state.sim.bestEverFitness;
  const scored = profilerMeasure("ga.scorePopulation", () => state.sim.vehicles.map(vehicle => ({
    vehicle,
    fitness: vehicle.computeFitness(gaConfig),
    bestProgress: vehicle.bestProgress,
    avgSpeed: vehicle.age > 0 ? vehicle.meanSpeedAccumulator / vehicle.age : 0,
    brainData: vehicle.brainData
  })));

  profilerMeasure("ga.sortPopulation", () => {
    scored.sort((a, b) => b.fitness - a.fitness);
  });
  const best = scored[0];
  const avgFitness = scored.reduce((sum, item) => sum + item.fitness, 0) / scored.length;
  state.sim.bestEverFitness = Math.max(state.sim.bestEverFitness, best.fitness);
  state.sim.lastGenerationSnapshot = createGenerationSnapshot(scored, best, avgFitness);
  state.sim.lastSummary = {
    bestFitness: best.fitness,
    avgFitness,
    bestProgress: best.bestProgress,
    alive: 0,
    elapsed: state.sim.elapsed
  };
  state.sim.bestStopMarker = {
    generation: state.sim.generation,
    x: best.vehicle.pos.x,
    y: best.vehicle.pos.y,
    age: best.vehicle.age,
    bestProgress: best.bestProgress,
    fitness: best.fitness,
    deadReason: best.vehicle.deadReason || (best.vehicle.alive ? "fim da geração" : "parou")
  };
  state.sim.history.push({
    generation: state.sim.generation,
    avgFitness,
    bestFitness: best.fitness
  });
  if (state.sim.history.length > HISTORY_LIMIT) {
    state.sim.history.splice(0, state.sim.history.length - HISTORY_LIMIT);
  }
  renderBatchPreview();
  renderHistory();
  state.sim.bestBrainData = cloneBrainData(best.brainData);
  if (!state.ui.bestBrainJson.value || best.fitness > previousBestEver) {
    state.ui.bestBrainJson.value = JSON.stringify(state.sim.bestBrainData, null, 2);
  }
  profilerFinishGeneration({
    bestFitness: best.fitness,
    avgFitness,
    elapsedSeconds: state.sim.elapsed,
    populationSize: scored.length
  });

  if (currentSignature !== state.sim.signature) {
    disposeVehicles();
    state.sim.signature = "";
    state.sim.running = false;
    state.sim.paused = true;
    state.sim.architectureChangedNotice = true;
    updateStats();
    setStatus("A arquitetura da rede mudou durante a execução. Reinicie a evolução para criar uma população compatível.", "error");
    return;
  }

  const eliteCount = clamp(Math.round(gaConfig.populationSize * gaConfig.elitism), 0, gaConfig.populationSize - 1);
  const nextBrains = [];

  for (let i = 0; i < eliteCount; i++) {
    nextBrains.push(cloneBrainData(scored[i].brainData));
  }

  while (nextBrains.length < gaConfig.populationSize) {
    const parentA = selectParent(scored);
    let child = cloneBrainData(parentA.brainData);
    if (Math.random() < gaConfig.crossoverRate) {
      const parentB = selectParent(scored);
      child = crossoverBrainData(parentA.brainData, parentB.brainData);
    }
    mutateBrainData(child, gaConfig.mutationRate, gaConfig.mutationStrength);
    nextBrains.push(child);
  }

  profilerMeasure("ga.spawnNextGeneration", () => {
    disposeVehicles();
    state.sim.vehicles = nextBrains.map(data => new Vehicle(netConfig, data));
    state.sim.populationVersion += 1;
  });
  state.sim.elapsed = 0;
  state.sim.generation += 1;
  state.sim.lastSummary = null;
  profilerStartGeneration(state.sim.generation);

  if (forceStep) {
    state.sim.running = false;
    state.sim.paused = true;
  }

  updateStats();
  setStatus(
    `Geração ${state.sim.generation - 1} concluída. Melhor fitness: ${formatNumber(best.fitness, 1)} | média: ${formatNumber(avgFitness, 1)} | ritmo: ${formatSimulationRate(state.sim.avgObservedStepsPerSecond, 1)}.`,
    "success"
  );
}

function startSimulation() {
  if (!state.trackGeom) {
    setStatus("Desenhe uma pista válida antes de iniciar.", "error");
    return;
  }
  setMapEditorEnabled(false);
  if (state.sim.vehicles.length === 0) {
    const created = createInitialPopulation();
    if (!created) return;
  }
  resetSimulationClock(Date.now());
  resetSimulationCadence(performance.now());
  if (!state.profiler.current || state.profiler.current.generation !== state.sim.generation) {
    profilerStartGeneration(state.sim.generation);
  }
  state.sim.running = true;
  state.sim.paused = false;
  if (state.sim.mode === SIMULATION_MODES.event) {
    scheduleFastSimulationLoop();
  }
  setStatus(
    state.sim.mode === SIMULATION_MODES.event
      ? "Simulador de eventos ativo. A evolução está avançando o mais rápido possível."
      : "Evolução em andamento. Observe o melhor veículo e a tendência do fitness.",
    "success"
  );
}

function resetEvolution() {
  clearVehicleInspectionState();
  disposeVehicles();
  state.profiler.current = null;
  state.sim.running = false;
  state.sim.paused = false;
  resetSimulationClock(Date.now());
  state.sim.fastLoopScheduled = false;
  state.sim.fastLoopRunning = false;
  state.sim.realtimeAdvanceRunning = false;
  state.sim.queuedRealtimeTickNowMs = 0;
  state.sim.generation = 0;
  state.sim.populationVersion = 0;
  state.sim.elapsed = 0;
  state.sim.lastSummary = null;
  state.sim.history = [];
  state.sim.lastGenerationSnapshot = null;
  state.sim.bestStopMarker = null;
  state.sim.avgStepWallMs = 0;
  state.sim.lastStepWallMs = 0;
  state.sim.avgObservedStepsPerSecond = 0;
  state.sim.lastObservedStepsPerSecond = 0;
  state.sim.cadenceWindowStartedAtMs = 0;
  state.sim.cadenceWindowSteps = 0;
  state.sim.signature = "";
  state.sim.architectureChangedNotice = false;
  state.sim.inference.syncedPopulationKey = "";
  renderBatchPreview();
  renderHistory();
  updateStats();
  setStatus("Evolução reiniciada. A pista foi mantida e os pesos anteriores foram descartados.", "info");
}

// Avança um step lógico da simulação.
async function updateSimulation(dt, skipStats = false) {
  if (!state.sim.running || state.sim.paused || state.sim.vehicles.length === 0) return;

  const stepWallStart = performance.now();
  const gaConfig = readGaConfig();
  state.sim.elapsed += dt;
  let aliveCount = 0;
  profilerIncrement("simulation.steps");
  const inferenceRequests = [];
  profilerMeasure("simulation.vehiclePrepare", () => {
    for (let index = 0; index < state.sim.vehicles.length; index++) {
      const vehicle = state.sim.vehicles[index];
      if (!vehicle.alive) continue;
      const inputs = vehicle.prepareStepInputs(dt);
      inferenceRequests.push({ index, vehicle, inputs });
    }
  });
  const vehicleLoopStart = performance.now();
  const inferenceResults = await runVehicleInferenceBatch(inferenceRequests);
  profilerRecordTiming("simulation.vehicleInferenceDispatch", performance.now() - vehicleLoopStart);
  profilerMeasure("simulation.vehicleApply", () => {
    for (const result of inferenceResults) {
      if (result.usedWorker) {
        result.vehicle.captureBrainDebugSnapshot(result.inputs, result.outputs);
      }
      result.vehicle.applyBrainOutputs(dt, result.outputs);
      if (result.vehicle.alive) aliveCount += 1;
    }
  });
  profilerRecordTiming("simulation.vehicleLoop", performance.now() - vehicleLoopStart);
  profilerSampleGenerationState(aliveCount, "step");
  profilerRecordTiming("simulation.step.total", performance.now() - stepWallStart);

  if (aliveCount === 0 || state.sim.elapsed >= gaConfig.maxGenerationTime) {
    finishGeneration(false);
  } else if (!skipStats) {
    profilerMeasure("ui.updateStats", () => {
      updateStats();
    });
  }
}
