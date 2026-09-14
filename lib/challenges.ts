import type { Challenge } from "./types";

/**
 * The track. Order here is the order on the site.
 *
 * `repoFullName` is the upstream every submission must be a fork of — the
 * verification flow pins to it, so changing one of these invalidates existing
 * manifests. See the architecture doc, §4.
 */
export const CHALLENGES: Challenge[] = [
  {
    id: "vault-limit",
    index: 1,
    eyebrow: "Assignment 01 · Vault",
    title: "Cap what a vault can pay out in one transaction.",
    emphasis: "pay out",
    tagline:
      "The vault works. It has no limits. Add a per-transaction withdrawal ceiling — stored in state, set at initialize, enforced on withdraw — then prove it with tests.",
    level: "Beginner–Intermediate",
    time: "2–4 hours",
    stack: "Anchor 1.1.2 · LiteSVM",
    checkpoints: 9,
    tutorialUrl: "https://tutorial-vault-lamports.vercel.app/",
    repoFullName: "javierbonill4/solana-summer-vault",
    pointsCanonical: 100,
    pointsMutation: 60,
    mutationEnabled: true,
  },
  {
    id: "escrow-timelock",
    index: 2,
    eyebrow: "Assignment 02 · Escrow",
    title: "Make an offer the maker cannot instantly retract.",
    emphasis: "cannot",
    tagline:
      "The escrow lets a maker cancel the moment anyone tries to take their offer. Stamp each escrow with its creation time, hold cancellation shut for five minutes, and write the tests that prove both sides of that line.",
    level: "Intermediate",
    time: "3–5 hours",
    stack: "Anchor 1.0 · SPL Token",
    checkpoints: 9,
    tutorialUrl: "https://solana-escrow-tutorial.vercel.app/",
    repoFullName: "javierbonill4/solana-summer-escrow",
    pointsCanonical: 100,
    pointsMutation: 60,
    mutationEnabled: false,
  },
  {
    id: "token22-identity",
    index: 3,
    eyebrow: "Assignment 03 · Token-2022",
    title: "Ship a token that says what it is.",
    emphasis: "says",
    tagline:
      "The mint in this repo has no name, no symbol, no picture, and no way to put tokens in anyone's hands. Give it an identity, pick one more extension that fits the story, mint to two wallets, and prove all of it with tests.",
    level: "Intermediate",
    time: "4–6 hours",
    stack: "Anchor 1.0 · Token-2022",
    checkpoints: 9,
    tutorialUrl: "https://solana-token22-tutorial.vercel.app/",
    repoFullName: "ASCorreia/solana-summer-t22",
    pointsCanonical: 100,
    pointsMutation: 60,
    mutationEnabled: false,
  },
];

export function getChallenge(id: string): Challenge | undefined {
  return CHALLENGES.find((c) => c.id === id);
}

/**
 * What a learner can actually reach today, not what the schema allows.
 * Mutation points only count once that challenge has a pack behind it.
 */
export const MAX_CHALLENGE_POINTS = CHALLENGES.reduce(
  (sum, c) => sum + c.pointsCanonical + (c.mutationEnabled ? c.pointsMutation : 0),
  0
);
