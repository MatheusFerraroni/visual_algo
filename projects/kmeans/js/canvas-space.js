function normalizeCanvasSize(canvasSize) {
  return {
    width: Math.max(1, Number(canvasSize?.width ?? 1)),
    height: Math.max(1, Number(canvasSize?.height ?? 1)),
  };
}

export function squaredNormalizedDistance(a, b, canvasSize) {
  const safeCanvasSize = normalizeCanvasSize(canvasSize);
  const dx = (a.x - b.x) / safeCanvasSize.width;
  const dy = (a.y - b.y) / safeCanvasSize.height;
  return dx * dx + dy * dy;
}
