import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { getChallenge } from "@/lib/challenges";
import { parseSetupOutput, TOOL_LABEL } from "@/lib/setup-check";
import { createHash } from "crypto";
import type { Challenge } from "@/lib/types";
import { getManifest, matchesGlob, sourceChanged } from "@/lib/manifests";
import bs58 from "bs58";
import {
  getFileAtRef,
  getJobs,
  resolveCommitSha,
  getRepo,
  getRunsForSha,
  getTree,
  ranOnHostedRunner,
} from "@/lib/github";
import {
  appendLedger,
  findRepoClaimant,
  recordGithubLogin,
  findSubmission,
  getAwardedForChallenge,
  recordSubmission,
} from "@/lib/db";
import { readGraderResult } from "@/lib/grader-result";
import {
  ATTEMPT_POINTS,
  ledgerDeltas,
  meetsRequirement,
  scoreSubmission,
} from "@/lib/points";

export const dynamic = "force-dynamic";

const WORKFLOW_PATH = ".github/workflows/verify.yml";

interface Body {
  challengeId?: string;
  repoFullName?: string;
  commitSha?: string;
  /** Terminal output, for challenges graded from a pasted command result. */
  output?: string;
}

/**
 * Carried through the checks so a rejection downstream still knows whether
 * attempt credit was earned upstream of it.
 */
interface Ctx {
  pubkey: string;
  challengeId: string;
  repoFullName: string;
  commitSha: string;
  /** Checks 1-4 passed and the source differs from the upstream baseline. */
  attempted?: boolean;
  /** What was actually written to the ledger just now, which may be 0. */
  attemptDelta?: number;
}

function reject(reason: string, status = 400) {
  return NextResponse.json({ status: "rejected", reason }, { status });
}

/**
 * Record the attempt before answering, so a learner's portfolio shows what
 * happened rather than nothing. A rejection is a real event worth keeping.
 */
async function rejectAndRecord(
  ctx: Ctx,
  reason: string,
  status = 400
) {
  // A rejection AFTER attempt credit was earned is not a failure with nothing
  // to show for it. Keep the standing and the points; only the grade is
  // missing.
  await recordSubmission({
    pubkey: ctx.pubkey,
    challengeId: ctx.challengeId,
    repoFullName: ctx.repoFullName,
    commitSha: ctx.commitSha,
    status: ctx.attempted ? "attempted" : "failed",
    pointsAwarded: ctx.attempted ? ATTEMPT_POINTS : 0,
    reason,
  });
  return NextResponse.json(
    {
      status: ctx.attempted ? "attempted" : "rejected",
      reason,
      ...(ctx.attempted
        ? {
            pointsAwarded: ctx.attemptDelta,
            note: `Not graded yet, but the work counts: ${ATTEMPT_POINTS} points for this challenge.`,
          }
        : {}),
    },
    { status }
  );
}

/**
 * Verify a submission.
 *
 * The whole point: this route never runs the learner's code. It reads a
 * result GitHub already computed and proves that result came from our
 * unmodified grader, on their commit, on a GitHub-hosted runner.
 *
 * Checks, in order, first failure wins:
 *   1. repo is a fork of this challenge's upstream
 *   2. repo is public
 *   3. the fork's wallet-pubkey file names the signed-in wallet
 *   4. every sealed file matches its pinned blob SHA
 *   5. a successful run of our workflow exists for the sha
 *   6. that run used a GitHub-hosted runner
 *   7. the result artifact belongs to that run, and scores it
 */
