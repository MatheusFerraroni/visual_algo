import { DEFAULT_CONFIG, MODES } from "./config.js";
import { runKMeansIteration } from "./algorithm.js";
import { buildElbowCurve } from "./elbow-analysis.js";
import { buildIterationMetrics } from "./metrics.js";
import { createPresetScenario } from "./presets.js";
import { deriveSeed, DeterministicRandom } from "./random.js";
import { drawScene } from "./render.js";
import { KMeansSimulationState } from "./state.js";

export { DEFAULT_CONFIG } from "./config.js";

export class KMeansDemo {
  constructor(container) {
    this.container = container;
    this.p5Instance = null;
    this.canvasElement = null;
    this.resizeObserver = null;
    this.pendingResizeFrame = null;
    this.resizeTimeout = null;
    this.lastCanvasSize = null;
    this.sampleSprayTimer = null;
    this.iterationTimer = null;
    this.simulationState = new KMeansSimulationState();
    this.interactionRandomGenerator = new DeterministicRandom(this.simulationState.config.seed);
    this.onStateChange = null;
  }

  get config() {
    return this.simulationState.config;
  }

  getCanvasSize() {
    if (!this.container) {
      return { width: 720, height: 420 };
    }

    const { width, height } = this.container.getBoundingClientRect();

    return {
      width: Math.max(320, Math.floor(width)),
      height: Math.max(240, Math.floor(height)),
    };
  }

