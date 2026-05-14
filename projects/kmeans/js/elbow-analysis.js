import { buildIterationMetrics } from "./metrics.js";
import { DeterministicRandom } from "./random.js";
import { squaredNormalizedDistance } from "./canvas-space.js";

const Z_SCORE_99_CONFIDENCE = 2.576;

function selectInitialCentroids(samples, requestedClusterCount, randomGenerator) {
  const clusterCount = Math.max(1, Math.min(requestedClusterCount, samples.length));
  const chosenIndexes = new Set();
  const centroids = [];

  while (centroids.length < clusterCount) {
    const sampleIndex = Math.floor(randomGenerator.next() * samples.length);

    if (chosenIndexes.has(sampleIndex)) {
      continue;
    }

    chosenIndexes.add(sampleIndex);
    const sample = samples[sampleIndex];
    centroids.push({
      id: centroids.length + 1,
      x: sample.x,
      y: sample.y,
      clusterIndex: centroids.length,
      color: null,
    });
  }

  return centroids;
}

function assignSamplesToClosestCentroid(samples, centroids, canvasSize) {
  return samples.map((sample) => {
    let closestCentroid = centroids[0];
    let closestDistance = squaredNormalizedDistance(sample, closestCentroid, canvasSize);

    for (let centroidIndex = 1; centroidIndex < centroids.length; centroidIndex += 1) {
      const centroid = centroids[centroidIndex];
      const currentDistance = squaredNormalizedDistance(sample, centroid, canvasSize);

      if (currentDistance < closestDistance) {
        closestCentroid = centroid;
        closestDistance = currentDistance;
      }
    }

    return {
      ...sample,
      clusterIndex: closestCentroid.clusterIndex,
      color: null,
    };
  });
}

function recomputeCentroids(classifiedSamples, centroids) {
  return centroids.map((centroid) => {
    const clusterSamples = classifiedSamples.filter(
      (sample) => sample.clusterIndex === centroid.clusterIndex,
    );

    if (clusterSamples.length === 0) {
      return centroid;
    }

    const totals = clusterSamples.reduce(
      (accumulator, sample) => ({
        x: accumulator.x + sample.x,
        y: accumulator.y + sample.y,
      }),
      { x: 0, y: 0 },
    );

    return {
      ...centroid,
      x: totals.x / clusterSamples.length,
      y: totals.y / clusterSamples.length,
    };
  });
}

function centroidsChanged(previousCentroids, nextCentroids) {
  return previousCentroids.some((centroid, centroidIndex) => {
    const nextCentroid = nextCentroids[centroidIndex];
    return centroid.x !== nextCentroid.x || centroid.y !== nextCentroid.y;
  });
}

function calculateMean(values) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function calculateSampleStandardDeviation(values, meanValue) {
  if (values.length <= 1) {
    return 0;
  }

  const variance = values.reduce((total, value) => {
    const delta = value - meanValue;
    return total + delta * delta;
  }, 0) / (values.length - 1);

  return Math.sqrt(variance);
}

function calculateConfidenceIntervalMargin(standardDeviation, sampleCount) {
  if (sampleCount <= 1) {
    return 0;
  }

  return Z_SCORE_99_CONFIDENCE * (standardDeviation / Math.sqrt(sampleCount));
}

function runKMeansForK(samplesSnapshot, requestedClusterCount, maxIterations, seed, canvasSize) {
  if (samplesSnapshot.length === 0) {
    return {
      k: requestedClusterCount,
      effectiveK: 0,
      overallDissimilarity: 0,
      iterations: 0,
      converged: true,
    };
  }

  const randomGenerator = new DeterministicRandom(seed + requestedClusterCount * 9973);
  let centroids = selectInitialCentroids(samplesSnapshot, requestedClusterCount, randomGenerator);
  let classifiedSamples = samplesSnapshot.map((sample) => ({ ...sample }));
  let iterations = 0;
  let converged = false;

  while (iterations < maxIterations) {
    const nextSamples = assignSamplesToClosestCentroid(classifiedSamples, centroids, canvasSize);
    const nextCentroids = recomputeCentroids(nextSamples, centroids);
    iterations += 1;

    if (!centroidsChanged(centroids, nextCentroids)) {
      classifiedSamples = nextSamples;
      centroids = nextCentroids;
      converged = true;
      break;
    }

    classifiedSamples = nextSamples;
    centroids = nextCentroids;
  }

  const metrics = buildIterationMetrics(classifiedSamples, centroids, canvasSize);

  return {
    k: requestedClusterCount,
    effectiveK: centroids.length,
    overallDissimilarity: metrics.overallDissimilarity,
    iterations,
    converged,
  };
}

export function buildElbowCurve(
  samples,
  maxIterations,
  seed,
  maxK = 20,
  runsPerK = 1,
  canvasSize,
) {
  const samplesSnapshot = samples.map((sample) => ({
    id: sample.id,
    x: sample.x,
    y: sample.y,
  }));

  return Array.from({ length: maxK }, (_, index) => {
    const requestedClusterCount = index + 1;
    const runResults = Array.from({ length: runsPerK }, (_, runIndex) =>
      runKMeansForK(
        samplesSnapshot,
        requestedClusterCount,
        maxIterations,
        seed + runIndex * 104729,
        canvasSize,
      )
    );
    const dissimilarities = runResults.map((runResult) => runResult.overallDissimilarity);
    const meanOverallDissimilarity = calculateMean(dissimilarities);
    const sampleStandardDeviation = calculateSampleStandardDeviation(
      dissimilarities,
      meanOverallDissimilarity,
    );
    const confidenceIntervalMargin = calculateConfidenceIntervalMargin(
      sampleStandardDeviation,
      runsPerK,
    );

    return {
      k: requestedClusterCount,
      runs: runResults,
      runCount: runsPerK,
      overallDissimilarity: meanOverallDissimilarity,
      meanOverallDissimilarity,
      sampleStandardDeviation,
      confidenceInterval99: {
        lowerBound: meanOverallDissimilarity - confidenceIntervalMargin,
        upperBound: meanOverallDissimilarity + confidenceIntervalMargin,
        margin: confidenceIntervalMargin,
      },
    };
  });
}
