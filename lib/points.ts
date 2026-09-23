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
 * opens the repo and changes a line — which is the point. 20 × 4 challenges is
 * 80 of 460 available, enough to show who has started and not enough to move
 * anyone up the leaderboard.
 */
export const ATTEMPT_POINTS = 20;

/**
 * Does this submission satisfy what the challenge asks for?
 *
 * Kept separate from scoring so the two questions stay separate: whether the
 * work counts, and what it is worth.
 */
export function meetsRequirement(
  challenge: Challenge,
  canonicalPassed: number,
  canonicalTotal: number,
  gatesMet: boolean | null
): { ok: boolean; why: string } {
  const canonicalOk = canonicalTotal > 0 && canonicalPassed >= canonicalTotal;
  const requires = challenge.requires ?? "canonical";

  // `null` means the grader did not report gates at all — an older grade.py
  // still in someone's fork. Falling back to the canonical picture keeps
  // those submissions gradeable instead of failing them for our change.
  if (gatesMet === null && requires !== "canonical") {
    return canonicalOk
      ? { ok: true, why: "canonical suite passed (this run reported no gates)" }
      : {
          ok: false,
          why: `Canonical suite ${canonicalPassed}/${canonicalTotal}, and this run is from a grader that predates the four gates. Sync your fork with the upstream and push again.`,
        };
  }

  if (requires === "canonical") {
    return canonicalOk
      ? { ok: true, why: "canonical suite passed" }
      : {
          ok: false,
          why: `Canonical suite ${canonicalPassed}/${canonicalTotal}. Every test has to pass — a checkpoint is done or it is not.`,
        };
  }

  if (requires === "gates") {
    return gatesMet
      ? { ok: true, why: "all four gates met" }
      : { ok: false, why: "Not all four gates are met — see the notes below." };
  }

  // "both"
  if (!canonicalOk) {
    return {
      ok: false,
      why: `Canonical suite ${canonicalPassed}/${canonicalTotal}. Every test has to pass — a checkpoint is done or it is not.`,
    };
  }
  return gatesMet
    ? { ok: true, why: "canonical suite passed and all four gates met" }
    : { ok: false, why: "Canonical suite passed, but not all four gates are met — see the notes below." };
}

/**
 * The canonical suite is all-or-nothing: a checkpoint is done or it isn't.
 * Mutation score gets partial credit, because it's a quality gradient.
 *
 * Callers decide whether the submission qualifies (see meetsRequirement);
 * this only works out what a qualifying one is worth.
 */
export function scoreSubmission(
  challenge: Challenge,
  canonicalPassed: number,
  canonicalTotal: number,
  mutantsKilled: number,
  mutantsTotal: number
): number {
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
