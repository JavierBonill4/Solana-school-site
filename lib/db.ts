import "server-only";
import { randomUUID } from "crypto";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import {
  authNonces,
  pointsLedger,
  sideQuestClaims,
  submissions,
  users,
} from "./schema";
import type {
  LeaderboardRow,
  SideQuestClaim,
  SideQuestState,
  Submission,
  SubmissionStatus,
} from "./types";
import { CHALLENGES } from "./challenges";

/**
 * The only file that talks to the database.
 *
 * Schema changes go through drizzle-kit, not through code here — see
 * `npm run db:push`. Nothing in this file creates tables at runtime: doing
 * that on a serverless cold start races with every other instance doing the
 * same thing.
 */

declare global {
  // eslint-disable-next-line no-var
  var __ssPool: ReturnType<typeof postgres> | undefined;
}

function client() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and point it at a Postgres database."
    );
  }

  // One connection per instance, cached across hot invocations. `prepare:
  // false` is required behind a transaction pooler (Neon/Supabase pgBouncer),
  // which silently breaks prepared statements otherwise.
  if (!global.__ssPool) {
    global.__ssPool = postgres(url, { max: 1, prepare: false });
  }
  return global.__ssPool;
}

let _db: ReturnType<typeof drizzle> | null = null;

function db() {
  if (!_db) _db = drizzle(client());
  return _db;
}

// ── users ────────────────────────────────────────────────────────────────

export async function ensureUser(pubkey: string): Promise<void> {
  await db().insert(users).values({ pubkey }).onConflictDoNothing();
}

export async function getGithubLogin(pubkey: string): Promise<string | null> {
  const [row] = await db()
    .select({ githubLogin: users.githubLogin })
    .from(users)
    .where(eq(users.pubkey, pubkey));
  return row?.githubLogin ?? null;
}

export async function setGithubLogin(
  pubkey: string,
  login: string
): Promise<void> {
  await ensureUser(pubkey);
  await db().update(users).set({ githubLogin: login }).where(eq(users.pubkey, pubkey));
}

// ── submissions ──────────────────────────────────────────────────────────

export async function getSubmissions(pubkey: string): Promise<Submission[]> {
  const rows = await db()
    .select()
    .from(submissions)
    .where(eq(submissions.userPubkey, pubkey))
    .orderBy(desc(submissions.createdAt));

  // One row per challenge: the most recent submission wins.
  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!latest.has(r.challengeId)) latest.set(r.challengeId, r);

  return [...latest.values()].map((r) => ({
    challengeId: r.challengeId,
    status: r.status as SubmissionStatus,
    commitSha: r.commitSha,
    runUrl: r.runUrl ?? undefined,
    canonicalPassed: r.canonicalPassed ?? undefined,
    canonicalTotal: r.canonicalTotal ?? undefined,
    mutantsKilled: r.mutantsKilled ?? undefined,
    mutantsTotal: r.mutantsTotal ?? undefined,
    pointsAwarded: r.pointsAwarded,
    reason: r.reason ?? undefined,
    submittedAt: r.createdAt.toISOString(),
  }));
}

export async function findSubmission(
  pubkey: string,
  challengeId: string,
  commitSha: string
) {
  const [row] = await db()
    .select()
    .from(submissions)
    .where(
      and(
        eq(submissions.userPubkey, pubkey),
        eq(submissions.challengeId, challengeId),
        eq(submissions.commitSha, commitSha)
      )
    );
  return row ?? null;
}

