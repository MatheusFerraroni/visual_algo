// Perfilador simples por geração para localizar gargalos e crescimento de memória.
function profilerIsEnabled() {
  return state.profiler.enabled;
}

function profilerNow() {
  return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
}

function profilerHeapBytes() {
  if (typeof performance === "undefined" || !performance.memory) return null;
  return performance.memory.usedJSHeapSize || null;
}

function profilerBytesFromJson(value) {
  try {
    return JSON.stringify(value).length * 2;
  } catch (_error) {
    return null;
  }
}

function profilerFormatMs(value) {
  return Number(value || 0).toFixed(3);
}

function profilerFormatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes === null) return "n/d";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// Cria um snapshot vazio de métricas para a geração atual.
function profilerCreateGeneration(generation) {
  const heap = profilerHeapBytes();
  return {
    generation,
    startedAtMs: profilerNow(),
    simulationElapsedStart: state.sim.elapsed,
    timings: {},
    counters: {},
    maxima: {},
    lastSizes: {},
    sampling: {
      count: 0,
      lastAtMs: 0
    },
    heap: {
      startBytes: heap,
      endBytes: heap,
      peakBytes: heap
    }
  };
}

function profilerStartGeneration(generation) {
  if (!profilerIsEnabled()) return;
  state.profiler.current = profilerCreateGeneration(generation);
}

function profilerRecordTiming(name, elapsedMs) {
  if (!profilerIsEnabled() || !state.profiler.current) return;
  const bucket = state.profiler.current.timings[name] || {
    name,
    totalMs: 0,
    calls: 0,
    maxMs: 0
  };
  bucket.totalMs += elapsedMs;
  bucket.calls += 1;
  bucket.maxMs = Math.max(bucket.maxMs, elapsedMs);
  state.profiler.current.timings[name] = bucket;
}

// Mede uma função e acumula o tempo na seção informada.
function profilerMeasure(name, fn) {
  if (!profilerIsEnabled() || !state.profiler.current) {
    return fn();
  }
  const startedAt = profilerNow();
  try {
    return fn();
  } finally {
    profilerRecordTiming(name, profilerNow() - startedAt);
  }
}

async function profilerMeasureAsync(name, fn) {
  if (!profilerIsEnabled() || !state.profiler.current) {
    return await fn();
  }
  const startedAt = profilerNow();
  try {
    return await fn();
  } finally {
    profilerRecordTiming(name, profilerNow() - startedAt);
  }
}

function profilerIncrement(name, amount = 1) {
  if (!profilerIsEnabled() || !state.profiler.current) return;
  state.profiler.current.counters[name] = (state.profiler.current.counters[name] || 0) + amount;
}

function profilerObserveMax(name, value) {
  if (!profilerIsEnabled() || !state.profiler.current || !Number.isFinite(value)) return;
  state.profiler.current.maxima[name] = Math.max(
    state.profiler.current.maxima[name] || 0,
    value
  );
}

function profilerSetSize(name, value) {
  if (!profilerIsEnabled() || !state.profiler.current) return;
  state.profiler.current.lastSizes[name] = value;
}

function profilerCounterValue(name) {
  if (!profilerIsEnabled() || !state.profiler.current) return 0;
  return state.profiler.current.counters[name] || 0;
}

function profilerTrackHeap() {
  if (!profilerIsEnabled() || !state.profiler.current) return;
  const heap = profilerHeapBytes();
  if (!Number.isFinite(heap)) return;
  state.profiler.current.heap.endBytes = heap;
  state.profiler.current.heap.peakBytes = Math.max(state.profiler.current.heap.peakBytes || 0, heap);
}

function profilerEstimateBrainDataWeightCount(brainData) {
  if (!brainData || !Array.isArray(brainData.weights)) return 0;
  return brainData.weights.reduce((sum, layer) => {
    const shapeProduct = Array.isArray(layer.shape)
      ? layer.shape.reduce((product, dimension) => product * dimension, 1)
      : 0;
    return sum + shapeProduct;
  }, 0);
}

