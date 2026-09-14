function quantize(value, decimals = 6) {
  const factor = 10 ** decimals;
  const result = Math.round(value * factor) / factor;
  return Object.is(result, -0) ? 0 : result;
}

export function createTrailingMovingAverage(values, windowSize) {
  if (!Array.isArray(values)) {
    throw new TypeError("A média móvel exige uma lista de valores.");
  }
  if (!Number.isSafeInteger(windowSize) || windowSize <= 0) {
    throw new RangeError("A janela da média móvel deve ser um inteiro positivo.");
  }

  let sum = 0;
  return Object.freeze(values.map((value, index) => {
    if (!Number.isFinite(value)) {
      throw new TypeError(`O valor ${index} da média móvel deve ser finito.`);
    }
    sum += value;
    if (index >= windowSize) {
      sum -= values[index - windowSize];
    }
    return quantize(sum / Math.min(index + 1, windowSize));
  }));
}

export function createTimeMovingAverage(points, windowSeconds) {
  if (!Array.isArray(points)) {
    throw new TypeError("A média móvel temporal exige uma lista de pontos.");
  }
  if (!Number.isFinite(windowSeconds) || windowSeconds <= 0) {
    throw new RangeError("A janela temporal deve ser positiva.");
  }

  const activeValues = [];
  let sum = 0;
  return Object.freeze(points.map((point, index) => {
    if (!point || !Number.isFinite(point.x) || point.x < 0
      || (point.y !== null && !Number.isFinite(point.y))) {
      throw new TypeError(`O ponto temporal ${index} é inválido.`);
    }
    if (point.y !== null) {
      activeValues.push(point);
      sum += point.y;
    }
    while (activeValues.length > 0
      && activeValues[0].x <= point.x - windowSeconds) {
      sum -= activeValues.shift().y;
    }
    return Object.freeze({
      x: point.x,
      y: activeValues.length === 0 ? null : quantize(sum / activeValues.length),
    });
  }));
}

export function calculateIntervalBarGeometry({
  intervalStartPixel,
  intervalEndPixel,
  seriesIndex,
  seriesCount,
}) {
  if (![intervalStartPixel, intervalEndPixel].every(Number.isFinite)
    || intervalEndPixel <= intervalStartPixel) {
    throw new RangeError("A barra exige um intervalo crescente em pixels.");
  }
  if (!Number.isSafeInteger(seriesIndex) || seriesIndex < 0
    || !Number.isSafeInteger(seriesCount) || seriesCount <= 0
    || seriesIndex >= seriesCount) {
    throw new RangeError("A posição da série de barras é inválida.");
  }
  const intervalWidth = intervalEndPixel - intervalStartPixel;
  const inset = Math.min(2, intervalWidth * 0.12);
  const groupStart = intervalStartPixel + inset;
  const groupWidth = Math.max(1, intervalWidth - (inset * 2));
  const width = Math.max(1, groupWidth / seriesCount);
  return Object.freeze({
    x: groupStart + ((seriesIndex + 0.5) * width),
    width,
  });
}

export const intervalBarGeometryPlugin = Object.freeze({
  id: "evoIntervalBarGeometry",
  afterDatasetsUpdate(chart) {
    const xScale = chart.scales.x;
    const barDatasetIndexes = chart.data.datasets
      .map((dataset, index) => (dataset.evoIntervalBars ? index : null))
      .filter((index) => index !== null);
    for (const [seriesIndex, datasetIndex] of barDatasetIndexes.entries()) {
      const dataset = chart.data.datasets[datasetIndex];
      const elements = chart.getDatasetMeta(datasetIndex).data;
      for (const [pointIndex, element] of elements.entries()) {
        const point = dataset.data[pointIndex];
        if (!point || !Number.isFinite(point.intervalStartSeconds)
          || !Number.isFinite(point.intervalEndSeconds)
          || point.intervalEndSeconds <= point.intervalStartSeconds) {
          continue;
        }
        const geometry = calculateIntervalBarGeometry({
          intervalStartPixel: xScale.getPixelForValue(point.intervalStartSeconds),
          intervalEndPixel: xScale.getPixelForValue(point.intervalEndSeconds),
          seriesIndex,
          seriesCount: barDatasetIndexes.length,
        });
        element.x = geometry.x;
        element.width = geometry.width;
      }
    }
  },
});

export function requireChartConstructor(chartConstructor = globalThis.Chart) {
  if (typeof chartConstructor !== "function") {
    throw new Error("Chart.js não foi carregado antes da interface.");
  }
  return chartConstructor;
}