export async function POST(req: Request) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return reject("Malformed request.");
  }

  const { challengeId, repoFullName, commitSha } = body;
  if (!challengeId) return reject("Need a challenge.");

  const challenge = getChallenge(challengeId);
  if (!challenge) return reject("No such challenge.", 404);

  // Dispatch on how the challenge is graded BEFORE asking for a repository.
  // A pasted-output submission has no repo to give, so a repo check up here
  // rejects it before it reaches the branch that knows what to do with it.
  if ((challenge.grading ?? "ci") === "paste") {
    return gradeFromPastedOutput(session.pubkey, challenge, body.output ?? "");
  }

  if (!repoFullName) {
    return reject("Need a challenge and a repo.");
  }

  // A challenge with no grading layer yet is judged on the repository alone,
  // and asking for a commit SHA there would be theatre.
  const fullPipeline = (challenge.grading ?? "ci") === "ci";

  if (fullPipeline && !commitSha) {
    return reject("Need a challenge, a repo and a commit.");
  }
  if (!/^[\w.-]+\/[\w.-]+$/.test(repoFullName)) {
    return reject("That does not look like a repository name.");
  }
  if (commitSha && !/^[0-9a-f]{7,40}$/i.test(commitSha)) {
    return reject("That does not look like a commit SHA.");
  }

  const ctx: Ctx = {
    pubkey: session.pubkey,
    challengeId,
    // Stored lower-case so "Owner/Repo" and "owner/repo" cannot become two
    // separate claims on the same fork.
    repoFullName: repoFullName.toLowerCase(),
    commitSha: (commitSha ?? "").toLowerCase(),
  };

  if (!fullPipeline) return gradeOnRepoAlone(ctx, challenge);

  // 1 + 2 — fork lineage and visibility.
  const repo = await getRepo(repoFullName);
  if (!repo) {
    return rejectAndRecord(
      ctx,
      "We could not read that repository. Check the owner/name, and that it is public."
    );
  }
  if (repo.private) {
    return rejectAndRecord(
      ctx,
      "That repository is private, so we cannot check the run."
    );
  }
  // GitHub preserves the canonical casing of a username in `full_name`, so a
  // fork of "javierbonill4/x" comes back as "JavierBonill4/x". Owner and repo
  // names are case-INSENSITIVE on GitHub, so compare them that way — an exact
  // string compare rejects every honest fork and gives no hint why.
  const parent = repo.parent?.full_name ?? null;
  const sameRepo = (a: string | null, b: string | null) =>
    !!a && !!b && a.toLowerCase() === b.toLowerCase();

  if (!repo.fork || !sameRepo(parent, challenge.repoFullName)) {
    return rejectAndRecord(
      ctx,
      parent
        ? `That repository is a fork of ${parent}, not ${challenge.repoFullName}.`
        : `That repository is not a fork of ${challenge.repoFullName}.`
    );
  }

  // The submit form takes a short SHA, and most GitHub endpoints accept one
  // — but /actions/runs?head_sha= does an exact match and returns nothing
  // for a prefix. Expand it once here and use the full value everywhere.
  const fullSha = await resolveCommitSha(repoFullName, ctx.commitSha);
  if (!fullSha) {
    return rejectAndRecord(
      ctx,
      "We could not find that commit in your fork. Check the SHA, and that it is pushed."
    );
  }
  ctx.commitSha = fullSha;

  // Already handled? Return what we said last time rather than re-awarding.
  const existing = await findSubmission(
    session.pubkey,
    challengeId,
    ctx.commitSha
  );
  if (existing && existing.status === "passed") {
    return NextResponse.json({
      status: "passed",
      runUrl: existing.runUrl,
      pointsAwarded: existing.pointsAwarded,
      note: "That commit was already graded.",
    });
  }


  // 3 — the fork declares which wallet owns it.
  //
  // wallet-pubkey lives in the learner's fork, so only the fork's owner can
  // set it. That is what stops someone submitting a stranger's passing repo:
  // the file in THAT repo names a different wallet.
  //
  // Read at the submitted commit, not at HEAD, so the answer cannot be
  // changed after CI ran.
  const declared = await getFileAtRef(
    repoFullName,
    "wallet-pubkey",
    ctx.commitSha
  );

  if (declared === null) {
    return rejectAndRecord(
      ctx,
      "No wallet-pubkey file at the root of that commit. Add one containing your wallet address, commit, and push."
    );
  }

  // First line that is not blank and not a comment.
  const claimed = declared
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !l.startsWith("#"));

  // Narrow before use: .find() can return undefined, and an ed25519 public
  // key is exactly 32 bytes once base58 is decoded.
  let validAddress = false;
  if (claimed) {
    try {
      validAddress = bs58.decode(claimed).length === 32;
    } catch {
      validAddress = false;
    }
  }

  if (!claimed || !validAddress) {
    return rejectAndRecord(
      ctx,
      "wallet-pubkey does not contain a Solana address. It should be one line: your base58 wallet address, nothing else."
    );
  }

  if (claimed !== session.pubkey) {
    return rejectAndRecord(
      ctx,
      `That fork's wallet-pubkey names ${claimed.slice(0, 4)}…${claimed.slice(-4)}, but you are signed in as ${session.pubkey.slice(0, 4)}…${session.pubkey.slice(-4)}. Connect that wallet, or update the file in your fork.`
    );
  }

  // A fork belongs to one wallet, permanently. Without this, editing
  // wallet-pubkey and resubmitting farms a second wallet off one piece of work.
  const claimant = await findRepoClaimant(challengeId, ctx.repoFullName);
  if (claimant && claimant !== session.pubkey) {
    return rejectAndRecord(
      ctx,
      "That fork has already been submitted by a different wallet."
    );
  }

  // 4 — sealed files. Fails closed while no manifest exists.
  const manifest = getManifest(challengeId);
  if (!manifest) {
    return NextResponse.json(
      {
        status: "rejected",
        reason:
          "This challenge has no integrity manifest yet, so submissions cannot be graded. See lib/manifests.ts.",
      },
      { status: 503 }
    );
  }

  const tree = await getTree(repoFullName, ctx.commitSha);
  if (!tree) {
    return rejectAndRecord(ctx, "We could not read that commit. Did you push it?");
  }
  if (tree.truncated) {
    return rejectAndRecord(ctx, "That repository is too large to verify in one pass.");
  }

  const blobs = tree.tree.filter((e) => e.type === "blob");

  for (const [pathname, expected] of Object.entries(manifest.locked)) {
    const entry = blobs.find((b) => b.path === pathname);
    if (!entry) {
      // With a cohort that forked before the grading layer existed, this is
      // THE most common rejection, and "missing" on its own reads like the
      // learner deleted something. Say what actually happened and how to fix
      // it, including that GitHub's Sync fork button is not enough on its own.
      return rejectAndRecord(
        ctx,
        `${pathname} is missing from your fork. Your fork was probably made before the grader was added — sync it with the upstream (GitHub's "Sync fork" button, or \`git pull upstream main\`), then push a commit of your own so CI runs.`
      );
    }
    if (entry.sha !== expected) {
      return rejectAndRecord(
        ctx,
        `${pathname} has been modified. Sealed files have to match the upstream exactly.`
      );
    }
  }

  const unexpected = blobs
    .map((b) => b.path)
    .filter(
      (p) =>
        !(p in manifest.locked) &&
        !manifest.editable.some((g) => matchesGlob(p, g))
    );
  if (unexpected.length > 0) {
    return rejectAndRecord(
      ctx,
      `Unexpected files in your fork: ${unexpected.slice(0, 5).join(", ")}. Only the paths the assignment tells you to edit may change.`
    );
  }

  // ── attempt credit ───────────────────────────────────────────────────
  //
  // Everything above this line is the integrity floor: the fork is a fork of
  // ours, it is public, wallet-pubkey names THIS wallet, no other wallet has
  // claimed it, and nothing sealed has moved. Only then does changed source
  // mean anything — otherwise attempt credit would pay out for submitting a
  // stranger's repo.
  //
  // This is attendance, not achievement. It is earned once per challenge and
  // absorbed into the challenge total, so attempt-then-pass pays 20 then 80.
  const changed = sourceChanged(blobs, manifest);

  if (changed === null) {
    // No baseline pinned. Not an error and not the learner's problem — say so
    // in the log, award nothing, carry on grading.
    console.warn(
      `[submissions] ${challengeId} has no baseline in lib/manifests.ts, so ` +
        `attempt credit cannot be computed. Re-run scripts/gen-manifest.mjs.`
    );
  } else if (changed) {
    ctx.attempted = true;
    const awarded = await getAwardedForChallenge(session.pubkey, challengeId);
    ctx.attemptDelta = Math.max(0, ATTEMPT_POINTS - awarded);
    if (ctx.attemptDelta > 0) {
      await appendLedger({
        pubkey: session.pubkey,
        delta: ctx.attemptDelta,
        reason: "attempt",
        challengeId,
      });
    }
  }

  // 5 — a successful run of OUR workflow at this commit.
  const runs = await getRunsForSha(repoFullName, ctx.commitSha);
  const graderRuns = runs.filter((r) => r.path === WORKFLOW_PATH);
  const run = graderRuns.find((r) => r.conclusion === "success");

  if (!run) {
    // "No successful run" has three very different causes and the learner
    // needs to know which one, or they will keep pushing at a problem that
    // is not the one they have.
    const latest = graderRuns[0];

    if (!latest) {
      return rejectAndRecord(
        ctx,
        "No grader run exists for that commit. Three things cause this: Actions is not enabled on your fork (open its Actions tab and click the button), you have not pushed this commit yet, or you synced your fork with GitHub's button — that merge does not trigger workflows, so push a commit of your own or run the workflow by hand from the Actions tab."
      );
    }

    // Still going is not a failure. Record it as pending and tell the client
    // to keep watching, so a learner who submits the moment they push sees a
    // progress state instead of a rejection they have to retry by hand.
    if (latest.status !== "completed") {
      await recordSubmission({
        ...ctx,
        runId: latest.id,
        runUrl: latest.html_url,
        status: "pending",
        pointsAwarded: ctx.attempted ? ATTEMPT_POINTS : 0,
        reason: `The grader is ${latest.status.replace("_", " ")}.`,
      });
      return NextResponse.json({
        status: "running",
        runStatus: latest.status,
        runUrl: latest.html_url,
        note: `The grader is ${latest.status.replace("_", " ")}. Checking again every 20 seconds.`,
      });
    }

    return rejectAndRecord(
      ctx,
      `The grader ran and finished as "${latest.conclusion}". Open the run, fix what it reports, and push again: ${latest.html_url}`
    );
  }

  // 6 — hosted runner.
  const jobs = await getJobs(repoFullName, run.id);
  if (!ranOnHostedRunner(jobs)) {
    return rejectAndRecord(ctx, "That run did not use a GitHub-hosted runner.");
  }

  // 7 — the result the grader published.
  //
  // We do not re-run anything. We read the JSON the pinned workflow wrote,
  // confirm it describes THIS run and THIS commit, and score it.
  const outcome = await readGraderResult(repoFullName, run.id);
  if (!outcome.ok) {
    return rejectAndRecord(ctx, outcome.error);
  }
  const result = outcome.result;

  // The artifact has to be about the thing we just verified. Without these,
  // a passing result from one commit could be replayed against another.
  if (result.challenge !== challengeId) {
    return rejectAndRecord(
      ctx,
      `That run graded "${result.challenge}", not this challenge.`
    );
  }
  if (result.commit_sha.toLowerCase() !== ctx.commitSha) {
    return rejectAndRecord(
      ctx,
      "The grader's result is for a different commit than the run we checked."
    );
  }
  if (result.run_id !== undefined && String(result.run_id) !== String(run.id)) {
    return rejectAndRecord(
      ctx,
      "The grader's result does not belong to that run."
    );
  }

  const { passed, total } = result.canonical;

  // The grader reports both pictures; `requires` in lib/challenges.ts decides
  // which one a pass has to satisfy. grade.py exits green when EITHER is
  // satisfied, so this is where the choice is actually enforced — never award
  // on the assumption that a green run means the right thing.
  const g = result.gates;
  const gatesMet = g ? g.build && g.tests && g.surface && g.errors : null;

  const verdict = meetsRequirement(challenge, passed, total, gatesMet);
  if (!verdict.ok) {
    const detail = result.notes?.length
      ? ` ${result.notes.slice(0, 4).join(" ")}`
      : "";
    return rejectAndRecord(ctx, verdict.why + detail);
  }

  const killed = result.mutation.killed;
  const mutantsTotal = result.mutation.total;
  const points = scoreSubmission(challenge, passed, total, killed, mutantsTotal);

  // Award the difference, not the total. A second passing commit for the
  // same challenge must not pay out twice; a better mutation score should
  // pay out the improvement.
  const already = await getAwardedForChallenge(session.pubkey, challengeId);
  const delta = points - already;

  // With no mutant pack there is nothing to run the learner's tests against,
  // so `tests_pass_on_correct_program` is false for want of a reference — NOT
  // because their tests failed. Saying otherwise blames them for our config.
  if (challenge.mutationEnabled && mutantsTotal === 0) {
    console.error(
      `[submissions] ${challengeId} has mutationEnabled but run ${run.id} ` +
        `reported 0 mutants. The pack in verify.yml is probably unreachable.`
    );
  }

  const gatesPart = g
    ? ` · gates ${[g.build, g.tests, g.surface, g.errors].filter(Boolean).length}/4` +
      (g.passing !== undefined ? ` (${g.passing} of your tests passing)` : "")
    : "";

  // A gates-only challenge has no canonical suite and no mutant pack, so it
  // reports 0/0 for both — honestly, but "Canonical 0/0 · no mutant pack
  // configured" reads as a broken grader rather than a pass. Say what was
  // actually measured instead.
  const gatesOnly = challenge.requires === "gates" && total === 0;

  const summary = gatesOnly
    ? (g
        ? `Gates ${[g.build, g.tests, g.surface, g.errors].filter(Boolean).length}/4` +
          ` — builds ${g.build ? "yes" : "no"}, tests ${g.tests ? "green" : "not green"}` +
          `, IDL grew ${g.surface ? "yes" : "no"}, error wired ${g.errors ? "yes" : "no"}` +
          (g.passing !== undefined
            ? ` · ${g.passing} passing, ${g.failing} failing` +
              (g.required_passing !== undefined ? ` (bar ${g.required_passing})` : "")
            : "")
        : "Graded on gates, but this run published no gate report.")
    : (mutantsTotal === 0
        ? `Canonical ${passed}/${total} · no mutant pack configured, so mutation was not scored`
        : `Canonical ${passed}/${total} · mutants killed ${killed}/${mutantsTotal}` +
          (result.reference_check.tests_pass_on_correct_program
            ? ""
            : " · your tests fail against the correct program, so mutation scored 0")) +
      gatesPart;

  // The fork owner is proven at this point — wallet-pubkey in that repo named
  // this wallet, and only the owner can write it. Worth keeping, so the admin
  // roster reads as people rather than addresses.
  if (repo.owner?.login) {
    await recordGithubLogin(session.pubkey, repo.owner.login);
  }

  await recordSubmission({
    ...ctx,
    runId: run.id,
    runUrl: run.html_url,
    status: "passed",
    canonicalPassed: passed,
    canonicalTotal: total,
    mutantsKilled: killed,
    mutantsTotal,
    pointsAwarded: points,
    reason: summary,
    resultJson: result,
  });

  // Split the award by what each part was for. `already` may include attempt
  // credit paid earlier in THIS request, which is why the split is computed
  // rather than branched on `already === 0`: somebody going straight from 20
  // to a pass is owed 80 under "canonical", not 80 under "mutation".
  for (const row of ledgerDeltas(points, already, challenge.pointsCanonical)) {
    await appendLedger({
      pubkey: session.pubkey,
      delta: row.delta,
      reason: row.reason,
      challengeId,
    });
  }

  return NextResponse.json({
    status: "passed",
    runUrl: run.html_url,
    commitSha: ctx.commitSha,
    canonical: { passed, total },
    mutation: { killed, total: mutantsTotal },
    // Attempt credit may have been written moments ago in this same request,
    // in which case `already` has grown and `delta` alone understates what
    // this submission actually paid.
    pointsAwarded: Math.max(0, delta) + (ctx.attemptDelta ?? 0),
    note:
      delta > 0
        ? `${summary}. +${Math.max(0, delta) + (ctx.attemptDelta ?? 0)} points.`
        : `${summary}. No new points — you have already been awarded ${already} for this challenge.`,
  });
}