  queueInitialResize(instance = this.p5Instance) {
    if (!instance) {
      return;
    }

    instance.resizeToContainer?.(true);

    requestAnimationFrame(() => {
      instance.resizeToContainer?.(true);
    });

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        instance.resizeToContainer?.(true);
      });
    });

    if (this.resizeTimeout !== null) {
      clearTimeout(this.resizeTimeout);
    }

    this.resizeTimeout = setTimeout(() => {
      this.resizeTimeout = null;
      instance.resizeToContainer?.(true);
    }, 80);
  }

  scheduleResize() {
    if (this.pendingResizeFrame !== null) {
      cancelAnimationFrame(this.pendingResizeFrame);
    }

    this.pendingResizeFrame = requestAnimationFrame(() => {
      this.pendingResizeFrame = null;
      this.p5Instance?.resizeToContainer?.();
    });
  }

  redraw() {
    this.p5Instance?.redraw?.();
    this.onStateChange?.(this.simulationState);
  }

  invalidateElbowCurve() {
    this.simulationState.clearElbowCurve();
  }

  refreshCurrentMetrics() {
    const canvasSize = this.getCanvasSize();
    this.simulationState.updateCurrentMetrics(
      buildIterationMetrics(
        this.simulationState.samples,
        this.simulationState.centroids,
        canvasSize,
      ),
    );
  }

  resetComputedState() {
    this.stopIterationLoop();
    this.simulationState.resetAnalysisState();
    this.refreshCurrentMetrics();
  }

  resetRandomState() {
    this.interactionRandomGenerator.setSeed(this.simulationState.config.seed);
  }

  createAlgorithmRandomGenerator(snapshot) {
    return new DeterministicRandom(
      deriveSeed(
        snapshot.config.seed,
        snapshot.datasetVersion,
        snapshot.iteration,
        snapshot.config.k,
        snapshot.samples.length,
        snapshot.centroids.length,
        1,
      ),
    );
  }

  createCentroidPlacementRandomGenerator(purposeSalt) {
    return new DeterministicRandom(
      deriveSeed(
        this.simulationState.config.seed,
        this.simulationState.datasetVersion,
        this.simulationState.iteration,
        this.simulationState.samples.length,
        this.simulationState.centroids.length,
        purposeSalt,
      ),
    );
  }

  updateSampleSprayCenter(x, y) {
    this.simulationState.sampleSprayCenter = { x, y };
  }

  buildRandomCentroidPosition(randomGenerator) {
    if (this.simulationState.samples.length > 0) {
      const sampleIndex = Math.floor(
        randomGenerator.next() * this.simulationState.samples.length,
      );
      const sample = this.simulationState.samples[sampleIndex];
      return { x: sample.x, y: sample.y };
    }

    const { width, height } = this.getCanvasSize();
    const margin = 24;

    return {
      x: margin + randomGenerator.next() * Math.max(1, width - margin * 2),
      y: margin + randomGenerator.next() * Math.max(1, height - margin * 2),
    };
  }

  reconcileCentroidsWithClusterCount(preserveRunning = false) {
    const targetCentroidCount = Math.max(1, this.simulationState.config.k);
    const currentCentroidCount = this.simulationState.centroids.length;
    const centroidPlacementRandomGenerator = this.createCentroidPlacementRandomGenerator(11);

    if (currentCentroidCount === targetCentroidCount) {
      this.simulationState.resetAnalysisState(preserveRunning);
      return;
    }

    if (currentCentroidCount > targetCentroidCount) {
      this.simulationState.centroids = this.simulationState.centroids
        .slice(0, targetCentroidCount)
        .map((centroid, index) => ({
          ...centroid,
          clusterIndex: index,
          color: null,
        }));
      this.simulationState.nextCentroidId =
        Math.max(0, ...this.simulationState.centroids.map((centroid) => centroid.id)) + 1;
    } else {
      const missingCentroidCount = targetCentroidCount - currentCentroidCount;

      for (let index = 0; index < missingCentroidCount; index += 1) {
        const position = this.buildRandomCentroidPosition(centroidPlacementRandomGenerator);
        this.simulationState.addGeneratedCentroid(position.x, position.y);
      }
    }

    this.simulationState.markDatasetChanged();
    this.simulationState.resetAnalysisState(preserveRunning);
  }

  startSampleSpray() {
    if (
      !this.simulationState.isSampleSprayModeEnabled ||
      !this.simulationState.sampleSprayCenter ||
      !this.simulationState.isSampleSprayPointerActive
    ) {
      return;
    }

    this.stopSampleSpray();

    this.sampleSprayTimer = window.setInterval(() => {
      if (!this.p5Instance || !this.simulationState.sampleSprayCenter) {
        return;
      }

      // Spray mode keeps emitting samples around the latest pointer position
      // while the left mouse button remains pressed.
      const point = this.interactionRandomGenerator.pointInDisk(
        this.simulationState.sampleSprayCenter,
        this.simulationState.config.sampleSprayRadius,
      );

      this.simulationState.preset = null;
      this.simulationState.addSample(point.x, point.y);
      this.invalidateElbowCurve();
      this.redraw();
    }, this.simulationState.config.sampleSprayIntervalMs);
  }

  stopSampleSpray() {
    if (this.sampleSprayTimer !== null) {
      window.clearInterval(this.sampleSprayTimer);
      this.sampleSprayTimer = null;
    }
  }

  scheduleNextIteration() {
    if (!this.simulationState.isRunning) {
      return;
    }

    // The loop is timeout-based so changes to the iteration delay can take
    // effect immediately between steps.
    this.stopIterationLoop();
    this.iterationTimer = window.setTimeout(() => {
      this.runSingleIteration();

      if (this.simulationState.isRunning) {
        this.scheduleNextIteration();
      }
    }, this.simulationState.config.iterationDelay);
  }

  stopIterationLoop() {
    if (this.iterationTimer !== null) {
      window.clearTimeout(this.iterationTimer);
      this.iterationTimer = null;
    }
  }

  runSingleIteration() {
    if (this.simulationState.iteration >= this.simulationState.config.maxIterations) {
      this.simulationState.isRunning = false;
      this.stopIterationLoop();
      this.redraw();
      return false;
    }

    // Each iteration works on a snapshot so the user can keep editing the live
    // dataset without corrupting the calculation currently in progress.
    const snapshot = {
      ...this.simulationState.createIterationSnapshot(),
      canvasSize: this.getCanvasSize(),
    };
    const algorithmRandomGenerator = this.createAlgorithmRandomGenerator(snapshot);
    const result = runKMeansIteration(
      snapshot,
      this.simulationState,
      algorithmRandomGenerator,
    );
    const didDatasetChangeDuringIteration =
      this.simulationState.datasetVersion !== snapshot.datasetVersion;

    if (!result.didUpdate) {
      if (didDatasetChangeDuringIteration) {
        this.simulationState.hasConverged = false;
        this.redraw();
        return true;
      }

      this.simulationState.isRunning = false;
      this.simulationState.hasConverged = true;
      this.stopIterationLoop();
      this.redraw();
      return false;
    }

    this.simulationState.applyIterationResult(result);
    this.simulationState.iteration += 1;
    this.simulationState.hasConverged = result.hasConverged && !didDatasetChangeDuringIteration;
    this.simulationState.recordIterationMetrics(
      buildIterationMetrics(
        this.simulationState.samples,
        this.simulationState.centroids,
        snapshot.canvasSize,
      ),
    );

    if (
      (result.hasConverged && !didDatasetChangeDuringIteration) ||
      this.simulationState.iteration >= this.simulationState.config.maxIterations
    ) {
      this.simulationState.isRunning = false;
      this.stopIterationLoop();
    }

    this.redraw();
    return true;
  }

  handleSampleClick(p) {
    if (this.simulationState.isSampleSprayModeEnabled) {
      if (p.mouseButton !== p.LEFT) {
        return;
      }

      this.simulationState.isSampleSprayPointerActive = true;
      this.updateSampleSprayCenter(p.mouseX, p.mouseY);
      this.startSampleSpray();
      this.redraw();
      return;
    }

    this.simulationState.preset = null;
    this.simulationState.addSample(p.mouseX, p.mouseY);
    this.invalidateElbowCurve();
    this.refreshCurrentMetrics();
    this.redraw();
  }

  handleCentroidClick(p) {
    this.simulationState.preset = null;
    this.simulationState.addCentroid(p.mouseX, p.mouseY);
    this.simulationState.config.k = this.simulationState.centroids.length;
    this.simulationState.invalidateClusterAssignments(this.simulationState.isRunning);
    this.invalidateElbowCurve();
    this.refreshCurrentMetrics();
    this.redraw();
  }

  mount() {
    if (!this.container) {
      return;
    }

    const sketch = (p) => {
      const isInsideCanvas = () =>
        p.mouseX >= 0 &&
        p.mouseX <= p.width &&
        p.mouseY >= 0 &&
        p.mouseY <= p.height;

      p.setup = () => {
        p.pixelDensity(1);
        p.frameRate(60);
        const initialSize = this.getCanvasSize();
        const canvas = p.createCanvas(initialSize.width, initialSize.height);
        canvas.parent(this.container);
        this.canvasElement = canvas.elt ?? null;
        // Render only when state changes. This keeps the canvas responsive
        // without running a continuous draw loop before the algorithm exists.
        p.noLoop();
        this.queueInitialResize(p);
      };

      p.resizeToContainer = (force = false) => {
        const { width, height } = this.getCanvasSize();

        if (!force && width < 2 && height < 2) {
          return;
        }

        if (
          this.lastCanvasSize &&
          this.lastCanvasSize.width === width &&
          this.lastCanvasSize.height === height
        ) {
          return;
        }

        this.lastCanvasSize = { width, height };
        p.resizeCanvas(width, height);

        if (this.canvasElement) {
          this.canvasElement.width = width;
          this.canvasElement.height = height;
          this.canvasElement.style.width = `${width}px`;
          this.canvasElement.style.height = `${height}px`;
        }

        this.redraw();
      };

      p.windowResized = () => {
        this.scheduleResize();
      };

      p.draw = () => {
        drawScene(p, this.simulationState);
      };

      p.mousePressed = () => {
        if (!isInsideCanvas()) {
          return;
        }

        if (this.simulationState.mode === MODES.CENTROIDS) {
          this.handleCentroidClick(p);
          return;
        }

        if (this.simulationState.mode !== MODES.SAMPLES) {
          return;
        }

        this.handleSampleClick(p);
      };

      p.mouseDragged = () => {
        if (
          !this.simulationState.isSampleSprayModeEnabled ||
          !this.simulationState.isSampleSprayPointerActive ||
          this.simulationState.mode !== MODES.SAMPLES
        ) {
          return;
        }

        if (!isInsideCanvas()) {
          return;
        }

        this.updateSampleSprayCenter(p.mouseX, p.mouseY);
      };

      p.mouseReleased = () => {
        this.simulationState.isSampleSprayPointerActive = false;
        this.stopSampleSpray();
      };
    };

    this.p5Instance = new p5(sketch);
    this.observeContainer();
  }

  observeContainer() {
    if (!this.container || typeof ResizeObserver === "undefined") {
      return;
    }

    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(() => {
      this.scheduleResize();
    });
    this.resizeObserver.observe(this.container);
  }

  reset() {
    this.simulationState.reset();
    this.stopSampleSpray();
    this.stopIterationLoop();
    this.resetRandomState();
    this.lastCanvasSize = null;
    this.resizeObserver?.disconnect();

    if (this.pendingResizeFrame !== null) {
      cancelAnimationFrame(this.pendingResizeFrame);
      this.pendingResizeFrame = null;
    }

    if (this.resizeTimeout !== null) {
      clearTimeout(this.resizeTimeout);
      this.resizeTimeout = null;
    }

    if (this.p5Instance) {
      this.p5Instance.remove();
    }

    this.mount();
    this.redraw();
  }

  setConfig(nextConfig) {
    const didChangeClusterCount =
      typeof nextConfig.k === "number" && nextConfig.k !== this.simulationState.config.k;

    this.simulationState.setConfig(nextConfig);

    if (didChangeClusterCount) {
      this.simulationState.preset = null;
      this.reconcileCentroidsWithClusterCount(this.simulationState.isRunning);
    }

    this.invalidateElbowCurve();

    if (typeof nextConfig.seed === "number") {
      this.resetRandomState();
    }

    if (
      this.simulationState.isSampleSprayModeEnabled &&
      this.simulationState.sampleSprayCenter &&
      (typeof nextConfig.sampleSprayIntervalMs === "number" ||
        typeof nextConfig.sampleSprayRadius === "number")
    ) {
      this.startSampleSpray();
    }

    if (typeof nextConfig.iterationDelay === "number" && this.simulationState.isRunning) {
      this.scheduleNextIteration();
    }

    this.refreshCurrentMetrics();
    this.redraw();
  }

  setMode(mode) {
    this.simulationState.mode = mode;

    if (mode !== MODES.SAMPLES) {
      this.simulationState.isSampleSprayModeEnabled = false;
      this.simulationState.sampleSprayCenter = null;
      this.simulationState.isSampleSprayPointerActive = false;
      this.stopSampleSpray();
    } else if (
      this.simulationState.isSampleSprayModeEnabled &&
      this.simulationState.sampleSprayCenter &&
      this.simulationState.isSampleSprayPointerActive
    ) {
      this.startSampleSpray();
    }

    this.redraw();
  }

  step() {
    this.runSingleIteration();
  }

  run() {
    if (this.simulationState.isRunning || this.simulationState.isElbowRunning) {
      return;
    }

    this.simulationState.isRunning = true;
    this.redraw();

    const didAdvance = this.runSingleIteration();

    if (didAdvance && this.simulationState.isRunning) {
      this.scheduleNextIteration();
    }
  }

  pause() {
    this.simulationState.isRunning = false;
    this.stopIterationLoop();
    this.redraw();
  }

  clearSamples() {
    this.simulationState.clearSamples();
    this.stopSampleSpray();
    this.resetComputedState();
    this.simulationState.preset = null;
    this.resetRandomState();
    this.redraw();
  }

  clearCentroids() {
    this.simulationState.clearCentroids();
    this.resetComputedState();
    this.simulationState.preset = null;
    this.redraw();
  }

  randomizeCentroids() {
    const targetCentroidCount = Math.max(
      1,
      this.simulationState.centroids.length || this.simulationState.config.k,
    );
    const centroidPlacementRandomGenerator = this.createCentroidPlacementRandomGenerator(29);
    const randomCentroidPositions = Array.from({ length: targetCentroidCount }, () =>
      this.buildRandomCentroidPosition(centroidPlacementRandomGenerator)
    );

    this.simulationState.preset = null;
    this.invalidateElbowCurve();
    this.simulationState.replaceCentroids(
      randomCentroidPositions,
      this.simulationState.isRunning,
    );
    this.redraw();
  }

  applyPreset(preset) {
    const scenario = createPresetScenario(
      preset,
      this.simulationState.config.seed,
      this.getCanvasSize(),
    );

    if (!scenario) {
      return;
    }

    this.stopSampleSpray();
    this.stopIterationLoop();
    // Presets replace the editable dataset, so the previous clustering history
    // is intentionally discarded here.
    this.simulationState.loadScenario({
      ...scenario,
      preset,
    });
    this.resetRandomState();
    this.refreshCurrentMetrics();
    this.redraw();
  }

  async generateElbowCurve() {
    if (this.simulationState.isElbowRunning) {
      return;
    }

    this.pause();
    this.simulationState.setElbowRunning(true);
    this.redraw();

    const samplesSnapshot = this.simulationState.samples.map((sample) => ({
      id: sample.id,
      x: sample.x,
      y: sample.y,
    }));
    const maxIterations = this.simulationState.config.maxIterations;
    const seed = this.simulationState.config.seed;
    const elbowRunsPerK = Math.max(1, this.simulationState.config.elbowRunsPerK ?? 1);
    const canvasSize = this.getCanvasSize();

    await new Promise((resolve) => {
      window.setTimeout(resolve, 0);
    });

    const elbowCurve = buildElbowCurve(
      samplesSnapshot,
      maxIterations,
      seed,
      20,
      elbowRunsPerK,
      canvasSize,
    );
    this.simulationState.setElbowCurve(elbowCurve);
    this.redraw();
  }

  toggleSampleSprayMode() {
    if (!this.simulationState.isSampleSprayModeEnabled) {
      // Spray mode is only meaningful when adding samples, so it forces
      // the interaction mode back to sample placement.
      this.simulationState.mode = MODES.SAMPLES;
      this.simulationState.isSampleSprayModeEnabled = true;
      this.redraw();
      return;
    }

    this.simulationState.isSampleSprayModeEnabled = false;
    this.simulationState.sampleSprayCenter = null;
    this.simulationState.isSampleSprayPointerActive = false;
    this.stopSampleSpray();
    this.redraw();
  }

  setOnStateChange(callback) {
    this.onStateChange = callback;
    this.onStateChange?.(this.simulationState);
  }
}
