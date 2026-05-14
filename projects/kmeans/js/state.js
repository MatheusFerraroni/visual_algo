import { DEFAULT_CONFIG, MODES } from "./config.js";

export class KMeansSimulationState {
  constructor() {
    this.reset();
  }

  reset() {
    // Keep simulation state resettable without recreating the whole controller.
    this.config = { ...DEFAULT_CONFIG };
    this.mode = MODES.SAMPLES;
    this.isSampleSprayModeEnabled = false;
    this.isRunning = false;
    this.iteration = 0;
    this.samples = [];
    this.centroids = [];
    this.preset = null;
    this.sampleSprayCenter = null;
    this.isSampleSprayPointerActive = false;
    this.hasConverged = false;
    this.currentMetrics = {
      clusterMetrics: [],
      overallDissimilarity: 0,
    };
    this.metricsHistory = [];
    this.elbowCurve = [];
    this.isElbowRunning = false;
    this.datasetVersion = 0;
    this.nextSampleId = 1;
    this.nextCentroidId = 1;
  }

  resetAnalysisState(preserveRunning = false) {
    const shouldKeepRunning = preserveRunning && this.isRunning;

    this.isRunning = shouldKeepRunning;
    this.iteration = 0;
    this.hasConverged = false;
    this.currentMetrics = {
      clusterMetrics: [],
      overallDissimilarity: 0,
    };
    this.metricsHistory = [];
    this.samples = this.samples.map((sample) => ({
      ...sample,
      clusterIndex: null,
      color: null,
    }));
    this.centroids = this.centroids.map((centroid, index) => ({
      ...centroid,
      clusterIndex: index,
      color: null,
    }));
    this.clearElbowCurve();
  }

  invalidateClusterAssignments(preserveRunning = false) {
    const shouldKeepRunning = preserveRunning && this.isRunning;

    this.isRunning = shouldKeepRunning;
    this.hasConverged = false;
    this.samples = this.samples.map((sample) => ({
      ...sample,
      clusterIndex: null,
      color: null,
    }));
    this.centroids = this.centroids.map((centroid, index) => ({
      ...centroid,
      clusterIndex: index,
      color: null,
    }));
    this.clearElbowCurve();
  }

  setConfig(nextConfig) {
    this.config = {
      ...this.config,
      ...nextConfig,
    };
  }

  markDatasetChanged() {
    this.datasetVersion += 1;
    this.hasConverged = false;
  }

  addSample(x, y) {
    this.samples.push({
      id: this.nextSampleId,
      x,
      y,
      clusterIndex: null,
      color: null,
    });
    this.nextSampleId += 1;
    this.markDatasetChanged();
  }

  addCentroid(x, y) {
    this.centroids.push({
      id: this.nextCentroidId,
      x,
      y,
      clusterIndex: this.centroids.length,
      color: null,
    });
    this.nextCentroidId += 1;
    this.markDatasetChanged();
  }

  addGeneratedCentroid(x, y) {
    const centroid = {
      id: this.nextCentroidId,
      x,
      y,
      clusterIndex: this.centroids.length,
      color: null,
    };

    this.centroids.push(centroid);
    this.nextCentroidId += 1;
    return centroid;
  }

  clearSamples() {
    this.samples = [];
    this.sampleSprayCenter = null;
    this.isSampleSprayPointerActive = false;
    this.nextSampleId = 1;
    this.markDatasetChanged();
    this.resetAnalysisState();
  }

  clearCentroids() {
    this.centroids = [];
    this.nextCentroidId = 1;
    this.markDatasetChanged();
    this.resetAnalysisState();
  }

  replaceCentroids(centroidPositions, preserveRunning = false) {
    this.centroids = centroidPositions.map((centroidPosition, index) => ({
      id: index + 1,
      x: centroidPosition.x,
      y: centroidPosition.y,
      clusterIndex: index,
      color: null,
    }));
    this.nextCentroidId = this.centroids.length + 1;
    this.markDatasetChanged();
    this.resetAnalysisState(preserveRunning);
  }

  loadScenario({ samples, centroids, k, preset }) {
    this.samples = [];
    this.centroids = [];
    this.iteration = 0;
    this.isRunning = false;
    this.preset = preset;
    this.hasConverged = false;
    this.sampleSprayCenter = null;
    this.isSampleSprayPointerActive = false;
    this.isSampleSprayModeEnabled = false;
    this.currentMetrics = {
      clusterMetrics: [],
      overallDissimilarity: 0,
    };
    this.metricsHistory = [];
    this.elbowCurve = [];
    this.isElbowRunning = false;
    this.datasetVersion += 1;
    this.nextSampleId = 1;
    this.nextCentroidId = 1;

    if (typeof k === "number") {
      this.config.k = k;
    }

    for (const sample of samples) {
      this.addSample(sample.x, sample.y);
    }

    for (const centroid of centroids) {
      this.addCentroid(centroid.x, centroid.y);
    }
  }

  createIterationSnapshot() {
    // Iterations work on copies so live user edits do not mutate the data
    // currently being processed.
    return {
      samples: this.samples.map((sample) => ({ ...sample })),
      centroids: this.centroids.map((centroid) => ({ ...centroid })),
      config: { ...this.config },
      iteration: this.iteration,
      datasetVersion: this.datasetVersion,
    };
  }

  applyIterationResult({ sampleUpdates, centroidUpdates }) {
    const samplesById = new Map(sampleUpdates.map((sample) => [sample.id, sample]));
    const centroidsById = new Map(centroidUpdates.map((centroid) => [centroid.id, centroid]));

    // Results are merged by id so items added during a running iteration are
    // preserved instead of being overwritten by stale snapshots.
    this.samples = this.samples.map((sample) => {
      const update = samplesById.get(sample.id);
      return update ? { ...sample, ...update } : sample;
    });

    this.centroids = this.centroids.map((centroid) => {
      const update = centroidsById.get(centroid.id);
      return update ? { ...centroid, ...update } : centroid;
    });
  }

  recordIterationMetrics(metrics) {
    this.currentMetrics = metrics;
    this.metricsHistory.push({
      iteration: this.iteration,
      ...metrics,
    });
  }

  updateCurrentMetrics(metrics) {
    this.currentMetrics = metrics;
  }

  clearElbowCurve() {
    this.elbowCurve = [];
    this.isElbowRunning = false;
  }

  setElbowRunning(isRunning) {
    this.isElbowRunning = isRunning;
  }

  setElbowCurve(elbowCurve) {
    this.elbowCurve = elbowCurve;
    this.isElbowRunning = false;
  }
}
