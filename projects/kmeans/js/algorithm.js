import { squaredNormalizedDistance } from "./canvas-space.js";
import { getClusterColor } from "./colors.js";

function buildWorkingCentroids(snapshot, state, randomGenerator) {
  const desiredClusterCount = Math.max(snapshot.config.k, snapshot.centroids.length);
  const targetClusterCount = Math.max(
    1,
    Math.min(desiredClusterCount, Math.max(snapshot.samples.length, snapshot.centroids.length || 1)),
  );

  // Existing centroids are reused first so manual edits remain meaningful.
  // If the user adds centroids during a running simulation, all of them become
  // eligible on the next iteration even when their count exceeds the prior K.
  const workingCentroids = snapshot.centroids
    .slice(0, targetClusterCount)
    .map((centroid, index) => ({
      ...centroid,
      clusterIndex: index,
      color: getClusterColor(index),
    }));

  while (workingCentroids.length < targetClusterCount && snapshot.samples.length > 0) {
    const sampleIndex = Math.floor(randomGenerator.next() * snapshot.samples.length);
    const sample = snapshot.samples[sampleIndex];
    // Missing centroids are spawned from the current sample set so the
    // algorithm can still run even when K is larger than the live centroid count.
    const centroid = state.addGeneratedCentroid(sample.x, sample.y);

    workingCentroids.push({
      ...centroid,
      clusterIndex: workingCentroids.length,
      color: getClusterColor(workingCentroids.length),
    });
  }

  return workingCentroids;
}

function assignSamplesToClosestCentroid(samples, centroids, canvasSize) {
  return samples.map((sample) => {
    let closestCentroid = centroids[0];
    let shortestDistance = squaredNormalizedDistance(sample, closestCentroid, canvasSize);

    for (let index = 1; index < centroids.length; index += 1) {
      const centroid = centroids[index];
      const currentDistance = squaredNormalizedDistance(sample, centroid, canvasSize);

      if (currentDistance < shortestDistance) {
        closestCentroid = centroid;
        shortestDistance = currentDistance;
      }
    }

    return {
      ...sample,
      clusterIndex: closestCentroid.clusterIndex,
      color: closestCentroid.color,
    };
  });
}

function recomputeCentroids(samples, currentCentroids) {
  return currentCentroids.map((centroid) => {
    const clusterSamples = samples.filter(
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

function didCentroidsMove(previousCentroids, nextCentroids) {
  return previousCentroids.some((centroid, index) => {
    const nextCentroid = nextCentroids[index];
    return centroid.x !== nextCentroid.x || centroid.y !== nextCentroid.y;
  });
}

export function runKMeansIteration(snapshot, state, randomGenerator) {
  if (snapshot.samples.length === 0) {
    return {
      didUpdate: false,
      hasConverged: true,
      sampleUpdates: [],
      centroidUpdates: [],
    };
  }

  const workingCentroids = buildWorkingCentroids(snapshot, state, randomGenerator);

  if (workingCentroids.length === 0) {
    return {
      didUpdate: false,
      hasConverged: true,
      sampleUpdates: [],
      centroidUpdates: [],
    };
  }

  const classifiedSamples = assignSamplesToClosestCentroid(
    snapshot.samples,
    workingCentroids,
    snapshot.canvasSize,
  );
  const nextCentroids = recomputeCentroids(classifiedSamples, workingCentroids);

  return {
    didUpdate: true,
    hasConverged: !didCentroidsMove(workingCentroids, nextCentroids),
    sampleUpdates: classifiedSamples,
    centroidUpdates: nextCentroids,
  };
}
