const LIFE_COLOR = Object.freeze([91, 220, 177]);
const ENERGY_COLOR = Object.freeze([241, 201, 121]);
const TRACK_COLOR = Object.freeze([18, 29, 24, 190]);
const OUTLINE_COLOR = Object.freeze([18, 29, 24, 230]);

export const BEING_STATUS_BAR_COLORS = Object.freeze({
  life: LIFE_COLOR,
  energy: ENERGY_COLOR,
  track: TRACK_COLOR,
  outline: OUTLINE_COLOR,
});

function clampRatio(value, maximum) {
  return Math.max(0, Math.min(1, value / maximum));
}

function freezeBar({ kind, ratio, color, x, y, width, height }) {
  return Object.freeze({ kind, ratio, color, x, y, width, height });
}

export function createBeingStatusBarModel({
  being,
  tileSizePx,
  worldHeightPx,
  maxLife,
  maxEnergy,
}) {
  if (!being || typeof being.alive !== "boolean") {
    throw new TypeError("As barras exigem um ser válido.");
  }
  if (!being.alive) {
    return null;
  }
  if (![being.x, being.y, being.life, being.energy].every(Number.isFinite)) {
    throw new TypeError("As barras exigem posição, vida e energia finitas.");
  }
  if (![tileSizePx, worldHeightPx, maxLife, maxEnergy].every(
    (value) => Number.isFinite(value) && value > 0,
  )) {
    throw new RangeError("As dimensões e os máximos das barras devem ser positivos.");
  }

  const centerX = being.x * tileSizePx;
  const centerY = being.y * tileSizePx;
  const width = tileSizePx * 0.72;
  const height = tileSizePx * 0.06;
  const gap = tileSizePx * 0.025;
  const totalHeight = (height * 2) + gap;
  const bodyRadius = tileSizePx * 0.35;
  const clearance = tileSizePx * 0.08;
  const aboveTop = centerY - bodyRadius - clearance - totalHeight;
  const belowTop = centerY + bodyRadius + clearance;
  let top = aboveTop;
  let placement = "above";

  if (aboveTop < 0) {
    top = belowTop;
    placement = "below";
  }
  if (top + totalHeight > worldHeightPx) {
    top = Math.max(0, Math.min(worldHeightPx - totalHeight, aboveTop));
    placement = "above";
  }

  const x = centerX - (width / 2);
  const bars = Object.freeze([
    freezeBar({
      kind: "life",
      ratio: clampRatio(being.life, maxLife),
      color: LIFE_COLOR,
      x,
      y: top,
      width,
      height,
    }),
    freezeBar({
      kind: "energy",
      ratio: clampRatio(being.energy, maxEnergy),
      color: ENERGY_COLOR,
      x,
      y: top + height + gap,
      width,
      height,
    }),
  ]);

  return Object.freeze({
    placement,
    trackColor: TRACK_COLOR,
    outlineColor: OUTLINE_COLOR,
    bars,
  });
}
