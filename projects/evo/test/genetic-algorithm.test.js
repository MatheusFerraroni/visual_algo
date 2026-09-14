import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  GeneticAlgorithm,
  updateEliteArchive,
} from "../src/core/genetic-algorithm.js";

const INDIVIDUALS = Object.freeze([
  Object.freeze({ id: 1, fitness: 4, genome: Object.freeze([0.1, 0.2, 0.3, 0.4]) }),
  Object.freeze({ id: 2, fitness: 3, genome: Object.freeze([-0.1, -0.2, -0.3, -0.4]) }),
  Object.freeze({ id: 3, fitness: 2, genome: Object.freeze([0.5, 0.6, 0.7, 0.8]) }),
  Object.freeze({ id: 4, fitness: 1, genome: Object.freeze([-0.5, -0.6, -0.7, -0.8]) }),
]);

function createOptions(overrides = {}) {
  return {
    individuals: INDIVIDUALS,
    generation: 2,
    simulationSeed: "evo-1",
    genetics: {
      eliteCount: 1,
      tournamentSize: 1,
      uniformCrossoverParentAChance: 0.5,
      mutationChancePerGene: 0,
      mutationStdDev: 0.15,
      ...overrides.genetics,
    },
    geneMin: -1,
    geneMax: 1,
    quantizationDecimals: 9,
    ...Object.fromEntries(
      Object.entries(overrides).filter(([key]) => key !== "genetics"),
    ),
  };
}

test("elitismo preserva a quantidade exata, desempata por ID e copia sem mutação", () => {
  const tied = [
    { id: 3, fitness: 10, genome: [0.3] },
    { id: 1, fitness: 10, genome: [0.1] },
    { id: 2, fitness: 5, genome: [0.2] },
  ];
  const result = GeneticAlgorithm.createNextGeneration(createOptions({
    individuals: tied,
    genetics: { eliteCount: 2, tournamentSize: 3 },
  }));

  assert.deepEqual(result.slice(0, 2), [
    { id: 1, origin: "elite", parentIds: [1], genome: [0.1] },
    { id: 2, origin: "elite", parentIds: [3], genome: [0.3] },
  ]);
  assert.equal(result[2].origin, "offspring");
  assert(Object.isFrozen(result));
  assert(result.every(Object.isFrozen));
  assert(result.every((entry) => Object.isFrozen(entry.parentIds)));
  assert(result.every((entry) => Object.isFrozen(entry.genome)));
});

test("população formada apenas por elites preserva o ranking completo", () => {
  const result = GeneticAlgorithm.createNextGeneration(createOptions({
    genetics: { eliteCount: INDIVIDUALS.length, tournamentSize: INDIVIDUALS.length },
  }));

  assert(result.every(({ origin }) => origin === "elite"));
  assert.deepEqual(result.map(({ parentIds }) => parentIds), [[1], [2], [3], [4]]);
});

