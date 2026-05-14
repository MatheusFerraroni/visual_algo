import { PRESETS } from "./config.js";
import { DeterministicRandom } from "./random.js";

function buildClusterSamples(randomGenerator, centerPoint, sampleCount, spread) {
  const samples = [];

  for (let index = 0; index < sampleCount; index += 1) {
    const point = randomGenerator.pointInDisk(centerPoint, spread);
    samples.push(point);
  }

  return samples;
}

function buildEllipticalClusterSamples(
  randomGenerator,
  centerPoint,
  sampleCount,
  radiusX,
  radiusY,
  rotationRadians = 0,
) {
  const samples = [];
  const cosRotation = Math.cos(rotationRadians);
  const sinRotation = Math.sin(rotationRadians);

  for (let index = 0; index < sampleCount; index += 1) {
    const angle = randomGenerator.next() * Math.PI * 2;
    const distance = Math.sqrt(randomGenerator.next());
    const localX = Math.cos(angle) * distance * radiusX;
    const localY = Math.sin(angle) * distance * radiusY;

    samples.push({
      x: centerPoint.x + localX * cosRotation - localY * sinRotation,
      y: centerPoint.y + localX * sinRotation + localY * cosRotation,
    });
  }

  return samples;
}

function buildOutliers(randomGenerator, canvasSize, outlierCount, margin = 36) {
  return Array.from({ length: outlierCount }, () => ({
    x: margin + randomGenerator.next() * Math.max(1, canvasSize.width - margin * 2),
    y: margin + randomGenerator.next() * Math.max(1, canvasSize.height - margin * 2),
  }));
}

function buildRingSamples(randomGenerator, centerPoint, sampleCount, innerRadius, outerRadius) {
  const samples = [];
  const innerSquared = innerRadius * innerRadius;
  const outerSquared = outerRadius * outerRadius;

  for (let index = 0; index < sampleCount; index += 1) {
    const angle = randomGenerator.next() * Math.PI * 2;
    const radius = Math.sqrt(innerSquared + randomGenerator.next() * (outerSquared - innerSquared));
    samples.push({
      x: centerPoint.x + Math.cos(angle) * radius,
      y: centerPoint.y + Math.sin(angle) * radius,
    });
  }

  return samples;
}

function buildArcSamples(
  randomGenerator,
  centerPoint,
  sampleCount,
  radius,
  thickness,
  startAngle,
  endAngle,
) {
  const samples = [];

  for (let index = 0; index < sampleCount; index += 1) {
    const angle = startAngle + randomGenerator.next() * (endAngle - startAngle);
    const radialOffset = (randomGenerator.next() - 0.5) * thickness;
    const effectiveRadius = radius + radialOffset;

    samples.push({
      x: centerPoint.x + Math.cos(angle) * effectiveRadius,
      y: centerPoint.y + Math.sin(angle) * effectiveRadius,
    });
  }

  return samples;
}

function buildWellDefinedPreset(randomGenerator, canvasSize) {
  const clusterCenters = [
    { x: canvasSize.width * 0.25, y: canvasSize.height * 0.28 },
    { x: canvasSize.width * 0.72, y: canvasSize.height * 0.34 },
    { x: canvasSize.width * 0.48, y: canvasSize.height * 0.72 },
  ];

  return {
    k: 3,
    samples: clusterCenters.flatMap((centerPoint) =>
      buildClusterSamples(randomGenerator, centerPoint, 307, 82),
    ),
    centroids: [],
  };
}

function buildCloseClustersPreset(randomGenerator, canvasSize) {
  const clusterCenters = [
    { x: canvasSize.width * 0.42, y: canvasSize.height * 0.45 },
    { x: canvasSize.width * 0.56, y: canvasSize.height * 0.5 },
    { x: canvasSize.width * 0.5, y: canvasSize.height * 0.62 },
  ];

  return {
    k: 3,
    samples: clusterCenters.flatMap((centerPoint) =>
      buildClusterSamples(randomGenerator, centerPoint, 350, 110),
    ),
    centroids: [],
  };
}