// Amostra tamanhos e contagens sem fazer isso em todo frame.
function profilerSampleGenerationState(aliveCount = null, reason = "step") {
  if (!profilerIsEnabled() || !state.profiler.current) return;
  const current = state.profiler.current;
  const now = profilerNow();
  const minGapMs = 250;
  if (reason === "step" && current.sampling.lastAtMs && now - current.sampling.lastAtMs < minGapMs) {
    return;
  }
  current.sampling.lastAtMs = now;
  current.sampling.count += 1;

  const alive = Number.isFinite(aliveCount)
    ? aliveCount
    : state.sim.vehicles.reduce((sum, vehicle) => sum + (vehicle.alive ? 1 : 0), 0);
  const totalVehicles = state.sim.vehicles.length;
  const totalSensorHits = state.sim.vehicles.reduce((sum, vehicle) => sum + vehicle.sensorHits.length, 0);
  const totalSensorReadings = state.sim.vehicles.reduce((sum, vehicle) => sum + vehicle.sensorReadings.length, 0);
  const totalWeightCacheBytes = state.sim.vehicles.reduce(
    (sum, vehicle) => sum + ((vehicle.weightSnapshotCache || "").length * 2),
    0
  );
  const totalStoredDebugInputs = state.sim.vehicles.reduce((sum, vehicle) => sum + vehicle.lastBrainInputs.length, 0);
  const totalStoredDebugOutputs = state.sim.vehicles.reduce((sum, vehicle) => sum + vehicle.lastBrainOutputs.length, 0);
  const activeDebugVehicleCount = state.sim.vehicles.reduce((sum, vehicle) => (
    sum + (
      vehicle.lastBrainInputs.length ||
      vehicle.lastBrainOutputs.length ||
      vehicle.weightSnapshotCache
        ? 1
        : 0
    )
  ), 0);
  const sampleVehicle = state.sim.vehicles[0] || null;
  const modelInputWidth = sampleVehicle ? (sampleVehicle.netConfig.sensorAngles.length + 3) : 0;
  const modelOutputWidth = 2;

  profilerObserveMax("vehicles.total", totalVehicles);
  profilerObserveMax("vehicles.alive", alive);
  profilerObserveMax("sensors.hitsTotal", totalSensorHits);
  profilerObserveMax("sensors.readingsTotal", totalSensorReadings);
  profilerObserveMax("nn.debugInputsStoredTotal", totalStoredDebugInputs);
  profilerObserveMax("nn.debugOutputsStoredTotal", totalStoredDebugOutputs);
  profilerObserveMax("inspect.debugVehicles", activeDebugVehicleCount);
  profilerObserveMax("hover.weightCacheBytes", totalWeightCacheBytes);
  profilerObserveMax("history.entries", state.sim.history.length);
  profilerObserveMax("generation.elapsedSimSeconds", state.sim.elapsed);

  profilerSetSize("aliveVehicles", alive);
  profilerSetSize("totalVehicles", totalVehicles);
  profilerSetSize("historyEntries", state.sim.history.length);
  profilerSetSize("sensorHitsTotal", totalSensorHits);
  profilerSetSize("weightCacheBytes", totalWeightCacheBytes);
  profilerSetSize("nnModelInputWidth", modelInputWidth);
  profilerSetSize("nnModelOutputWidth", modelOutputWidth);
  profilerSetSize("nnDebugInputsStoredTotal", totalStoredDebugInputs);
  profilerSetSize("nnDebugOutputsStoredTotal", totalStoredDebugOutputs);
  profilerSetSize("inspectDebugVehicles", activeDebugVehicleCount);
  profilerTrackHeap();
}

function profilerBuildInferenceMeta() {
  const workerVehicles = profilerCounterValue("simulation.inference.workerVehiclesRequested");
  const localVehicles = profilerCounterValue("simulation.inference.localVehicles");
  const partialFallbackVehicles = profilerCounterValue("simulation.inference.partialFallbackVehicles");
  const unavailableFallbackVehicles = profilerCounterValue("simulation.inference.unavailableFallbackVehicles");
  const workerFailureFallbackVehicles = profilerCounterValue("simulation.inference.workerFailureFallbackVehicles");

  return {
    workersUsed: workerVehicles > 0,
    localUsed: localVehicles > 0,
    mixedBackends: workerVehicles > 0 && localVehicles > 0,
    workerVehicles,
    localVehicles,
    partialFallbackVehicles,
    unavailableFallbackVehicles,
    workerFailureFallbackVehicles,
    syncCalls: profilerCounterValue("simulation.inference.syncCalls"),
    syncPopulationVehicles: profilerCounterValue("simulation.inference.syncPopulationVehicles"),
    workerInitAttempts: profilerCounterValue("inference.workerInitAttempts"),
    workerInitSuccesses: profilerCounterValue("inference.workerInitSuccesses"),
    workerInitFailures: profilerCounterValue("inference.workerInitFailures"),
    workerRetryCooldownSkips: profilerCounterValue("inference.workerRetryCooldownSkips"),
    workerRetries: profilerCounterValue("inference.workerRetries"),
    workerCountAtEnd: state.sim.inference.workerCount,
    workersAvailableAtEnd: state.sim.inference.available,
    lastWorkerError: state.sim.inference.lastError || ""
  };
}

