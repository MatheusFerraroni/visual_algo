const TILE_TYPES = new Set(["water", "land"]);

export class Tile {
  constructor({ column, row, type, elevation, productivity }) {
    if (!Number.isInteger(column) || column < 0 || !Number.isInteger(row) || row < 0) {
      throw new TypeError("As coordenadas do tile devem ser inteiros não negativos.");
    }
    if (!TILE_TYPES.has(type)) {
      throw new TypeError("O tipo do tile deve ser water ou land.");
    }
    if (!Number.isFinite(elevation) || elevation < 0 || elevation > 1) {
      throw new RangeError("A elevação do tile deve estar entre zero e um.");
    }
    if (!Number.isFinite(productivity) || productivity < 0 || productivity > 1) {
      throw new RangeError("A produtividade do tile deve estar entre zero e um.");
    }
    if (type === "water" && productivity !== 0) {
      throw new RangeError("Tiles de água devem ter produtividade zero.");
    }

    this.column = column;
    this.row = row;
    this.type = type;
    this.elevation = elevation;
    this.productivity = productivity;
    Object.freeze(this);
  }
}
