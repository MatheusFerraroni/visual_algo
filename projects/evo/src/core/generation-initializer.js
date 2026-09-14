import { SeededRandom } from "./seeded-random.js";

export class GenerationInitializationError extends Error {
  constructor(message) {
    super(message);
    this.name = "GenerationInitializationError";
  }
}

export class GenerationInitializer {
  static createSpawnPoints({ worldMap, mapSeed, generation, count }) {
    if (!worldMap || typeof worldMap.getMainIslandTiles !== "function") {
      throw new TypeError("A inicialização exige um WorldMap válido.");
    }
    if (!Number.isSafeInteger(generation) || generation <= 0) {
      throw new TypeError("A geração deve ser um inteiro seguro maior que zero.");
    }
    if (!Number.isSafeInteger(count) || count <= 0) {
      throw new TypeError("A população deve ser um inteiro seguro maior que zero.");
    }

    const candidates = [...worldMap.getMainIslandTiles()];
    if (candidates.length < count) {
      throw new GenerationInitializationError(
        `A ilha principal comporta ${candidates.length} posições distintas, menos que os ${count} seres solicitados.`,
      );
    }

    const random = SeededRandom
      .fromSeed(mapSeed)
      .fork(`generation:${generation}:initial-beings`);
    const spawnPoints = [];

    for (let position = 0; position < count; position += 1) {
      const selectedPosition = random.nextInt(position, candidates.length);
      [candidates[position], candidates[selectedPosition]] = [
        candidates[selectedPosition],
        candidates[position],
      ];
      const tile = candidates[position];
      spawnPoints.push(Object.freeze({
        id: position + 1,
        column: tile.column,
        row: tile.row,
        x: tile.column + 0.5,
        y: tile.row + 0.5,
      }));
    }

    return Object.freeze(spawnPoints);
  }
}