test("população-alvo pode crescer ou diminuir sem alterar as elites", () => {
  const grown = GeneticAlgorithm.createNextGeneration(createOptions({
    targetPopulationSize: 6,
    genetics: { eliteCount: 2, tournamentSize: 2 },
  }));
  const shrunk = GeneticAlgorithm.createNextGeneration(createOptions({
    targetPopulationSize: 2,
    genetics: { eliteCount: 1, tournamentSize: 1 },
  }));

  assert.equal(grown.length, 6);
  assert.deepEqual(grown.map(({ id }) => id), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(grown.slice(0, 2).map(({ genome }) => genome), [
    INDIVIDUALS[0].genome,
    INDIVIDUALS[1].genome,
  ]);
  assert.equal(shrunk.length, 2);
  assert.deepEqual(shrunk[0].genome, INDIVIDUALS[0].genome);
});

test("arquivo global mantém os K melhores genomas sem duplicar reavaliações", () => {
  const firstArchive = updateEliteArchive({
    individuals: INDIVIDUALS,
    generation: 1,
    capacity: 2,
    geneMin: -1,
    geneMax: 1,
  });
  const secondArchive = updateEliteArchive({
    archive: firstArchive,
    individuals: [
      { id: 1, fitness: 1, genome: INDIVIDUALS[0].genome },
      { id: 2, fitness: 3.5, genome: [0.9, 0.8, 0.7, 0.6] },
      { id: 3, fitness: 3.25, genome: [0.8, 0.7, 0.6, 0.5] },
      { id: 4, fitness: 0, genome: INDIVIDUALS[3].genome },
    ],
    generation: 2,
    capacity: 2,
    geneMin: -1,
    geneMax: 1,
  });

  assert.deepEqual(secondArchive, [
    { generation: 1, beingId: 1, fitness: 4, genome: [0.1, 0.2, 0.3, 0.4] },
    { generation: 2, beingId: 2, fitness: 3.5, genome: [0.9, 0.8, 0.7, 0.6] },
  ]);
  assert(Object.isFrozen(secondArchive));
  assert(secondArchive.every((elite) => Object.isFrozen(elite.genome)));

  const evolved = GeneticAlgorithm.createNextGeneration(createOptions({
    individuals: INDIVIDUALS,
    eliteCandidates: secondArchive,
    genetics: { eliteCount: 2, mutationChancePerGene: 1, mutationStdDev: 10 },
  }));
  assert.deepEqual(evolved[0].genome, secondArchive[0].genome);
  assert.deepEqual(evolved[1].genome, secondArchive[1].genome);
  assert.deepEqual(evolved.slice(0, 2).map(({ origin }) => origin), ["elite", "elite"]);
});

test("crossover usa a chance configurada por gene e permite pais coincidentes", () => {
  const parentBOnly = GeneticAlgorithm.createNextGeneration(createOptions({
    genetics: { uniformCrossoverParentAChance: 0 },
  }));
  const mixed = GeneticAlgorithm.createNextGeneration(createOptions({
    genetics: { uniformCrossoverParentAChance: 0.5 },
  }));
  const parentAOnly = GeneticAlgorithm.createNextGeneration(createOptions({
    genetics: { uniformCrossoverParentAChance: 1 },
  }));

  assert.deepEqual(parentBOnly[2], {
    id: 3,
    origin: "offspring",
    parentIds: [4, 2],
    genome: [-0.1, -0.2, -0.3, -0.4],
  });
  assert.deepEqual(mixed[2].genome, [-0.5, -0.6, -0.7, -0.4]);
  assert.deepEqual(parentAOnly[2].genome, [-0.5, -0.6, -0.7, -0.8]);
  assert.deepEqual(mixed[1].parentIds, [2, 2]);
});

test("mutação gaussiana é determinística, quantizada e limitada", () => {
  const options = createOptions({
    genetics: {
      tournamentSize: INDIVIDUALS.length,
      mutationChancePerGene: 1,
      mutationStdDev: 5,
    },
  });
  const first = GeneticAlgorithm.createNextGeneration(options);
  const second = GeneticAlgorithm.createNextGeneration(options);

  assert.deepEqual(first, second);
  assert.deepEqual(first.map(({ genome }) => genome), [
    [0.1, 0.2, 0.3, 0.4],
    [1, -1, -1, -1],
    [1, 1, 1, -1],
    [-1, 1, -1, -0.47836493],
  ]);
  assert.equal(
    createHash("sha256").update(JSON.stringify(first)).digest("hex"),
    "da02dda71cd8671b3af9994cdb3a1da06bf350d05843f82bc9621c5815f52286",
  );
});

test("streams por descendente repetem com a mesma seed e divergem com outra", () => {
  const base = GeneticAlgorithm.createNextGeneration(createOptions());
  const repeated = GeneticAlgorithm.createNextGeneration(createOptions());
  const changed = GeneticAlgorithm.createNextGeneration(createOptions({
    simulationSeed: "evo-2",
  }));

  assert.deepEqual(base, repeated);
  assert.notDeepEqual(base.slice(1), changed.slice(1));
  assert.deepEqual(base[0], changed[0]);
});

test("configurações e populações incompatíveis falham fechadas", () => {
  assert.throws(
    () => GeneticAlgorithm.createNextGeneration(createOptions({
      genetics: { tournamentSize: 5 },
    })),
    /populações atual e alvo/,
  );
  assert.throws(
    () => GeneticAlgorithm.createNextGeneration(createOptions({
      genetics: { eliteCount: 5 },
    })),
    /quantidade de elites/,
  );
  assert.throws(
    () => GeneticAlgorithm.createNextGeneration(createOptions({
      individuals: [
        INDIVIDUALS[0],
        { id: 2, fitness: 1, genome: [0.1] },
      ],
    })),
    /deve conter 4 genes/,
  );
  assert.throws(
    () => GeneticAlgorithm.createNextGeneration(createOptions({
      generation: 1,
    })),
    /maior que um/,
  );
  assert.throws(
    () => GeneticAlgorithm.createNextGeneration(createOptions({
      targetPopulationSize: 2,
      genetics: { tournamentSize: 3 },
    })),
    /populações atual e alvo/,
  );
});