/**
 * The placeholder grade, for challenges whose grading layer does not exist
 * yet.
 *
 * It proves one thing: a real, public repository, which is not the starter
 * everybody forks. That is all it claims to prove, and the learner is told as
 * much rather than being shown a green tick that means more than it should.
 *
 * One repo can be claimed by one wallet, which is the only thing standing
 * between this and a cohort submitting the same URL. When the real layer
 * lands, flip `grading` to "ci" in lib/challenges.ts: the points already
 * awarded here are counted against the challenge total, so passing properly
 * later tops somebody up rather than paying twice.
 */
async function gradeOnRepoAlone(ctx: Ctx, challenge: Challenge) {
  const repo = await getRepo(ctx.repoFullName);
  if (!repo) {
    return rejectAndRecord(
      ctx,
      "We could not read that repository. Check the owner/name, and that it is public."
    );
  }
  if (repo.private) {
    return rejectAndRecord(
      ctx,
      "That repository is private, so we cannot see it. Make it public and submit again."
    );
  }

  const upstream = challenge.repoFullName;
  if (upstream && repo.full_name.toLowerCase() === upstream.toLowerCase()) {
    return rejectAndRecord(
      ctx,
      `That is the starter repository. Fork it and submit your own copy.`
    );
  }

  const claimant = await findRepoClaimant(challenge.id, ctx.repoFullName);
  if (claimant && claimant !== ctx.pubkey) {
    return rejectAndRecord(
      ctx,
      "That repository has already been submitted by a different wallet."
    );
  }

  // Pin the record to a real commit so a resubmission after more work is a
  // new row rather than an overwrite of the old one.
  ctx.commitSha =
    (await resolveCommitSha(ctx.repoFullName, repo.default_branch)) ??
    ctx.commitSha ??
    "";

  if (repo.owner?.login) {
    await recordGithubLogin(ctx.pubkey, repo.owner.login);
  }

  const points = challenge.pointsCanonical;
  const already = await getAwardedForChallenge(ctx.pubkey, challenge.id);
  const summary =
    "Repository verified. This challenge has no automated grading yet, so the work itself is reviewed by hand.";

  await recordSubmission({
    ...ctx,
    status: "passed",
    pointsAwarded: points,
    reason: summary,
  });

  for (const row of ledgerDeltas(points, already, challenge.pointsCanonical)) {
    await appendLedger({
      pubkey: ctx.pubkey,
      delta: row.delta,
      reason: row.reason,
      challengeId: challenge.id,
    });
  }

  const delta = Math.max(0, points - already);
  return NextResponse.json({
    status: "passed",
    commitSha: ctx.commitSha,
    pointsAwarded: delta,
    note:
      delta > 0
        ? `${summary} +${delta} points.`
        : `${summary} No new points — you have already been awarded ${already} for this challenge.`,
  });
}

