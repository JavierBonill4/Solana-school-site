import type { Challenge } from "./types";

/** Full mutation credit at this kill rate. Below it, credit scales linearly. */
export const MUTATION_FULL_CREDIT_AT = 0.8;

/**
 * Credit for having actually done the work, whether or not it grades.
 *
 * Earned once per challenge, when a fork is provably the learner's (checks
 * 1–4 all pass) AND its program source differs from the upstream baseline.
 * It is ABSORBED into the challenge total, not added to it: attempt then pass
 * pays 20 then 80, never 120, so the advertised ceiling stays honest.
 *
 * This is attendance, not achievement. It is trivially earnable by anyone who
 * opens the repo and changes a line — which is the point. 20 × 3 challenges is
 * 60 of 380 available, enough to show who has started and not enough to move
 * anyone up the leaderboard.
 */
export const ATTEMPT_POINTS = 20;

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

/**
 * The ledger rows that take a learner from `already` to `target` on one
 * challenge, labelled by what each part was for.
 *
 * The ledger is append-only and delta-based, so the interesting case is the
 * partial one: somebody who has 20 points of attempt credit and then passes
 * is owed 80 under "canonical", not 80 under "mutation" and not 100 under
 * anything. Getting the reason wrong makes the history unreadable later,
 * which is the one thing an append-only ledger exists to prevent.
 */
export function ledgerDeltas(
  target: number,
  already: number,
  pointsCanonical: number
): { reason: "canonical" | "mutation"; delta: number }[] {
  const canonicalDelta = Math.max(
    0,
    Math.min(target, pointsCanonical) - already
  );
  const afterCanonical = already + canonicalDelta;
  const mutationDelta = Math.max(0, target - afterCanonical);

  const out: { reason: "canonical" | "mutation"; delta: number }[] = [];
  if (canonicalDelta > 0) out.push({ reason: "canonical", delta: canonicalDelta });
  if (mutationDelta > 0) out.push({ reason: "mutation", delta: mutationDelta });
  return out;
}

export function shortAddress(pubkey: string, lead = 4, tail = 4): string {
  if (pubkey.length <= lead + tail + 1) return pubkey;
  return `${pubkey.slice(0, lead)}…${pubkey.slice(-tail)}`;
}
