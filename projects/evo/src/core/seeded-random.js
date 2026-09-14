const UINT32_RANGE = 4_294_967_296;

function canonicalizeSeed(seed) {
  if (typeof seed === "number" && !Number.isFinite(seed)) {
    throw new TypeError("A seed numérica deve ser finita.");
  }

  if (typeof seed !== "string" && typeof seed !== "number") {
    throw new TypeError("A seed deve ser texto ou número.");
  }

  const canonical = String(seed);
  if (canonical.trim().length === 0) {
    throw new TypeError("A seed não pode ser vazia.");
  }

  return canonical;
}

function xmur3(value) {
  let hash = 1_779_033_703 ^ value.length;

  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 3_432_918_353);
    hash = (hash << 13) | (hash >>> 19);
  }

  return () => {
    hash = Math.imul(hash ^ (hash >>> 16), 2_246_822_507);
    hash = Math.imul(hash ^ (hash >>> 13), 3_266_489_909);
    return (hash ^= hash >>> 16) >>> 0;
  };
}

function sfc32(stateA, stateB, stateC, stateD) {
  let a = stateA >>> 0;
  let b = stateB >>> 0;
  let c = stateC >>> 0;
  let d = stateD >>> 0;

  return () => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;

    let result = (a + b) | 0;
    result = (result + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = ((c << 21) | (c >>> 11));
    c = (c + result) | 0;

    return (result >>> 0) / UINT32_RANGE;
  };
}

export class SeededRandom {
  #rootKey;
  #nextValue;
  #gaussianSpare = null;

  constructor(rootKey) {
    this.#rootKey = rootKey;
    const seedFactory = xmur3(rootKey);
    this.#nextValue = sfc32(
      seedFactory(),
      seedFactory(),
      seedFactory(),
      seedFactory(),
    );
  }

  static fromSeed(seed) {
    return new SeededRandom(`seed:${canonicalizeSeed(seed)}`);
  }

  fork(label) {
    if ((typeof label !== "string" && typeof label !== "number") || String(label).length === 0) {
      throw new TypeError("O rótulo do stream deve ser texto ou número não vazio.");
    }

    return new SeededRandom(`${this.#rootKey}\u001fstream:${String(label)}`);
  }

  nextFloat() {
    return this.#nextValue();
  }

  nextInt(minOrMax, optionalMax) {
    const min = optionalMax === undefined ? 0 : minOrMax;
    const max = optionalMax === undefined ? minOrMax : optionalMax;

    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || max <= min) {
      throw new RangeError("nextInt exige limites inteiros seguros e max > min.");
    }

    return min + Math.floor(this.nextFloat() * (max - min));
  }

  nextRange(min, max) {
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
      throw new RangeError("nextRange exige limites finitos e max > min.");
    }

    return min + (this.nextFloat() * (max - min));
  }

  nextGaussian(mean = 0, standardDeviation = 1) {
    if (!Number.isFinite(mean) || !Number.isFinite(standardDeviation) || standardDeviation < 0) {
      throw new RangeError("A média deve ser finita e o desvio padrão não negativo.");
    }

    if (this.#gaussianSpare !== null) {
      const spare = this.#gaussianSpare;
      this.#gaussianSpare = null;
      return mean + (spare * standardDeviation);
    }

    let first = 0;
    while (first === 0) {
      first = this.nextFloat();
    }
    const second = this.nextFloat();
    const magnitude = Math.sqrt(-2 * Math.log(first));
    const angle = 2 * Math.PI * second;

    this.#gaussianSpare = magnitude * Math.sin(angle);
    return mean + (magnitude * Math.cos(angle) * standardDeviation);
  }
}
