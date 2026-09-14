export class Food {
  #id;
  #column;
  #row;
  #initialEnergyUnits;
  #remainingEnergyUnits;
  #createdTick;
  #lastConsumedTick;
  #inactivityTimeoutTicks;
  #snapshot = null;
  #snapshotTick = null;

  constructor({
    id,
    column,
    row,
    initialEnergy,
    createdTick = 0,
    inactivityTimeoutTicks = 0,
  }) {
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new TypeError("O ID da comida deve ser um inteiro seguro maior que zero.");
    }
    if (!Number.isInteger(column) || column < 0 || !Number.isInteger(row) || row < 0) {
      throw new TypeError("As coordenadas da comida devem ser inteiros não negativos.");
    }
    if (!Number.isFinite(initialEnergy) || initialEnergy <= 0) {
      throw new RangeError("A energia inicial da comida deve ser maior que zero.");
    }
    if (!Number.isSafeInteger(createdTick) || createdTick < 0) {
      throw new TypeError("O tick de criação da comida deve ser um inteiro seguro não negativo.");
    }
    if (!Number.isSafeInteger(inactivityTimeoutTicks) || inactivityTimeoutTicks < 0) {
      throw new TypeError("O prazo de inatividade da comida deve ser um inteiro seguro não negativo.");
    }

    const initialEnergyUnits = Math.round(initialEnergy * 1_000_000);
    if (!Number.isSafeInteger(initialEnergyUnits) || initialEnergyUnits <= 0) {
      throw new RangeError("A energia inicial da comida excede a precisão segura suportada.");
    }

    this.#id = id;
    this.#column = column;
    this.#row = row;
    this.#initialEnergyUnits = initialEnergyUnits;
    this.#remainingEnergyUnits = initialEnergyUnits;
    this.#createdTick = createdTick;
    this.#lastConsumedTick = createdTick;
    this.#inactivityTimeoutTicks = inactivityTimeoutTicks;
    Object.freeze(this);
  }

  get id() {
    return this.#id;
  }

  get column() {
    return this.#column;
  }

  get row() {
    return this.#row;
  }

  get remainingEnergyUnits() {
    return this.#remainingEnergyUnits;
  }

  get lastConsumedTick() {
    return this.#lastConsumedTick;
  }

  get inactivityTimeoutTicks() {
    return this.#inactivityTimeoutTicks;
  }

  removeEnergyUnits(amount, consumedTick) {
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > this.#remainingEnergyUnits) {
      throw new RangeError("A remoção deve ser positiva e não exceder a energia da comida.");
    }
    if (!Number.isSafeInteger(consumedTick) || consumedTick < this.#lastConsumedTick) {
      throw new RangeError("O tick de consumo deve ser inteiro e não pode retroceder.");
    }
    this.#remainingEnergyUnits -= amount;
    this.#lastConsumedTick = consumedTick;
    this.#snapshot = null;
  }

  getSnapshot({ currentTick }) {
    if (!Number.isSafeInteger(currentTick) || currentTick < this.#lastConsumedTick) {
      throw new RangeError("O tick atual da comida deve ser inteiro e não pode retroceder.");
    }
    if (this.#snapshot === null || this.#snapshotTick !== currentTick) {
      this.#snapshot = Object.freeze({
        id: this.#id,
        column: this.#column,
        row: this.#row,
        initialEnergy: this.#initialEnergyUnits / 1_000_000,
        remainingEnergy: this.#remainingEnergyUnits / 1_000_000,
        createdTick: this.#createdTick,
        lastConsumedTick: this.#lastConsumedTick,
        inactivityTimeoutTicks: this.#inactivityTimeoutTicks,
        inactivityRemainingTicks: this.#inactivityTimeoutTicks === 0
          ? null
          : Math.max(
            0,
            this.#inactivityTimeoutTicks - (currentTick - this.#lastConsumedTick),
          ),
      });
      this.#snapshotTick = currentTick;
    }
    return this.#snapshot;
  }
}
