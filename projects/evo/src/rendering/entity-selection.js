function findNearest(entities, pointFor, worldX, worldY, hitRadius) {
  let selected = null;
  let selectedDistance = Infinity;

  for (const entity of entities) {
    const point = pointFor(entity);
    const entityDistance = Math.hypot(point.x - worldX, point.y - worldY);
    if (entityDistance <= hitRadius
      && (entityDistance < selectedDistance
        || (entityDistance === selectedDistance
          && (selected === null || entity.id < selected.id)))) {
      selected = entity;
      selectedDistance = entityDistance;
    }
  }

  return selected;
}

export function pickEntityAt({ snapshot, worldX, worldY }) {
  if (!snapshot || !snapshot.map || !Array.isArray(snapshot.beings)
    || !Array.isArray(snapshot.foods)) {
    throw new TypeError("A seleção exige um snapshot válido.");
  }
  if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) {
    throw new TypeError("A seleção exige coordenadas finitas.");
  }

  const tileSize = snapshot.map.tileSizePx;
  if (!Number.isFinite(tileSize) || tileSize <= 0) {
    throw new TypeError("A seleção exige um tamanho de tile positivo.");
  }
  const hitRadius = tileSize * 0.5;
  const being = findNearest(
    snapshot.beings.filter(({ alive }) => alive),
    (candidate) => ({ x: candidate.x * tileSize, y: candidate.y * tileSize }),
    worldX,
    worldY,
    hitRadius,
  );
  if (being !== null) {
    return Object.freeze({ type: "being", id: being.id });
  }

  const food = findNearest(
    snapshot.foods,
    (candidate) => ({
      x: (candidate.column + 0.5) * tileSize,
      y: (candidate.row + 0.5) * tileSize,
    }),
    worldX,
    worldY,
    hitRadius,
  );
  return food === null
    ? null
    : Object.freeze({ type: "food", id: food.id });
}
