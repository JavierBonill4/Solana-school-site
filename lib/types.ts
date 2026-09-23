/**
 * `attempted` sits between failed and passed: the fork is provably theirs and
 * the source has diverged from upstream, but it does not grade yet. It earns
 * ATTEMPT_POINTS and shows as an amber half-ring.
 */
export type SubmissionStatus =
  | "passed"
  | "attempted"
  | "failed"
  | "pending"
  | "none";

export interface Challenge {
  id: string;
  index: number;
  eyebrow: string;
  title: string;
  /** The word inside `title` rendered in the accent colour. */
  emphasis: string;
  tagline: string;
  level: string;
  time: string;
  stack: string;
  checkpoints: number;
  tutorialUrl: string;
  /** The upstream to fork. Empty for a challenge that scaffolds its own. */
  repoFullName: string;
  /**
   * "ci" runs the full verification pipeline. "repo" is the placeholder used
   * while a challenge has no grading layer yet: it confirms the repository is
   * real, public and not the starter, and awards the points.
   */
  grading?: "ci" | "repo";
  pointsCanonical: number;
  pointsMutation: number;
  /**
   * True only once a mutant pack is published and pinned in verify.yml.
   * While false, `pointsMutation` is unreachable, so it is left out of the
   * advertised ceiling — a progress bar that can never fill reads as broken.
   */
  mutationEnabled: boolean;
}

export interface Submission {
  challengeId: string;
  status: SubmissionStatus;
  commitSha?: string;
  runUrl?: string;
  canonicalPassed?: number;
  canonicalTotal?: number;
  mutantsKilled?: number;
  mutantsTotal?: number;
  pointsAwarded: number;
  /** Why it failed, in the learner's words. Not set when status is "passed". */
  reason?: string;
  submittedAt?: string;
  /** How many commits have been submitted for this challenge, ever. */
  attempts?: number;
}

export type SideQuestState =
  | "unclaimed"
  | "pending"
  | "verified"
  | "rejected";

/**
 * Public metadata for a side quest. No verification logic here on purpose —
 * this object is serialized to the browser. Verifiers live server-side in
 * lib/sidequest-verifiers.server.ts.
 */
export interface SideQuest {
  id: string;
  title: string;
  blurb: string;
  points: number;
  href?: string;
}

export interface SideQuestVerifier {
  kind: string;
  /** Returns true when the quest is proven for this wallet. */
  check: (pubkey: string) => Promise<boolean>;
}

export interface SideQuestClaim {
  questId: string;
  state: SideQuestState;
  pointsAwarded: number;
  claimedAt?: string;
}

export interface LedgerEntry {
  id: string;
  pubkey: string;
  delta: number;
  reason: string;
  challengeId?: string;
  questId?: string;
  createdAt: string;
}

export interface LeaderboardRow {
  rank: number;
  pubkey: string;
  challengesDone: number;
  sideQuestsDone: number;
  points: number;
}

export interface EcosystemLink {
  name: string;
  href: string;
  blurb: string;
  /** Shown as a mono tag. Dates, cost, status — whatever is true right now. */
  note?: string;
}

export interface EcosystemGroup {
  heading: string;
  intro: string;
  links: EcosystemLink[];
}