function buildNoClearClustersPreset(randomGenerator, canvasSize) {
  const noiseCenter = {
    x: canvasSize.width * 0.5,
    y: canvasSize.height * 0.5,
  };

  const centroidSeeds = [
    { x: canvasSize.width * 0.38, y: canvasSize.height * 0.4 },
    { x: canvasSize.width * 0.58, y: canvasSize.height * 0.48 },
    { x: canvasSize.width * 0.48, y: canvasSize.height * 0.64 },
  ];

  return {
    k: 3,
    samples: buildClusterSamples(randomGenerator, noiseCenter, 1050, 180),
    centroids: [],
  };
}

function buildUnevenDensityPreset(randomGenerator, canvasSize) {
  const clusters = [
    {
      centerPoint: { x: canvasSize.width * 0.24, y: canvasSize.height * 0.3 },
      sampleCount: 657,
      spread: 78,
    },
    {
      centerPoint: { x: canvasSize.width * 0.72, y: canvasSize.height * 0.34 },
      sampleCount: 315,
      spread: 118,
    },
    {
      centerPoint: { x: canvasSize.width * 0.5, y: canvasSize.height * 0.74 },
      sampleCount: 158,
      spread: 164,
    },
  ];

  return {
    k: 3,
    samples: clusters.flatMap((cluster) =>
      buildClusterSamples(
        randomGenerator,
        cluster.centerPoint,
        cluster.sampleCount,
        cluster.spread,
      )
    ),
    centroids: [],
  };
}

function buildWithOutliersPreset(randomGenerator, canvasSize) {
  const clusterCenters = [
    { x: canvasSize.width * 0.26, y: canvasSize.height * 0.32 },
    { x: canvasSize.width * 0.72, y: canvasSize.height * 0.33 },
    { x: canvasSize.width * 0.5, y: canvasSize.height * 0.72 },
  ];

  return {
    k: 3,
    samples: [
      ...clusterCenters.flatMap((centerPoint) =>
        buildClusterSamples(randomGenerator, centerPoint, 280, 88)
      ),
      ...buildOutliers(randomGenerator, canvasSize, 158),
    ],
    centroids: [],
  };
}

function buildElongatedClustersPreset(randomGenerator, canvasSize) {
  const clusters = [
    {
      centerPoint: { x: canvasSize.width * 0.28, y: canvasSize.height * 0.34 },
      sampleCount: 368,
      radiusX: 176,
      radiusY: 46,
      rotationRadians: 0.32,
    },
    {
      centerPoint: { x: canvasSize.width * 0.7, y: canvasSize.height * 0.42 },
      sampleCount: 333,
      radiusX: 162,
      radiusY: 44,
      rotationRadians: -0.52,
    },
    {
      centerPoint: { x: canvasSize.width * 0.48, y: canvasSize.height * 0.74 },
      sampleCount: 315,
      radiusX: 170,
      radiusY: 48,
      rotationRadians: 0.86,
    },
  ];

  return {
    k: 3,
    samples: clusters.flatMap((cluster) =>
      buildEllipticalClusterSamples(
        randomGenerator,
        cluster.centerPoint,
        cluster.sampleCount,
        cluster.radiusX,
        cluster.radiusY,
        cluster.rotationRadians,
      )
    ),
    centroids: [],
  };
}

function buildConcentricCirclesPreset(randomGenerator, canvasSize) {
  const centerPoint = {
    x: canvasSize.width * 0.5,
    y: canvasSize.height * 0.52,
  };

  return {
    k: 2,
    samples: [
      ...buildRingSamples(randomGenerator, centerPoint, 420, 36, 88),
      ...buildRingSamples(randomGenerator, centerPoint, 700, 136, 212),
    ],
    centroids: [],
  };
}

