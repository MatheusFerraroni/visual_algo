export function normalizeFollowTarget(target) {
  if (target === null) {
    return null;
  }
  if (!target || !["being", "best-alive"].includes(target.mode)
    || (target.mode === "being"
      && (!Number.isSafeInteger(target.id) || target.id <= 0))) {
    throw new TypeError("O acompanhamento deve identificar um ser, o melhor vivo ou ser nulo.");
  }
  return Object.freeze(target.mode === "being"
    ? { mode: "being", id: target.id }
    : { mode: "best-alive" });
}

export function resolveFollowedBeing(snapshot, target) {
  if (!snapshot || !Array.isArray(snapshot.beings)
    || !snapshot.population || typeof snapshot.population !== "object") {
    throw new TypeError("O acompanhamento exige um snapshot de população válido.");
  }
  const normalized = normalizeFollowTarget(target);
  if (normalized === null) {
    return null;
  }
  const beingId = normalized.mode === "best-alive"
    ? snapshot.population.bestAliveBeingId
    : normalized.id;
  return snapshot.beings.find(({ id, alive }) => id === beingId && alive) ?? null;
}