/**
 * Assignment 01, graded from pasted terminal output.
 *
 * Taken on trust, deliberately. Everything here is output the learner
 * pasted, and faking it only cheats the person who will need these tools for
 * the next eight assignments. What it does do is read their own output back
 * to them: a tool the shell could not find, or an unfunded devnet wallet, is
 * named along with the fix.
 *
 * One devnet address still counts once, so a class cannot pass by passing
 * around a single paste.
 */
async function gradeFromPastedOutput(
  pubkey: string,
  challenge: Challenge,
  output: string
) {
  const text = (output ?? "").trim();
  if (!text) {
    return reject("Paste the output of the command first.");
  }
  if (text.length > 20_000) {
    return reject("That is far more output than the command produces.");
  }

  const parsed = parseSetupOutput(text);

  // The record is keyed on the address, so one devnet wallet counts once; the
  // hash of the paste keeps a re-run after fixing something a separate row
  // rather than an overwrite.
  const ctx: Ctx = {
    pubkey,
    challengeId: challenge.id,
    repoFullName: parsed.address ? `devnet:${parsed.address}` : "devnet:unknown",
    commitSha: createHash("sha256").update(text).digest("hex").slice(0, 40),
  };

  const missing = parsed.tools.filter((t) => !t.ok);
  if (missing.length > 0) {
    return rejectAndRecord(
      ctx,
      missing.map((t) => t.note).join(" ") +
        " Install it, re-run the command and paste the output again."
    );
  }

  if (!parsed.address) {
    return rejectAndRecord(
      ctx,
      "No wallet address in what you pasted. `solana address` should print one — run `solana-keygen new` if you have not made a keypair yet."
    );
  }

  const claimant = await findRepoClaimant(challenge.id, ctx.repoFullName);
  if (claimant && claimant !== pubkey) {
    return rejectAndRecord(
      ctx,
      "That devnet address has already been submitted by a different wallet."
    );
  }

  // An empty devnet wallet is the one thing here worth stopping for: nothing
  // in the next assignment works without it, and the fix is two steps.
  if (parsed.balanceSol === 0) {
    return rejectAndRecord(
      ctx,
      `Your devnet wallet is empty. Run \`solana address\`, then paste that address into https://faucet.solana.com/ to fund it — and submit this again once it has SOL.`
    );
  }

  const versions = parsed.tools
    .map((t) => `${TOOL_LABEL[t.tool]} ${t.found}`)
    .join(" · ");
  const balanceNote =
    parsed.balanceSol === null
      ? "Devnet balance could not be read from your paste."
      : `Devnet wallet holds ${parsed.balanceSol} SOL.`;
  const behindNote = parsed.behind.length
    ? ` ${parsed.behind.map((t) => t.note).join(" ")}`
    : "";
  const summary = `${versions} · ${balanceNote}${behindNote}`;

  const points = challenge.pointsCanonical;
  const already = await getAwardedForChallenge(pubkey, challenge.id);

  await recordSubmission({
    ...ctx,
    status: "passed",
    pointsAwarded: points,
    reason: summary,
    resultJson: parsed,
  });

  for (const row of ledgerDeltas(points, already, challenge.pointsCanonical)) {
    await appendLedger({
      pubkey,
      delta: row.delta,
      reason: row.reason,
      challengeId: challenge.id,
    });
  }

  const delta = Math.max(0, points - already);
  return NextResponse.json({
    status: "passed",
    pointsAwarded: delta,
    note:
      delta > 0
        ? `${summary} +${delta} points.`
        : `${summary} No new points — you have already been awarded ${already} for this challenge.`,
  });
}