function buildInterleavedMoonsPreset(randomGenerator, canvasSize) {
  const firstMoonCenter = {
    x: canvasSize.width * 0.44,
    y: canvasSize.height * 0.52,
  };
  const secondMoonCenter = {
    x: canvasSize.width * 0.58,
    y: canvasSize.height * 0.62,
  };

  return {
    k: 2,
    samples: [
      ...buildArcSamples(randomGenerator, firstMoonCenter, 520, 148, 24, Math.PI * 0.08, Math.PI * 0.95),
      ...buildArcSamples(randomGenerator, secondMoonCenter, 520, 148, 24, Math.PI * 1.08, Math.PI * 1.95),
    ],
    centroids: [],
  };
}

function buildUShapesPreset(randomGenerator, canvasSize) {
  const leftCenter = {
    x: canvasSize.width * 0.34,
    y: canvasSize.height * 0.52,
  };
  const rightCenter = {
    x: canvasSize.width * 0.68,
    y: canvasSize.height * 0.52,
  };

  return {
    k: 2,
    samples: [
      ...buildArcSamples(randomGenerator, leftCenter, 560, 138, 28, Math.PI * 0.5, Math.PI * 1.5),
      ...buildArcSamples(randomGenerator, rightCenter, 560, 138, 28, -Math.PI * 0.5, Math.PI * 0.5),
    ],
    centroids: [],
  };
}

function buildSizeImbalancePreset(randomGenerator, canvasSize) {
  const clusters = [
    {
      centerPoint: { x: canvasSize.width * 0.27, y: canvasSize.height * 0.36 },
      sampleCount: 920,
      spread: 92,
    },
    {
      centerPoint: { x: canvasSize.width * 0.73, y: canvasSize.height * 0.3 },
      sampleCount: 90,
      spread: 56,
    },
    {
      centerPoint: { x: canvasSize.width * 0.68, y: canvasSize.height * 0.72 },
      sampleCount: 120,
      spread: 62,
    },
  ];

  return {
    k: 3,
    samples: clusters.flatMap((cluster) =>
      buildClusterSamples(
        randomGenerator,
        cluster.centerPoint,
        cluster.sampleCount,
        cluster.spread,
      )
    ),
    centroids: [],
  };
}

function buildHeavyOverlapPreset(randomGenerator, canvasSize) {
  const clusterCenters = [
    { x: canvasSize.width * 0.44, y: canvasSize.height * 0.47 },
    { x: canvasSize.width * 0.58, y: canvasSize.height * 0.5 },
    { x: canvasSize.width * 0.5, y: canvasSize.height * 0.63 },
  ];

  return {
    k: 3,
    samples: clusterCenters.flatMap((centerPoint) =>
      buildClusterSamples(randomGenerator, centerPoint, 420, 138),
    ),
    centroids: [],
  };
}

export function createPresetScenario(presetName, seed, canvasSize) {
  const randomGenerator = new DeterministicRandom(seed);

  switch (presetName) {
    case PRESETS.WELL_DEFINED:
      return buildWellDefinedPreset(randomGenerator, canvasSize);
    case PRESETS.CLOSE_CLUSTERS:
      return buildCloseClustersPreset(randomGenerator, canvasSize);
    case PRESETS.NO_CLEAR_CLUSTERS:
      return buildNoClearClustersPreset(randomGenerator, canvasSize);
    case PRESETS.UNEVEN_DENSITY:
      return buildUnevenDensityPreset(randomGenerator, canvasSize);
    case PRESETS.WITH_OUTLIERS:
      return buildWithOutliersPreset(randomGenerator, canvasSize);
    case PRESETS.ELONGATED_CLUSTERS:
      return buildElongatedClustersPreset(randomGenerator, canvasSize);
    case PRESETS.CONCENTRIC_CIRCLES:
      return buildConcentricCirclesPreset(randomGenerator, canvasSize);
    case PRESETS.INTERLEAVED_MOONS:
      return buildInterleavedMoonsPreset(randomGenerator, canvasSize);
    case PRESETS.U_SHAPES:
      return buildUShapesPreset(randomGenerator, canvasSize);
    case PRESETS.SIZE_IMBALANCE:
      return buildSizeImbalancePreset(randomGenerator, canvasSize);
    case PRESETS.HEAVY_OVERLAP:
      return buildHeavyOverlapPreset(randomGenerator, canvasSize);
    default:
      return null;
  }
}
