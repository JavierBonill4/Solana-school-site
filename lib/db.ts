import "server-only";
import { randomUUID } from "crypto";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";
import {
  attendanceRecords,
  attendanceSessions,
  authNonces,
  nameAliases,
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
import { normalizeName } from "./attendance";
import {
  EMPTY_NAMES,
  matchableNames,
  resolveDisplayName,
  type NameSource,
  type Names,
} from "./names";

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

  // One row per challenge: the BEST standing wins, not the most recent.
  //
  // Latest-wins meant a learner who passed and then pushed an experiment lost
  // their green check while keeping the points, so the portfolio disagreed
  // with the ledger. Rows arrive newest-first, so a strict > keeps the newest
  // of an equal pair.
  const RANK: Record<string, number> = {
    passed: 4,
    attempted: 3,
    pending: 2,
    failed: 1,
  };
  const best = new Map<string, (typeof rows)[number]>();
  const attempts = new Map<string, number>();
  for (const r of rows) {
    attempts.set(r.challengeId, (attempts.get(r.challengeId) ?? 0) + 1);
    const held = best.get(r.challengeId);
    if (!held || (RANK[r.status] ?? 0) > (RANK[held.status] ?? 0)) {
      best.set(r.challengeId, r);
    }
  }

  return [...best.values()].map((r) => ({
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
    attempts: attempts.get(r.challengeId) ?? 1,
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
        // Was missing: a row that earned attempt credit on a resubmission
        // showed 0 points on the portfolio while the ledger said otherwise.
        pointsAwarded: input.pointsAwarded ?? 0,
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

// ── profiles ─────────────────────────────────────────────────────────────

export interface Profile extends Names {
  pubkey: string;
  /** Derived from the four names and the chosen source. Read-only. */
  displayName: string | null;
  githubLogin: string | null;
}

export async function getProfile(pubkey: string): Promise<Profile> {
  const [row] = await db()
    .select({
      pubkey: users.pubkey,
      displayName: users.displayName,
      githubLogin: users.githubLogin,
      preferredName: users.preferredName,
      discordName: users.discordName,
      lumaName: users.lumaName,
      meetName: users.meetName,
      displayNameSource: users.displayNameSource,
    })
    .from(users)
    .where(eq(users.pubkey, pubkey));

  if (!row) {
    return { pubkey, displayName: null, githubLogin: null, ...EMPTY_NAMES };
  }
  return {
    ...row,
    displayNameSource: row.displayNameSource as NameSource,
  };
}

/**
 * Link every still-unmatched roster row that carries one of this person's
 * names to them.
 *
 * This is what makes attendance self-service: a learner sets their Google
 * Meet name and immediately sees the sessions they were in, with no admin in
 * the loop. Run on every profile save and on every read of their own
 * attendance, so it heals whether they set the name before or after a roster
 * was uploaded.
 *
 * Only NULL rows are touched. A row already pointing at somebody is either an
 * earlier match or a decision an admin made by hand, and typing that person's
 * name into your profile must not take it from them.
 */
export async function claimAttendanceForUser(pubkey: string): Promise<number> {
  const profile = await getProfile(pubkey);
  const mine = new Set(
    matchableNames(profile, [profile.displayName, profile.githubLogin]).map(
      (n) => normalizeName(n.value)
    )
  );
  if (mine.size === 0) return 0;

  const open = await db()
    .select({ id: attendanceRecords.id, rawName: attendanceRecords.rawName })
    .from(attendanceRecords)
    .where(isNull(attendanceRecords.userPubkey));

  let claimed = 0;
  for (const r of open) {
    if (!mine.has(normalizeName(r.rawName))) continue;
    await db()
      .update(attendanceRecords)
      .set({ userPubkey: pubkey })
      .where(eq(attendanceRecords.id, r.id));
    claimed += 1;
  }
  return claimed;
}

/**
 * Write all four names and the chosen source.
 *
 * `display_name` is rewritten from them in the same statement. It is the only
 * place that column is set, which is what keeps a derived column honest —
 * every other query in this file can go on selecting it.
 */
export async function setProfileNames(
  pubkey: string,
  input: Names
): Promise<void> {
  await ensureUser(pubkey);

  const clean = (v: string | null) => {
    const t = (v ?? "").trim();
    return t.length > 0 ? t : null;
  };
  const names: Names = {
    preferredName: clean(input.preferredName),
    discordName: clean(input.discordName),
    lumaName: clean(input.lumaName),
    meetName: clean(input.meetName),
    displayNameSource: input.displayNameSource,
  };

  await db()
    .update(users)
    .set({ ...names, displayName: resolveDisplayName(names) })
    .where(eq(users.pubkey, pubkey));

  // Setting a Meet name is the whole point of the field, so act on it now
  // rather than waiting for an admin to press Re-match.
  await claimAttendanceForUser(pubkey);
}

/**
 * Record the GitHub account a passing submission came from.
 *
 * Called only after a submission verifies, so the value is proven rather
 * than claimed. `github_login` is unique: if another wallet already holds it,
 * that is worth knowing about, not worth crashing a submission over.
 */
export async function recordGithubLogin(
  pubkey: string,
  login: string
): Promise<void> {
  const current = await getGithubLogin(pubkey);
  if (current === login) return;
  try {
    await db().update(users).set({ githubLogin: login }).where(eq(users.pubkey, pubkey));
  } catch (e) {
    console.error(
      `[users] could not set github_login=${login} for ${pubkey}; ` +
        `another wallet probably already claims it.`,
      e
    );
  }
}

// ── attendance ───────────────────────────────────────────────────────────

export interface AttendanceSessionRow {
  id: string;
  heldOn: string;
  label: string | null;
  sourceFilename: string | null;
  total: number;
  matched: number;
}

/**
 * Import one roster.
 *
 * Names are matched against remembered aliases first, then display names,
 * then GitHub logins. Anything left over is stored with a null pubkey — that
 * is the normal case, not a failure, and the admin page exists to resolve it.
 */
export async function createAttendanceSession(input: {
  heldOn: string;
  label?: string;
  sourceFilename?: string;
  names: string[];
}): Promise<{ sessionId: string; total: number; matched: number }> {
  const sessionId = randomUUID();

  await db().insert(attendanceSessions).values({
    id: sessionId,
    heldOn: input.heldOn,
    label: input.label,
    sourceFilename: input.sourceFilename,
  });

  const lookup = await buildNameLookup();

  let matched = 0;
  for (const rawName of input.names) {
    const pubkey = lookup.get(normalizeName(rawName)) ?? null;
    if (pubkey) matched += 1;
    await db()
      .insert(attendanceRecords)
      .values({ id: randomUUID(), sessionId, rawName, userPubkey: pubkey })
      .onConflictDoNothing();
  }

  return { sessionId, total: input.names.length, matched };
}

/**
 * normalized name -> pubkey.
 *
 * Written weakest-first so the strongest signal wins a collision: a GitHub
 * login is the weakest (it is a handle, not a name), and the Google Meet name
 * is the strongest, because it is literally the string that appears in the
 * roster being imported. Aliases go last of all — those are decisions a human
 * already made, and nothing inferred should overrule them.
 */
async function buildNameLookup(): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  const people = await db()
    .select({
      pubkey: users.pubkey,
      displayName: users.displayName,
      githubLogin: users.githubLogin,
      preferredName: users.preferredName,
      discordName: users.discordName,
      lumaName: users.lumaName,
      meetName: users.meetName,
      displayNameSource: users.displayNameSource,
    })
    .from(users);

  for (const p of people) {
    if (p.githubLogin) map.set(normalizeName(p.githubLogin), p.pubkey);
    const names: Names = {
      preferredName: p.preferredName,
      discordName: p.discordName,
      lumaName: p.lumaName,
      meetName: p.meetName,
      displayNameSource: p.displayNameSource as NameSource,
    };
    for (const { value } of matchableNames(names, [p.displayName])) {
      map.set(normalizeName(value), p.pubkey);
    }
  }

  // Aliases are explicit human decisions, so they win over inferred matches.
  const aliases = await db()
    .select({ alias: nameAliases.alias, pubkey: nameAliases.userPubkey })
    .from(nameAliases);
  for (const a of aliases) map.set(a.alias, a.pubkey);

  return map;
}

export async function listAttendanceSessions(): Promise<AttendanceSessionRow[]> {
  const sessions = await db()
    .select()
    .from(attendanceSessions)
    .orderBy(desc(attendanceSessions.heldOn));

  const out: AttendanceSessionRow[] = [];
  for (const s of sessions) {
    const rows = await db()
      .select({ userPubkey: attendanceRecords.userPubkey })
      .from(attendanceRecords)
      .where(eq(attendanceRecords.sessionId, s.id));
    out.push({
      id: s.id,
      heldOn: s.heldOn,
      label: s.label,
      sourceFilename: s.sourceFilename,
      total: rows.length,
      matched: rows.filter((r) => r.userPubkey).length,
    });
  }
  return out;
}

/**
 * How many rosters have been uploaded. The denominator for "attended x of y".
 *
 * Counted rather than derived from listAttendanceSessions() so the students
 * page does not load every record of every session to print one number.
 */
export async function countAttendanceSessions(): Promise<number> {
  const rows = await db()
    .select({ id: attendanceSessions.id })
    .from(attendanceSessions);
  return rows.length;
}

/**
 * Change the date or the label on a roster already imported.
 *
 * The file and its names are untouched — this is for the upload where the
 * date was wrong, which is most of them.
 */
export async function updateAttendanceSession(
  sessionId: string,
  patch: { heldOn?: string; label?: string | null }
): Promise<boolean> {
  const set: Record<string, unknown> = {};
  if (patch.heldOn !== undefined) set.heldOn = patch.heldOn;
  if (patch.label !== undefined) set.label = patch.label;
  if (Object.keys(set).length === 0) return false;

  const rows = await db()
    .update(attendanceSessions)
    .set(set)
    .where(eq(attendanceSessions.id, sessionId))
    .returning({ id: attendanceSessions.id });
  return rows.length > 0;
}

/**
 * Remove a roster and every record in it.
 *
 * attendance_records cascades on the session's delete, so this takes the
 * attendance credit with it — which is the point. Uploading the same file
 * twice with two different dates is the mistake this exists to undo.
 */
export async function deleteAttendanceSession(sessionId: string): Promise<boolean> {
  const rows = await db()
    .delete(attendanceSessions)
    .where(eq(attendanceSessions.id, sessionId))
    .returning({ id: attendanceSessions.id });
  return rows.length > 0;
}

/**
 * Re-run the name lookup over the rows that are still unmatched.
 *
 * Most rosters are uploaded before everyone has filled in their Meet name, so
 * without this every late arrival has to be linked by hand. Rows that already
 * have a wallet are left alone: an existing link is either an earlier match
 * or a human decision, and neither should be silently rewritten.
 */
export async function rematchAttendanceSession(
  sessionId: string
): Promise<{ matched: number; remaining: number }> {
  const rows = await db()
    .select({ id: attendanceRecords.id, rawName: attendanceRecords.rawName })
    .from(attendanceRecords)
    .where(
      and(
        eq(attendanceRecords.sessionId, sessionId),
        isNull(attendanceRecords.userPubkey)
      )
    );

  const lookup = await buildNameLookup();
  let matched = 0;

  for (const r of rows) {
    const pubkey = lookup.get(normalizeName(r.rawName));
    if (!pubkey) continue;
    await db()
      .update(attendanceRecords)
      .set({ userPubkey: pubkey })
      .where(eq(attendanceRecords.id, r.id));
    matched += 1;
  }

  return { matched, remaining: rows.length - matched };
}

export async function getAttendanceSession(sessionId: string) {
  const [session] = await db()
    .select()
    .from(attendanceSessions)
    .where(eq(attendanceSessions.id, sessionId));
  if (!session) return null;

  const records = await db()
    .select({
      id: attendanceRecords.id,
      rawName: attendanceRecords.rawName,
      userPubkey: attendanceRecords.userPubkey,
      displayName: users.displayName,
      githubLogin: users.githubLogin,
    })
    .from(attendanceRecords)
    .leftJoin(users, eq(attendanceRecords.userPubkey, users.pubkey))
    .where(eq(attendanceRecords.sessionId, sessionId));

  return { session, records };
}

/**
 * Attach an unmatched name to a wallet, and remember the spelling so the
 * same roster line matches itself next week.
 */
export async function matchAttendanceName(
  recordId: string,
  pubkey: string
): Promise<void> {
  const [record] = await db()
    .select()
    .from(attendanceRecords)
    .where(eq(attendanceRecords.id, recordId));
  if (!record) return;

  await db()
    .update(attendanceRecords)
    .set({ userPubkey: pubkey })
    .where(eq(attendanceRecords.id, recordId));

  const alias = normalizeName(record.rawName);
  await db()
    .insert(nameAliases)
    .values({ alias, userPubkey: pubkey })
    .onConflictDoUpdate({
      target: nameAliases.alias,
      set: { userPubkey: pubkey },
    });

  // Apply the new alias to every other roster where it is still unresolved.
  // Normalising in JS rather than SQL, so this uses exactly the same rules as
  // the import did — a regexp_replace here would drift from normalizeName()
  // the moment either one changes.
  const orphans = await db()
    .select({ id: attendanceRecords.id, rawName: attendanceRecords.rawName })
    .from(attendanceRecords)
    .where(isNull(attendanceRecords.userPubkey));

  for (const o of orphans) {
    if (normalizeName(o.rawName) !== alias) continue;
    await db()
      .update(attendanceRecords)
      .set({ userPubkey: pubkey })
      .where(eq(attendanceRecords.id, o.id));
  }
}

// ── students ─────────────────────────────────────────────────────────────

export async function listStudents() {
  const sessionCount = await countAttendanceSessions();
  const people = await db()
    .select({
      pubkey: users.pubkey,
      displayName: users.displayName,
      githubLogin: users.githubLogin,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt));

  const out = [];
  for (const p of people) {
    const subs = await getSubmissions(p.pubkey);
    const attended = await db()
      .select({ id: attendanceRecords.id })
      .from(attendanceRecords)
      .where(eq(attendanceRecords.userPubkey, p.pubkey));
    out.push({
      ...p,
      createdAt: p.createdAt.toISOString(),
      passed: subs.filter((s) => s.status === "passed").length,
      // Anyone who has real work in a fork, whether or not it grades.
      started: subs.filter(
        (s) => s.status === "passed" || s.status === "attempted"
      ).length,
      submitted: subs.length,
      lastSubmittedAt:
        subs.map((s) => s.submittedAt ?? "").sort().pop() || null,
      attended: attended.length,
      sessionCount,
      points: await getPoints(p.pubkey),
    });
  }
  return out;
}

export async function getStudentAttendance(pubkey: string) {
  return db()
    .select({
      heldOn: attendanceSessions.heldOn,
      label: attendanceSessions.label,
      rawName: attendanceRecords.rawName,
    })
    .from(attendanceRecords)
    .innerJoin(
      attendanceSessions,
      eq(attendanceRecords.sessionId, attendanceSessions.id)
    )
    .where(eq(attendanceRecords.userPubkey, pubkey))
    .orderBy(desc(attendanceSessions.heldOn));
}

/** Every submission for one challenge, newest first, with who made it. */
export async function getSubmissionsForChallenge(challengeId: string) {
  return db()
    .select({
      id: submissions.id,
      userPubkey: submissions.userPubkey,
      displayName: users.displayName,
      githubLogin: users.githubLogin,
      repoFullName: submissions.repoFullName,
      commitSha: submissions.commitSha,
      status: submissions.status,
      canonicalPassed: submissions.canonicalPassed,
      canonicalTotal: submissions.canonicalTotal,
      mutantsKilled: submissions.mutantsKilled,
      mutantsTotal: submissions.mutantsTotal,
      pointsAwarded: submissions.pointsAwarded,
      runUrl: submissions.runUrl,
      reason: submissions.reason,
      createdAt: submissions.createdAt,
    })
    .from(submissions)
    .leftJoin(users, eq(submissions.userPubkey, users.pubkey))
    .where(eq(submissions.challengeId, challengeId))
    .orderBy(desc(submissions.createdAt));
}