export async function recordSubmission(input: {
  pubkey: string;
  challengeId: string;
  repoFullName: string;
  commitSha: string;
  runId?: number;
  runUrl?: string;
  status: SubmissionStatus | "pending" | "rejected";
  canonicalPassed?: number;
  canonicalTotal?: number;
  mutantsKilled?: number;
  mutantsTotal?: number;
  pointsAwarded?: number;
  reason?: string;
  resultJson?: unknown;
}): Promise<string> {
  await ensureUser(input.pubkey);
  const id = randomUUID();

  await db()
    .insert(submissions)
    .values({
      id,
      userPubkey: input.pubkey,
      challengeId: input.challengeId,
      repoFullName: input.repoFullName,
      commitSha: input.commitSha,
      runId: input.runId,
      runUrl: input.runUrl,
      status: input.status,
      canonicalPassed: input.canonicalPassed,
      canonicalTotal: input.canonicalTotal,
      mutantsKilled: input.mutantsKilled,
      mutantsTotal: input.mutantsTotal,
      pointsAwarded: input.pointsAwarded ?? 0,
      reason: input.reason,
      resultJson: input.resultJson ? JSON.stringify(input.resultJson) : null,
    })
    // The unique index exists to stop double-AWARDING, not to freeze the
    // record. Without this, resubmitting the same commit silently keeps the
    // first result forever and the portfolio shows a stale reason.
    .onConflictDoUpdate({
      target: [
        submissions.userPubkey,
        submissions.challengeId,
        submissions.commitSha,
      ],
      set: {
        runId: input.runId,
        runUrl: input.runUrl,
        status: input.status,
        canonicalPassed: input.canonicalPassed,
        canonicalTotal: input.canonicalTotal,
        mutantsKilled: input.mutantsKilled,
        mutantsTotal: input.mutantsTotal,
        reason: input.reason,
        resultJson: input.resultJson ? JSON.stringify(input.resultJson) : null,
        createdAt: new Date(),
      },
      // Never downgrade a submission that already earned points.
      setWhere: sql`${submissions.status} != 'passed'`,
    });

  return id;
}

// ── side quests ──────────────────────────────────────────────────────────

export async function getClaims(pubkey: string): Promise<SideQuestClaim[]> {
  const rows = await db()
    .select()
    .from(sideQuestClaims)
    .where(eq(sideQuestClaims.userPubkey, pubkey));

  return rows.map((r) => ({
    questId: r.questId,
    state: r.state as SideQuestState,
    pointsAwarded: r.pointsAwarded,
    claimedAt: r.claimedAt.toISOString(),
  }));
}

export async function upsertClaim(
  pubkey: string,
  claim: SideQuestClaim & { evidence?: string }
): Promise<void> {
  await ensureUser(pubkey);
  await db()
    .insert(sideQuestClaims)
    .values({
      id: randomUUID(),
      userPubkey: pubkey,
      questId: claim.questId,
      state: claim.state,
      pointsAwarded: claim.pointsAwarded,
      evidence: claim.evidence,
    })
    .onConflictDoUpdate({
      target: [sideQuestClaims.userPubkey, sideQuestClaims.questId],
      set: {
        state: claim.state,
        pointsAwarded: claim.pointsAwarded,
        evidence: claim.evidence,
      },
    });
}

/** Every claim awaiting a human, newest first. Powers the admin queue. */
export async function getPendingClaims() {
  return db()
    .select()
    .from(sideQuestClaims)
    .where(eq(sideQuestClaims.state, "pending"))
    .orderBy(desc(sideQuestClaims.claimedAt));
}

// ── points ───────────────────────────────────────────────────────────────

export async function appendLedger(entry: {
  pubkey: string;
  delta: number;
  reason: string;
  challengeId?: string;
  questId?: string;
  submissionId?: string;
}): Promise<void> {
  await ensureUser(entry.pubkey);
  await db().insert(pointsLedger).values({
    id: randomUUID(),
    userPubkey: entry.pubkey,
    delta: entry.delta,
    reason: entry.reason,
    challengeId: entry.challengeId,
    questId: entry.questId,
    submissionId: entry.submissionId,
  });
}

async function sumLedger(pubkey: string, where?: "sidequest" | "not-sidequest") {
  const rows = await db()
    .select({ delta: pointsLedger.delta, reason: pointsLedger.reason })
    .from(pointsLedger)
    .where(eq(pointsLedger.userPubkey, pubkey));

  return rows
    .filter((r) =>
      where === "sidequest"
        ? r.reason === "sidequest"
        : where === "not-sidequest"
          ? r.reason !== "sidequest"
          : true
    )
    .reduce((sum, r) => sum + r.delta, 0);
}

