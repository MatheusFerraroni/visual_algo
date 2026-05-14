export class DeterministicRandom {
  constructor(seed = 42) {
    this.setSeed(seed);
  }

  setSeed(seed) {
    this.state = seed >>> 0;
  }

  next() {
    this.state = (1664525 * this.state + 1013904223) % 4294967296;
    return this.state / 4294967296;
  }

  pointInDisk(centerPoint, radius) {
    // sqrt(random) keeps the samples visually uniform across the disk area.
    const angle = this.next() * Math.PI * 2;
    const distance = Math.sqrt(this.next()) * radius;

    return {
      x: centerPoint.x + Math.cos(angle) * distance,
      y: centerPoint.y + Math.sin(angle) * distance,
    };
  }
}

export function deriveSeed(baseSeed, ...parts) {
  let mixedSeed = baseSeed >>> 0;

  for (const part of parts) {
    const value = Number(part) >>> 0;
    mixedSeed = (
      mixedSeed ^
      (value + 0x9e3779b9 + ((mixedSeed << 6) >>> 0) + (mixedSeed >>> 2))
    ) >>> 0;
  }

  return mixedSeed;
}