// Monta o resumo final que será reutilizado em análises futuras.
function profilerBuildSummary(meta = {}) {
  if (!profilerIsEnabled() || !state.profiler.current) return null;
  const current = state.profiler.current;
  profilerSampleGenerationState(null, "final");
  profilerTrackHeap();

  const bestBrainBytes = profilerBytesFromJson(state.sim.bestBrainData);
  const seedBrainBytes = profilerBytesFromJson(state.sim.seedBrainData);
  const snapshotBytes = profilerBytesFromJson(state.sim.lastGenerationSnapshot);
  const trackBytes = profilerBytesFromJson(state.track);
  const historyBytes = profilerBytesFromJson(state.sim.history);

  return {
    generation: current.generation,
    finishedAtMs: profilerNow(),
    totalWallMs: profilerNow() - current.startedAtMs,
    simulationElapsedSeconds: state.sim.elapsed - current.simulationElapsedStart,
    meta: {
      ...meta,
      inference: profilerBuildInferenceMeta()
    },
    timings: Object.values(current.timings)
      .sort((a, b) => b.totalMs - a.totalMs)
      .map(entry => ({
        section: entry.name,
        totalMs: Number(profilerFormatMs(entry.totalMs)),
        calls: entry.calls,
        avgMs: Number(profilerFormatMs(entry.totalMs / Math.max(1, entry.calls))),
        maxMs: Number(profilerFormatMs(entry.maxMs))
      })),
    counters: { ...current.counters },
    maxima: { ...current.maxima },
    sizes: {
      ...current.lastSizes,
      trackOuterPoints: state.track?.outer?.length || 0,
      trackInnerPoints: state.track?.inner?.length || 0,
      trackBytes,
      historyBytes,
      snapshotBytes,
      bestBrainBytes,
      seedBrainBytes,
      bestVehicleWeightCount: profilerEstimateBrainDataWeightCount(state.sim.bestBrainData),
      bestBrainLayerCount: state.sim.bestBrainData?.weights?.length || 0
    },
    heap: {
      startBytes: current.heap.startBytes,
      endBytes: current.heap.endBytes,
      peakBytes: current.heap.peakBytes
    }
  };
}

// Escreve o resumo no console em formato fácil de inspecionar.
function profilerLogSummary(summary) {
  if (!summary) return;
  const label = `[perf] geração ${summary.generation}`;
  console.log(`${label} summary`, summary);
  console.groupCollapsed(
    `${label} | wall ${profilerFormatMs(summary.totalWallMs)} ms | sim ${summary.simulationElapsedSeconds.toFixed(2)} s`
  );
  console.log("Meta", summary.meta);
  console.table(summary.timings);
  console.table(summary.counters);
  console.table(
    Object.entries(summary.maxima).map(([name, value]) => ({ name, value }))
  );
  console.table(
    Object.entries(summary.sizes).map(([name, value]) => ({
      name,
      value,
      pretty: typeof value === "number" && name.toLowerCase().includes("bytes")
        ? profilerFormatBytes(value)
        : value
    }))
  );
  console.table([{
    startHeap: profilerFormatBytes(summary.heap.startBytes),
    endHeap: profilerFormatBytes(summary.heap.endBytes),
    peakHeap: profilerFormatBytes(summary.heap.peakBytes)
  }]);
  console.groupEnd();
}

function profilerFinishGeneration(meta = {}) {
  if (!profilerIsEnabled() || !state.profiler.current) return null;
  const summary = profilerBuildSummary(meta);
  state.profiler.lastSummary = summary;
  state.profiler.recent.push(summary);
  if (state.profiler.recent.length > state.profiler.maxRecent) {
    state.profiler.recent.splice(0, state.profiler.recent.length - state.profiler.maxRecent);
  }
  window.__gaPerfLastSummary = summary;
  window.__gaPerfHistory = state.profiler.recent;
  profilerLogSummary(summary);
  state.profiler.current = null;
  return summary;
}
