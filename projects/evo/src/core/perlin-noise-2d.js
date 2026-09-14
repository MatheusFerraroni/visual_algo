const PERMUTATION_SIZE = 256;

function fade(value) {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

function lerp(start, end, amount) {
  return start + ((end - start) * amount);
}

function gradient(hash, x, y) {
  switch (hash & 7) {
    case 0: return x + y;
    case 1: return -x + y;
    case 2: return x - y;
    case 3: return -x - y;
    case 4: return x;
    case 5: return -x;
    case 6: return y;
    default: return -y;
  }
}

export class PerlinNoise2D {
  #permutation;

  constructor(random) {
    if (!random || typeof random.nextInt !== "function") {
      throw new TypeError("PerlinNoise2D exige um gerador aleatório compatível.");
    }

    const shuffled = Array.from(
      { length: PERMUTATION_SIZE },
      (_, index) => index,
    );

    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const selected = random.nextInt(index + 1);
      [shuffled[index], shuffled[selected]] = [shuffled[selected], shuffled[index]];
    }

    this.#permutation = new Uint16Array(PERMUTATION_SIZE * 2);
    for (let index = 0; index < this.#permutation.length; index += 1) {
      this.#permutation[index] = shuffled[index & 255];
    }
  }

  noise(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new TypeError("As coordenadas do Perlin devem ser finitas.");
    }

    const floorX = Math.floor(x);
    const floorY = Math.floor(y);
    const cellX = floorX & 255;
    const cellY = floorY & 255;
    const localX = x - floorX;
    const localY = y - floorY;
    const u = fade(localX);
    const v = fade(localY);

    const first = this.#permutation[cellX] + cellY;
    const second = this.#permutation[cellX + 1] + cellY;
    const raw = lerp(
      lerp(
        gradient(this.#permutation[first], localX, localY),
        gradient(this.#permutation[second], localX - 1, localY),
        u,
      ),
      lerp(
        gradient(this.#permutation[first + 1], localX, localY - 1),
        gradient(this.#permutation[second + 1], localX - 1, localY - 1),
        u,
      ),
      v,
    );

    return Math.max(0, Math.min(1, (raw + 1) / 2));
  }
}

export function fractalNoise2D(noise, x, y, settings) {
  let amplitude = 1;
  let frequency = 1;
  let value = 0;
  let amplitudeTotal = 0;

  for (let octave = 0; octave < settings.octaves; octave += 1) {
    value += noise.noise(x * frequency, y * frequency) * amplitude;
    amplitudeTotal += amplitude;
    amplitude *= settings.persistence;
    frequency *= settings.lacunarity;
  }

  return value / amplitudeTotal;
}
