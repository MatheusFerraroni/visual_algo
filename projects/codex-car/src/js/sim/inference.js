// Pool de workers para executar inferências independentes fora da thread da UI.
function inferenceWorkersSupported() {
  return typeof Worker !== "undefined";
}

function desiredInferenceWorkerCount() {
  const cpuCount = Math.max(1, (navigator.hardwareConcurrency || 2) - 1);
  return clamp(cpuCount, 1, INFERENCE_MAX_WORKERS);
}

function currentInferencePopulationKey() {
  return `${state.sim.populationVersion}:${state.sim.generation}:${state.sim.vehicles.length}:${state.sim.signature}`;
}

function teardownInferenceWorkers(reason = "") {
  const inference = state.sim.inference;
  inference.available = false;
  inference.initializing = false;
  inference.syncedPopulationKey = "";
  inference.lastError = reason || inference.lastError;
  inference.workerCount = 0;

  for (const workerEntry of inference.workers) {
    for (const pending of workerEntry.pending.values()) {
      pending.reject(new Error(reason || "Worker de inferência encerrado."));
    }
    workerEntry.pending.clear();
    workerEntry.worker.terminate();
  }
  inference.workers = [];
}

function buildInferenceWorkerEntry(slot) {
  const worker = new Worker(INFERENCE_WORKER_SCRIPT_URL);
  const entry = {
    slot,
    worker,
    pending: new Map(),
    nextRequestId: 1
  };

  worker.onmessage = event => {
    const message = event.data || {};
    const pending = entry.pending.get(message.requestId);
    if (!pending) return;
    entry.pending.delete(message.requestId);
    if (message.ok) {
      pending.resolve(message);
    } else {
      pending.reject(new Error(message.error || "Falha no worker de inferência."));
    }
  };

  worker.onerror = event => {
    const reason = event?.message || `Worker ${slot} falhou.`;
    teardownInferenceWorkers(reason);
  };

  return entry;
}

function callInferenceWorker(workerEntry, type, payload = {}) {
  return new Promise((resolve, reject) => {
    const requestId = workerEntry.nextRequestId++;
    workerEntry.pending.set(requestId, { resolve, reject });
    workerEntry.worker.postMessage({
      type,
      requestId,
      ...payload
    });
  });
}

function inferenceTimeoutPromise(ms, message) {
  return new Promise((_, reject) => {
    window.setTimeout(() => {
      reject(new Error(message));
    }, ms);
  });
}

async function initializeInferenceWorkers() {
  const inference = state.sim.inference;
  if (inference.hardDisabled || inference.available) return inference.available;
  if (inference.failed && Date.now() < inference.retryAfterMs) {
    profilerIncrement("inference.workerRetryCooldownSkips");
    return false;
  }
  if (inference.failed && Date.now() >= inference.retryAfterMs) {
    profilerIncrement("inference.workerRetries");
    inference.failed = false;
  }
  if (!inferenceWorkersSupported()) {
    profilerIncrement("inference.workerUnsupported");
    inference.hardDisabled = true;
    inference.failed = true;
    inference.lastError = "Web Workers indisponíveis neste navegador.";
    return false;
  }
  if (inference.initPromise) {
    return inference.initPromise;
  }

  inference.initializing = true;
  inference.initPromise = (async () => {
    try {
      profilerIncrement("inference.workerInitAttempts");
      const count = desiredInferenceWorkerCount();
      inference.workers = Array.from({ length: count }, (_, slot) => buildInferenceWorkerEntry(slot));
      const responses = await Promise.race([
        Promise.all(
          inference.workers.map(workerEntry =>
            callInferenceWorker(workerEntry, "init", { tfjsUrl: TFJS_CDN_URL })
          )
        ),
        inferenceTimeoutPromise(
          INFERENCE_INIT_TIMEOUT_MS,
          `Workers de inferência não responderam em ${INFERENCE_INIT_TIMEOUT_MS} ms.`
        )
      ]);
      if (!Array.isArray(responses) || responses.length !== count) {
        throw new Error("Inicialização incompleta dos workers de inferência.");
      }
      inference.workers.forEach(workerEntry => {
        workerEntry.pending.clear();
      });
      inference.available = true;
      inference.failed = false;
      inference.hardDisabled = false;
      inference.workerCount = responses.length;
      inference.lastError = "";
      inference.retryAfterMs = 0;
      profilerIncrement("inference.workerInitSuccesses");
      profilerObserveMax("inference.workerCount", responses.length);
      return true;
    } catch (error) {
      profilerIncrement("inference.workerInitFailures");
      inference.failed = true;
      inference.lastError = error.message;
      inference.retryAfterMs = Date.now() + INFERENCE_RETRY_COOLDOWN_MS;
      teardownInferenceWorkers(error.message);
      return false;
    } finally {
      inference.initializing = false;
      inference.initPromise = null;
    }
  })();

  return inference.initPromise;
}

