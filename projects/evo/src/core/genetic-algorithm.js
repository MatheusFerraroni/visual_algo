import { SeededRandom } from "./seeded-random.js";
import { NOOP_PERFORMANCE_PROFILER } from "../debug/performance-profiler.js";

function quantize(value, decimals) {
  const factor = 10 ** decimals;
  const result = Math.round(value * factor) / factor;
  return Object.is(result, -0) ? 0 : result;
}

function compareCandidates(first, second) {
  return (second.fitness - first.fitness) || (first.id - second.id);
}

function compareArchivedElites(first, second) {
  return (second.fitness - first.fitness)
    || (first.generation - second.generation)
    || (first.beingId - second.beingId);
}

function validateIndividuals(individuals, { geneMin, geneMax }) {
  if (!Array.isArray(individuals) || individuals.length === 0) {
    throw new TypeError("A evolução exige uma população não vazia.");
  }

  const expectedGeneCount = individuals[0]?.genome?.length;
  if (!Number.isSafeInteger(expectedGeneCount) || expectedGeneCount <= 0) {
    throw new TypeError("Cada indivíduo deve possuir um genoma não vazio.");
  }

  const ids = new Set();
  for (const [index, individual] of individuals.entries()) {
    if (!individual || !Number.isSafeInteger(individual.id) || individual.id <= 0) {
      throw new TypeError(`O indivíduo ${index} deve possuir um ID inteiro positivo.`);
    }
    if (ids.has(individual.id)) {
      throw new RangeError(`O ID ${individual.id} está duplicado na população.`);
    }
    if (!Number.isFinite(individual.fitness)) {
      throw new TypeError(`O fitness do indivíduo ${individual.id} deve ser finito.`);
    }
    if (!Array.isArray(individual.genome) || individual.genome.length !== expectedGeneCount) {
      throw new RangeError(
        `O genoma do indivíduo ${individual.id} deve conter ${expectedGeneCount} genes.`,
      );
    }
    for (const [geneIndex, gene] of individual.genome.entries()) {
      if (!Number.isFinite(gene) || gene < geneMin || gene > geneMax) {
        throw new RangeError(
          `O gene ${geneIndex} do indivíduo ${individual.id} deve estar entre ${geneMin} e ${geneMax}.`,
        );
      }
    }
    ids.add(individual.id);
  }
}

function validateOptions({
  generation,
  genetics,
  geneMin,
  geneMax,
  quantizationDecimals,
  sourcePopulationSize,
  targetPopulationSize,
}) {
  if (!Number.isSafeInteger(generation) || generation <= 1) {
    throw new TypeError("A nova geração deve ser um inteiro seguro maior que um.");
  }
  if (!genetics || typeof genetics !== "object") {
    throw new TypeError("A evolução exige uma configuração genética.");
  }
  if (!Number.isSafeInteger(targetPopulationSize) || targetPopulationSize <= 0) {
    throw new RangeError("A população-alvo deve ser um inteiro positivo.");
  }
  if (!Number.isSafeInteger(genetics.eliteCount)
    || genetics.eliteCount <= 0
    || genetics.eliteCount > sourcePopulationSize
    || genetics.eliteCount > targetPopulationSize) {
    throw new RangeError("A quantidade de elites deve caber nas populações atual e alvo.");
  }
  if (!Number.isSafeInteger(genetics.tournamentSize)
    || genetics.tournamentSize <= 0
    || genetics.tournamentSize > sourcePopulationSize
    || genetics.tournamentSize > targetPopulationSize) {
    throw new RangeError("O torneio deve caber nas populações atual e alvo.");
  }
  for (const [value, label] of [
    [genetics.uniformCrossoverParentAChance, "A chance do crossover"],
    [genetics.mutationChancePerGene, "A chance de mutação"],
  ]) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new RangeError(`${label} deve estar entre zero e um.`);
    }
  }
  if (!Number.isFinite(genetics.mutationStdDev) || genetics.mutationStdDev < 0) {
    throw new RangeError("O desvio da mutação deve ser finito e não negativo.");
  }
  if (!Number.isFinite(geneMin) || !Number.isFinite(geneMax) || geneMin >= geneMax) {
    throw new RangeError("Os limites dos genes devem ser finitos e crescentes.");
  }
  if (!Number.isInteger(quantizationDecimals)
    || quantizationDecimals < 0 || quantizationDecimals > 12) {
    throw new RangeError("A quantização genética deve estar entre 0 e 12 casas.");
  }
}

function selectTournamentWinner(candidates, size, random) {
  const available = Array.from({ length: candidates.length }, (_, index) => index);
  let winner = null;

  for (let position = 0; position < size; position += 1) {
    const selectedPosition = random.nextInt(position, available.length);
    [available[position], available[selectedPosition]] = [
      available[selectedPosition],
      available[position],
    ];
    const candidate = candidates[available[position]];
    if (winner === null || compareCandidates(candidate, winner) < 0) {
      winner = candidate;
    }
  }

  return winner;
}

function freezeRecord({ id, origin, parentIds, genome }) {
  return Object.freeze({
    id,
    origin,
    parentIds: Object.freeze([...parentIds]),
    genome: Object.freeze([...genome]),
  });
}

function freezeArchivedElite({ generation, beingId, fitness, genome }) {
  return Object.freeze({
    generation,
    beingId,
    fitness,
    genome: Object.freeze([...genome]),
  });
}

