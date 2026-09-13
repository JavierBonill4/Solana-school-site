import { sql } from "drizzle-orm";
import {
  bigint,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Postgres. Serverless filesystems are ephemeral, so a SQLite file resets on
 * every cold start — this is the same shape, on a database that persists.
 */

export const users = pgTable("users", {
  pubkey: text("pubkey").primaryKey(),
  githubLogin: text("github_login").unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const submissions = pgTable(
  "submissions",
  {
    id: text("id").primaryKey(),
    userPubkey: text("user_pubkey")
      .notNull()
      .references(() => users.pubkey),
    challengeId: text("challenge_id").notNull(),
    repoFullName: text("repo_full_name").notNull(),
    commitSha: text("commit_sha").notNull(),
    // GitHub run ids are ~3.4e10 and climbing — int4 would overflow.
    runId: bigint("run_id", { mode: "number" }),
    runUrl: text("run_url"),
    // 'pending' | 'passed' | 'failed' | 'rejected'
    status: text("status").notNull().default("pending"),
    canonicalPassed: integer("canonical_passed"),
    canonicalTotal: integer("canonical_total"),
    mutantsKilled: integer("mutants_killed"),
    mutantsTotal: integer("mutants_total"),
    pointsAwarded: integer("points_awarded").notNull().default(0),
    reason: text("reason"),
    resultJson: text("result_json"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    onceCommit: uniqueIndex("submissions_once").on(
      t.userPubkey,
      t.challengeId,
      t.commitSha
    ),
    byUser: index("submissions_by_user").on(t.userPubkey),
  })
);

export const sideQuestClaims = pgTable(
  "side_quest_claims",
  {
    id: text("id").primaryKey(),
    userPubkey: text("user_pubkey")
      .notNull()
      .references(() => users.pubkey),
    questId: text("quest_id").notNull(),
    // 'pending' | 'verified' | 'rejected'
    state: text("state").notNull().default("pending"),
    pointsAwarded: integer("points_awarded").notNull().default(0),
    evidence: text("evidence"),
    claimedAt: timestamp("claimed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    once: uniqueIndex("claims_once").on(t.userPubkey, t.questId),
  })
);

/**
 * Append-only. Never UPDATE, never DELETE — correct a mistake by writing a
 * negative delta, so a regrade is visible rather than a number that quietly
 * changed. `badgeMint` is the queue when you add on-chain badges.
 */
export const pointsLedger = pgTable(
  "points_ledger",
  {
    id: text("id").primaryKey(),
    userPubkey: text("user_pubkey")
      .notNull()
      .references(() => users.pubkey),
    delta: integer("delta").notNull(),
    // 'canonical' | 'mutation' | 'sidequest' | 'first-blood' | 'revoked'
    reason: text("reason").notNull(),
    challengeId: text("challenge_id"),
    questId: text("quest_id"),
    submissionId: text("submission_id"),
    badgeMint: text("badge_mint"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    byUser: index("ledger_by_user").on(t.userPubkey),
  })
);

/**
 * Sign-in nonces. In a Map these worked locally and failed intermittently in
 * production, because the instance that issues one is rarely the instance
 * that verifies it.
 */
export const authNonces = pgTable("auth_nonces", {
  nonce: text("nonce").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const _sql = sql;