function warmupInferenceWorkersInBackground() {
  if (state.sim.inference.available || state.sim.inference.initializing) return;
  initializeInferenceWorkers().catch(error => {
    console.warn("Warmup dos workers de inferência falhou; seguindo com fallback local.", error);
  });
}

function buildInferencePopulationPayload() {
  return profilerMeasure("nn.collectInferencePopulationData", () =>
    state.sim.vehicles.map((vehicle, index) => ({
      index,
      brainData: vehicle.brainData
    }))
  );
}

async function syncInferencePopulation() {
  const inference = state.sim.inference;
  const initialized = await initializeInferenceWorkers();
  if (!initialized || !inference.available) return false;

  const population = buildInferencePopulationPayload();
  profilerIncrement("simulation.inference.syncCalls");
  profilerIncrement("simulation.inference.syncPopulationVehicles", population.length);
  profilerObserveMax("simulation.inference.syncPopulationVehicles", population.length);
  const assignments = inference.workers.map(() => []);
  for (const item of population) {
    assignments[item.index % inference.workers.length].push(item);
  }

  await profilerMeasureAsync("simulation.inference.sync", async () => {
    await Promise.all(
      inference.workers.map((workerEntry, index) =>
        callInferenceWorker(workerEntry, "syncPopulation", {
          population: assignments[index]
        })
      )
    );
  });

  inference.syncedPopulationKey = currentInferencePopulationKey();
  return true;
}

async function ensureInferencePopulationSynced() {
  const inference = state.sim.inference;
  const key = currentInferencePopulationKey();
  if (!inference.available) {
    const initialized = await initializeInferenceWorkers();
    if (!initialized) return false;
  }
  if (inference.syncedPopulationKey === key) return true;
  try {
    return await syncInferencePopulation();
  } catch (error) {
    console.warn("Falha ao sincronizar população para os workers de inferência:", error);
    inference.failed = true;
    inference.lastError = error.message;
    teardownInferenceWorkers(error.message);
    return false;
  }
}

function runLocalInferenceBatch(requests) {
  profilerIncrement("simulation.inference.localBatches");
  profilerIncrement("simulation.inference.localVehicles", requests.length);
  return profilerMeasure("simulation.inference.local", () =>
    requests.map(request => ({
      ...request,
      outputs: request.vehicle.runBrainInference(request.inputs),
      usedWorker: false
    }))
  );
}

async function runWorkerInferenceBatch(requests) {
  const inference = state.sim.inference;
  profilerIncrement("simulation.inference.workerBatches");
  profilerIncrement("simulation.inference.workerVehiclesRequested", requests.length);
  profilerObserveMax("simulation.inference.workerVehiclesRequested", requests.length);
  const assignments = inference.workers.map(() => []);
  for (const request of requests) {
    assignments[request.index % inference.workers.length].push({
      index: request.index,
      inputs: request.inputs
    });
  }

  const responses = await profilerMeasureAsync("simulation.inference.workers", async () =>
    Promise.all(
      inference.workers.map((workerEntry, index) => {
        const workerRequests = assignments[index];
        if (workerRequests.length === 0) {
          return Promise.resolve({ outputs: [] });
        }
        return callInferenceWorker(workerEntry, "infer", { requests: workerRequests });
      })
    )
  );

  const outputsByIndex = new Map();
  for (const response of responses) {
    for (const item of response.outputs || []) {
      outputsByIndex.set(item.index, item.outputs);
    }
  }
  profilerIncrement("simulation.inference.workerVehiclesResolved", outputsByIndex.size);
  profilerObserveMax("simulation.inference.workerVehiclesResolved", outputsByIndex.size);
  profilerIncrement(
    "simulation.inference.partialFallbackVehicles",
    Math.max(0, requests.length - outputsByIndex.size)
  );

  return requests.map(request => ({
    ...request,
    outputs: outputsByIndex.get(request.index) || request.vehicle.runBrainInference(request.inputs),
    usedWorker: outputsByIndex.has(request.index)
  }));
}

async function runVehicleInferenceBatch(requests) {
  return profilerMeasureAsync("simulation.inference.total", async () => {
    if (requests.length === 0) return [];

    const synced = await ensureInferencePopulationSynced();
    if (!synced || !state.sim.inference.available) {
      profilerIncrement("simulation.inference.unavailableFallbackBatches");
      profilerIncrement("simulation.inference.unavailableFallbackVehicles", requests.length);
      return runLocalInferenceBatch(requests);
    }

    try {
      return await runWorkerInferenceBatch(requests);
    } catch (error) {
      console.warn("Workers de inferência falharam; voltando para inferência local.", error);
      profilerIncrement("simulation.inference.workerFailureFallbackBatches");
      profilerIncrement("simulation.inference.workerFailureFallbackVehicles", requests.length);
      state.sim.inference.failed = true;
      state.sim.inference.lastError = error.message;
      teardownInferenceWorkers(error.message);
      return runLocalInferenceBatch(requests);
    }
  });
}
