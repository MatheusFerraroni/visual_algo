function assertPosition(value, label) {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${label} deve ser uma coordenada finita.`);
  }
}

function assertFood(food) {
  if (!food || !Number.isSafeInteger(food.id) || food.id <= 0
    || !Number.isSafeInteger(food.column) || food.column < 0
    || !Number.isSafeInteger(food.row) || food.row < 0) {
    throw new TypeError("A busca por proximidade exige comidas válidas.");
  }
}

export function findFoodWithinDistance({
  foods,
  x,
  y,
  maxDistanceTiles,
  foodId = null,
}) {
  if (!Array.isArray(foods)) {
    throw new TypeError("A busca por proximidade exige uma lista de comidas.");
  }
  assertPosition(x, "A posição horizontal");
  assertPosition(y, "A posição vertical");
  if (!Number.isFinite(maxDistanceTiles) || maxDistanceTiles <= 0) {
    throw new RangeError("A distância máxima deve ser finita e positiva.");
  }
  if (foodId !== null && (!Number.isSafeInteger(foodId) || foodId <= 0)) {
    throw new TypeError("O ID da comida procurada deve ser um inteiro positivo.");
  }

  const maximumDistanceSquared = maxDistanceTiles ** 2;
  let nearestFood = null;
  let nearestDistanceSquared = Infinity;

  for (const food of foods) {
    assertFood(food);
    if (foodId !== null && food.id !== foodId) {
      continue;
    }
    const deltaX = (food.column + 0.5) - x;
    const deltaY = (food.row + 0.5) - y;
    const distanceSquared = (deltaX * deltaX) + (deltaY * deltaY);
    if (distanceSquared <= maximumDistanceSquared
      && (distanceSquared < nearestDistanceSquared
        || (distanceSquared === nearestDistanceSquared
          && (nearestFood === null || food.id < nearestFood.id)))) {
      nearestFood = food;
      nearestDistanceSquared = distanceSquared;
    }
  }

  return nearestFood;
}
