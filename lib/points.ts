import type { Challenge } from "./types";

/** Full mutation credit at this kill rate. Below it, credit scales linearly. */
export const MUTATION_FULL_CREDIT_AT = 0.8;

/**
 * The canonical suite is all-or-nothing: a checkpoint is done or it isn't.
 * Mutation score gets partial credit, because it's a quality gradient.
 */
export function scoreSubmission(
  challenge: Challenge,
  canonicalPassed: number,
  canonicalTotal: number,
  mutantsKilled: number,
  mutantsTotal: number
): number {
  if (canonicalTotal === 0 || canonicalPassed < canonicalTotal) return 0;

  const rate = mutantsTotal === 0 ? 0 : mutantsKilled / mutantsTotal;
  const scaled = Math.min(1, rate / MUTATION_FULL_CREDIT_AT);

  return challenge.pointsCanonical + Math.round(challenge.pointsMutation * scaled);
}

export function shortAddress(pubkey: string, lead = 4, tail = 4): string {
  if (pubkey.length <= lead + tail + 1) return pubkey;
  return `${pubkey.slice(0, lead)}…${pubkey.slice(-tail)}`;
}