export async function getPoints(pubkey: string): Promise<number> {
  return sumLedger(pubkey);
}

export async function getChallengePoints(pubkey: string): Promise<number> {
  return sumLedger(pubkey, "not-sidequest");
}

export async function getSideQuestPoints(pubkey: string): Promise<number> {
  return sumLedger(pubkey, "sidequest");
}

// ── leaderboard ──────────────────────────────────────────────────────────

/**
 * A real query. Empty until somebody's submission passes, which is the
 * honest state of a site nobody has used yet.
 */
export async function getLeaderboard(limit = 50): Promise<LeaderboardRow[]> {
  const rows = await db()
    .select({
      pubkey: pointsLedger.userPubkey,
      points: sql<number>`sum(${pointsLedger.delta})`.as("points"),
    })
    .from(pointsLedger)
    .groupBy(pointsLedger.userPubkey)
    .orderBy(desc(sql`points`))
    .limit(limit);

  const out: LeaderboardRow[] = [];
  let rank = 0;

  for (const r of rows) {
    const points = Number(r.points);
    if (!Number.isFinite(points) || points <= 0) continue;
    rank += 1;

    const subs = await getSubmissions(r.pubkey);
    const claims = await getClaims(r.pubkey);

    out.push({
      rank,
      pubkey: r.pubkey,
      challengesDone: subs.filter((s) => s.status === "passed").length,
      sideQuestsDone: claims.filter((c) => c.state === "verified").length,
      points,
    });
  }

  return out;
}

export const TOTAL_CHALLENGES = CHALLENGES.length;

/** Any wallet that has already claimed this fork for this challenge. */
export async function findRepoClaimant(
  challengeId: string,
  repoFullName: string
): Promise<string | null> {
  const [row] = await db()
    .select({ userPubkey: submissions.userPubkey })
    .from(submissions)
    .where(
      and(
        eq(submissions.challengeId, challengeId),
        eq(submissions.repoFullName, repoFullName)
      )
    )
    .limit(1);
  return row?.userPubkey ?? null;
}
/**
 * Points already awarded to this wallet for this challenge, across every
 * commit they have ever submitted.
 *
 * This is what stops a second passing commit paying out a second time. The
 * canonical suite is all-or-nothing, so any legitimate increase comes from a
 * better mutation score — award the DIFFERENCE, and the ledger stays an
 * honest record of what was earned when.
 */
export async function getAwardedForChallenge(
  pubkey: string,
  challengeId: string
): Promise<number> {
  const rows = await db()
    .select({ delta: pointsLedger.delta })
    .from(pointsLedger)
    .where(
      and(
        eq(pointsLedger.userPubkey, pubkey),
        eq(pointsLedger.challengeId, challengeId)
      )
    );
  return rows.reduce((sum, r) => sum + r.delta, 0);
}

// ── sign-in nonces ───────────────────────────────────────────────────────

const NONCE_TTL_MS = 5 * 60 * 1000;

export async function issueNonce(): Promise<string> {
  const nonce = randomUUID().replace(/-/g, "");
  await db()
    .insert(authNonces)
    .values({ nonce, expiresAt: new Date(Date.now() + NONCE_TTL_MS) });

  // Opportunistic sweep. Cheap, and saves running a scheduled job for a
  // table that is only ever a handful of rows.
  await db().delete(authNonces).where(lt(authNonces.expiresAt, new Date()));

  return nonce;
}

/**
 * True exactly once per nonce. The DELETE … RETURNING is what makes that
 * atomic: two concurrent replays race on the same row and only one gets it
 * back, so a captured signature cannot be reused.
 */
export async function consumeNonce(nonce: string): Promise<boolean> {
  const rows = await db()
    .delete(authNonces)
    .where(and(eq(authNonces.nonce, nonce), sql`${authNonces.expiresAt} > now()`))
    .returning({ nonce: authNonces.nonce });
  return rows.length > 0;
}
