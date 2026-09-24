import type { Challenge } from "./types";

/**
 * The track. Order here is the order on the site.
 *
 * `repoFullName` is the upstream every submission must be a fork of — the
 * verification flow pins to it, so changing one of these invalidates existing
 * manifests. See the architecture doc, §4.
 *
 * `grading` says how a submission is judged:
 *
 *   "ci"   — the full pipeline: fork lineage, wallet-pubkey, sealed files, a
 *            green run of our workflow, and the result artifact it published.
 *   "repo" — a placeholder: we check the repository is real, public and not
 *            the starter, and award the points. It proves somebody has
 *            somewhere to work, nothing more. Swap a challenge to "ci" once
 *            its grading layer is installed and its manifest pinned.
 */
export const CHALLENGES: Challenge[] = [
  {
    id: "local-setup",
    index: 1,
    eyebrow: "Assignment 01 · Setup",
    title: "Get a machine that can build Solana programs.",
    emphasis: "build",
    tagline:
      "Rust, the Solana CLI, Anchor and Node, installed and verified one at a time. Fund a devnet wallet, send a real transaction, scaffold a program, derive a PDA and deploy it. Ten checkpoints, each with a command that proves the last one worked.",
    level: "Beginner",
    time: "60–90 minutes",
    stack: "Rust 1.91 · Solana CLI 3.0 · Anchor 0.32 · Node 22",
    checkpoints: 10,
    tutorialUrl: "https://solana-local-setup.vercel.app/",
    // Nothing to fork — this one scaffolds its own project with `anchor init`.
    repoFullName: "",
    grading: "paste",
    pointsCanonical: 100,
    pointsMutation: 0,
    mutationEnabled: false,
  },
  {
    id: "vault-limit",
    index: 2,
    eyebrow: "Assignment 02 · Vault",
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
    grading: "ci",
    // Switch to "gates" or "both" whenever you like — the grader reports both
    // pictures on every run, so this takes effect on redeploy.
    requires: "canonical",
    pointsCanonical: 100,
    pointsMutation: 60,
    mutationEnabled: true,
  },
  {
    id: "escrow-timelock",
    index: 3,
    eyebrow: "Assignment 03 · Escrow",
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
    grading: "ci",
    requires: "canonical",
    pointsCanonical: 100,
    pointsMutation: 60,
    mutationEnabled: false,
  },
  {
    id: "token22-identity",
    index: 4,
    eyebrow: "Assignment 04 · Token-2022",
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
    grading: "ci",
    pointsCanonical: 100,
    pointsMutation: 60,
    mutationEnabled: false,
  },
  {
    id: "transfer-hook",
    index: 5,
    eyebrow: "Assignment 05 · Transfer Hook",
    title: "Rate-limit a token at the protocol level.",
    emphasis: "Rate-limit",
    tagline:
      "A Token-2022 transfer hook that refuses more than a million base units an hour. The skeleton runs; it counts the wrong things. Check the mint is really Token-2022, key the limit per user and per mint, and let a CPI through without opening a hole.",
    level: "Intermediate–Advanced",
    time: "4–6 hours",
    stack: "Anchor 1.2 · Token-2022 · LiteSVM",
    checkpoints: 6,
    tutorialUrl: "https://transfer-hook-guide-week-2-day2.vercel.app/",
    // Our fork, with the grading layer installed. Learners fork THIS one;
    // decentra1ized's upstream has no grader/ and no workflow, so a fork of it
    // publishes nothing for the site to read.
    repoFullName: "javierbonill4/solana-fall-transfer-hook",
    grading: "ci",
    // Gates only. There is no canonical suite here and no mutant pack: the
    // assignment is open-ended enough that "the one correct implementation"
    // does not exist, so the grader asks whether it builds, whether the
    // learner's own suite is green and larger, whether the IDL grew, and
    // whether a declared error is returned somewhere the starter returned
    // none. grade.py still emits the canonical/mutation fields as 0/0 so the
    // site reads one result shape for every challenge.
    requires: "gates",
    pointsCanonical: 100,
    pointsMutation: 0,
    mutationEnabled: false,
  },
  {
    id: "pinocchio-escrow",
    index: 6,
    eyebrow: "Assignment 06 · Pinocchio",
    title: "Write the escrow again, with no framework at all.",
    emphasis: "no framework",
    tagline:
      "Same escrow, native Rust on Pinocchio. Make is written for you; Take and Cancel are not. No Anchor to check your accounts, so you check them — and then show the compute units it costs, around 30k an instruction.",
    level: "Advanced",
    time: "6–8 hours",
    stack: "Pinocchio 0.11 · LiteSVM · cargo build-sbf",
    checkpoints: 7,
    tutorialUrl: "https://pinocchio-escrow-guide-3-day1.vercel.app/",
    repoFullName: "decentra1ized/solana-fall-pescrow",
    grading: "repo",
    pointsCanonical: 100,
    pointsMutation: 0,
    mutationEnabled: false,
  },
  {
    id: "fundraiser-feature",
    index: 7,
    eyebrow: "Assignment 07 · Fundraiser",
    title: "Ship a feature nobody specified for you.",
    emphasis: "nobody",
    tagline:
      "The fundraiser collects contributions, pays out on success and refunds on failure. It does nothing else. Pick one feature worth adding — milestones, lottery tickets, receipts, rewards, or your own — design the state it needs, build it, and write the three tests that prove it: the happy path, the boundary, and the abuse case.",
    level: "Advanced",
    time: "6–10 hours",
    stack: "Anchor 1.1 · SPL Token · TypeScript tests",
    checkpoints: 8,
    tutorialUrl: "https://tutorial-fundraiser.vercel.app/",
    repoFullName: "JavierBonill4/anchor-fundraiser",
    grading: "ci",
    pointsCanonical: 100,
    pointsMutation: 0,
    // There is nothing canonical to mutate when the learner picks the
    // feature. The grader checks that something was shipped and that it is
    // tested; whether it is any GOOD is the pull request's job.
    mutationEnabled: false,
  },
  {
    id: "metaplex-core",
    index: 8,
    eyebrow: "Assignment 08 · Metaplex Core",
    title: "Mint an NFT that can never leave the wallet it was born in.",
    emphasis: "never leave",
    tagline:
      "A soulbound asset on Metaplex Core, frozen in place by a permanent delegate. Do it in TypeScript first, then again from inside an Anchor program if you want the harder track — and prove it on an explorer that the transfer really is refused.",
    level: "Beginner–Intermediate",
    time: "1.5–2 hours",
    stack: "Metaplex Core · Node 22 · Anchor 1.2",
    checkpoints: 7,
    tutorialUrl: "https://metaplex-core-guide.vercel.app/",
    repoFullName: "ASCorreia/fall-school-metaplex-core",
    grading: "repo",
    pointsCanonical: 100,
    pointsMutation: 0,
    mutationEnabled: false,
  },
  {
    id: "fundraiser-codama",
    index: 9,
    eyebrow: "Assignment 09 · Codama",
    title: "Stop hand-writing the client a machine can generate.",
    emphasis: "a machine",
    tagline:
      "Point Codama at the fundraiser's IDL and let it build the TypeScript client for you. Then prove the generated calls are byte-for-byte what the hand-written ones produced — because a client you did not write is only worth using if you can show it is the same.",
    level: "Intermediate",
    time: "1–2 hours",
    stack: "Codama 1.6 · @solana/kit · Anchor 1.1.2",
    checkpoints: 8,
    tutorialUrl: "https://tutorial-fundraiser-codama.vercel.app/",
    repoFullName: "decentra1ized/solana-fall-fundraiser-codama",
    grading: "repo",
    pointsCanonical: 100,
    pointsMutation: 0,
    mutationEnabled: false,
  },
];

export function getChallenge(id: string): Challenge | undefined {
  return CHALLENGES.find((c) => c.id === id);
}

/**
 * Everything a learner could earn from assignments. Mutation points only
 * count where a mutant pack actually exists — advertising a ceiling nobody
 * can reach makes a progress bar read as broken.
 */
export const MAX_CHALLENGE_POINTS = CHALLENGES.reduce(
  (sum, c) => sum + c.pointsCanonical + (c.mutationEnabled ? c.pointsMutation : 0),
  0
);