function validateArchivedElites(archive, { expectedGeneCount, geneMin, geneMax }) {
  if (!Array.isArray(archive)) {
    throw new TypeError("O arquivo de elites deve ser uma lista.");
  }
  for (const [index, elite] of archive.entries()) {
    if (!elite
      || !Number.isSafeInteger(elite.generation) || elite.generation <= 0
      || !Number.isSafeInteger(elite.beingId) || elite.beingId <= 0
      || !Number.isFinite(elite.fitness)) {
      throw new TypeError(`A elite histórica ${index} é inválida.`);
    }
    if (!Array.isArray(elite.genome) || elite.genome.length !== expectedGeneCount) {
      throw new RangeError(
        `O genoma da elite histórica ${index} deve conter ${expectedGeneCount} genes.`,
      );
    }
    for (const gene of elite.genome) {
      if (!Number.isFinite(gene) || gene < geneMin || gene > geneMax) {
        throw new RangeError("Os genes das elites históricas devem respeitar os limites da rede.");
      }
    }
  }
}

export function updateEliteArchive({
  archive = [],
  individuals,
  generation,
  capacity,
  geneMin,
  geneMax,
}) {
  validateIndividuals(individuals, { geneMin, geneMax });
  if (!Number.isSafeInteger(generation) || generation <= 0) {
    throw new TypeError("A geração avaliada deve ser um inteiro seguro positivo.");
  }
  if (!Number.isSafeInteger(capacity) || capacity <= 0 || capacity > individuals.length) {
    throw new RangeError("A capacidade do arquivo de elites deve caber na população.");
  }
  const expectedGeneCount = individuals[0].genome.length;
  validateArchivedElites(archive, { expectedGeneCount, geneMin, geneMax });

  const bestByGenome = new Map();
  const candidates = [
    ...archive,
    ...individuals.map((individual) => ({
      generation,
      beingId: individual.id,
      fitness: individual.fitness,
      genome: individual.genome,
    })),
  ];
  for (const candidate of candidates) {
    const genomeKey = JSON.stringify(candidate.genome);
    const current = bestByGenome.get(genomeKey);
    if (current === undefined || compareArchivedElites(candidate, current) < 0) {
      bestByGenome.set(genomeKey, candidate);
    }
  }

  return Object.freeze(
    [...bestByGenome.values()]
      .sort(compareArchivedElites)
      .slice(0, capacity)
      .map(freezeArchivedElite),
  );
}

export class GeneticAlgorithm {
  static createNextGeneration({
    individuals,
    eliteCandidates = null,
    generation,
    simulationSeed,
    genetics,
    geneMin,
    geneMax,
    quantizationDecimals = 9,
    targetPopulationSize = individuals.length,
    profiler = NOOP_PERFORMANCE_PROFILER,
  }) {
    validateIndividuals(individuals, { geneMin, geneMax });
    validateOptions({
      generation,
      genetics,
      geneMin,
      geneMax,
      quantizationDecimals,
      sourcePopulationSize: individuals.length,
      targetPopulationSize,
    });

    const ranked = [...individuals].sort(compareCandidates);
    const { eliteCount } = genetics;
    if (eliteCandidates !== null) {
      validateArchivedElites(eliteCandidates, {
        expectedGeneCount: ranked[0].genome.length,
        geneMin,
        geneMax,
      });
      if (eliteCandidates.length !== eliteCount) {
        throw new RangeError(`A evolução exige exatamente ${eliteCount} elites históricas.`);
      }
    }
    const elites = eliteCandidates ?? ranked.slice(0, eliteCount);
    const result = [];

    for (let index = 0; index < eliteCount; index += 1) {
      const source = elites[index];
      result.push(freezeRecord({
        id: index + 1,
        origin: "elite",
        parentIds: [source.beingId ?? source.id],
        genome: source.genome,
      }));
    }

    const rootRandom = SeededRandom.fromSeed(simulationSeed);
    for (let id = eliteCount + 1; id <= targetPopulationSize; id += 1) {
      const streamPrefix = `generation:${generation}:offspring:${id}`;
      const parentA = profiler.measure("evolution.parent-selection", () => (
        selectTournamentWinner(
          ranked,
          genetics.tournamentSize,
          rootRandom.fork(`${streamPrefix}:parent-a`),
        )
      ));
      const parentB = profiler.measure("evolution.parent-selection", () => (
        selectTournamentWinner(
          ranked,
          genetics.tournamentSize,
          rootRandom.fork(`${streamPrefix}:parent-b`),
        )
      ));
      const crossoverRandom = rootRandom.fork(`${streamPrefix}:crossover`);
      const mutationChoiceRandom = rootRandom.fork(`${streamPrefix}:mutation-choice`);
      const mutationNoiseRandom = rootRandom.fork(`${streamPrefix}:mutation-noise`);
      const genome = profiler.measure("evolution.genome", () => {
        const genes = [];
        for (let geneIndex = 0; geneIndex < parentA.genome.length; geneIndex += 1) {
          const sourceGene = crossoverRandom.nextFloat()
            < genetics.uniformCrossoverParentAChance
            ? parentA.genome[geneIndex]
            : parentB.genome[geneIndex];
          const shouldMutate = mutationChoiceRandom.nextFloat()
            < genetics.mutationChancePerGene;
          const mutatedGene = shouldMutate
            ? sourceGene + mutationNoiseRandom.nextGaussian(0, genetics.mutationStdDev)
            : sourceGene;
          genes.push(quantize(
            Math.min(geneMax, Math.max(geneMin, mutatedGene)),
            quantizationDecimals,
          ));
        }
        return genes;
      });

      result.push(freezeRecord({
        id,
        origin: "offspring",
        parentIds: [parentA.id, parentB.id],
        genome,
      }));
    }

    return Object.freeze(result);
  }
}
