import { squaredNormalizedDistance } from "./canvas-space.js";

export function calculateClusterMetrics(samples, centroids, canvasSize) {
  return centroids.map((centroid) => {
    const clusterSamples = samples.filter(
      (sample) => sample.clusterIndex === centroid.clusterIndex,
    );

    const variability = clusterSamples.reduce(
      (total, sample) => total + squaredNormalizedDistance(sample, centroid, canvasSize),
      0,
    );

    return {
      clusterIndex: centroid.clusterIndex,
      variability,
      sampleCount: clusterSamples.length,
    };
  });
}

export function calculateOverallDissimilarity(clusterMetrics) {
  return clusterMetrics.reduce((total, cluster) => total + cluster.variability, 0);
}

export function buildIterationMetrics(samples, centroids, canvasSize) {
  const clusterMetrics = calculateClusterMetrics(samples, centroids, canvasSize);

  return {
    clusterMetrics,
    overallDissimilarity: calculateOverallDissimilarity(clusterMetrics),
  };
}
