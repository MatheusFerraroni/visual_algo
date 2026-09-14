import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeFollowTarget,
  resolveFollowedBeing,
} from "../src/rendering/follow-target.js";

function createSnapshot(bestAliveBeingId) {
  return Object.freeze({
    beings: Object.freeze([
      Object.freeze({ id: 1, alive: true, x: 1, y: 2 }),
      Object.freeze({ id: 2, alive: bestAliveBeingId === 2, x: 3, y: 4 }),
    ]),
    population: Object.freeze({ bestAliveBeingId }),
  });
}

test("acompanhamento manual exige ser vivo e melhor vivo transfere com o resumo", () => {
  const first = createSnapshot(1);
  const second = createSnapshot(2);
  const bestTarget = normalizeFollowTarget({ mode: "best-alive" });

  assert.equal(resolveFollowedBeing(first, bestTarget).id, 1);
  assert.equal(resolveFollowedBeing(second, bestTarget).id, 2);
  assert.equal(resolveFollowedBeing(first, { mode: "being", id: 1 }).id, 1);
  assert.equal(resolveFollowedBeing(first, { mode: "being", id: 2 }), null);
  assert.strictEqual(resolveFollowedBeing(first, null), null);
  assert.deepEqual(first, createSnapshot(1));
});

test("alvo de acompanhamento é normalizado e validado", () => {
  const manual = normalizeFollowTarget({ mode: "being", id: 7, ignored: true });
  assert.deepEqual(manual, { mode: "being", id: 7 });
  assert(Object.isFrozen(manual));
  assert.deepEqual(normalizeFollowTarget({ mode: "best-alive", id: 9 }), {
    mode: "best-alive",
  });
  assert.throws(() => normalizeFollowTarget({ mode: "being", id: 0 }), /acompanhamento/);
  assert.throws(() => normalizeFollowTarget({ mode: "food", id: 1 }), /acompanhamento/);
  assert.throws(
    () => resolveFollowedBeing({ beings: [] }, { mode: "best-alive" }),
    /snapshot de população/,
  );
});
