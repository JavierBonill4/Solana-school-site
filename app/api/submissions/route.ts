import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { getChallenge } from "@/lib/challenges";
import { getManifest, matchesGlob } from "@/lib/manifests";
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
import { scoreSubmission } from "@/lib/points";

export const dynamic = "force-dynamic";

const WORKFLOW_PATH = ".github/workflows/verify.yml";

interface Body {
  challengeId?: string;
  repoFullName?: string;
  commitSha?: string;
}

function reject(reason: string, status = 400) {
  return NextResponse.json({ status: "rejected", reason }, { status });
}

/**
 * Record the attempt before answering, so a learner's portfolio shows what
 * happened rather than nothing. A rejection is a real event worth keeping.
 */
async function rejectAndRecord(
  ctx: { pubkey: string; challengeId: string; repoFullName: string; commitSha: string },
  reason: string,
  status = 400
) {
  await recordSubmission({
    pubkey: ctx.pubkey,
    challengeId: ctx.challengeId,
    repoFullName: ctx.repoFullName,
    commitSha: ctx.commitSha,
    status: "failed",
    reason,
  });
  return NextResponse.json({ status: "rejected", reason }, { status });
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
  if (!challengeId || !repoFullName || !commitSha) {
    return reject("Need a challenge, a repo and a commit.");
  }

  const challenge = getChallenge(challengeId);
  if (!challenge) return reject("No such challenge.", 404);

  if (!/^[\w.-]+\/[\w.-]+$/.test(repoFullName)) {
    return reject("That does not look like a repository name.");
  }
  if (!/^[0-9a-f]{7,40}$/i.test(commitSha)) {
    return reject("That does not look like a commit SHA.");
  }

  const ctx: {
    pubkey: string;
    challengeId: string;
    repoFullName: string;
    commitSha: string;
  } = {
    pubkey: session.pubkey,
    challengeId,
    // Stored lower-case so "Owner/Repo" and "owner/repo" cannot become two
    // separate claims on the same fork.
    repoFullName: repoFullName.toLowerCase(),
    commitSha: commitSha.toLowerCase(),
  };

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
      return rejectAndRecord(ctx, `${pathname} is missing from your fork.`);
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
        "No grader run exists for that commit. Either Actions is not enabled on your fork (open its Actions tab and click the button to enable workflows), or you have not pushed this commit yet."
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

  // grade.py already exits non-zero when the canonical suite fails, so a
  // green run implies this — but never award on an assumption.
  if (total === 0 || passed < total) {
    return rejectAndRecord(
      ctx,
      `Canonical suite ${passed}/${total}. Every test has to pass — a checkpoint is done or it is not.`
    );
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

  const summary =
    mutantsTotal === 0
      ? `Canonical ${passed}/${total} · no mutant pack configured, so mutation was not scored`
      : `Canonical ${passed}/${total} · mutants killed ${killed}/${mutantsTotal}` +
        (result.reference_check.tests_pass_on_correct_program
          ? ""
          : " · your tests fail against the correct program, so mutation scored 0");

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

  if (delta > 0) {
    if (already === 0) {
      // First pass: split the award so the ledger says what each half was for.
      await appendLedger({
        pubkey: session.pubkey,
        delta: challenge.pointsCanonical,
        reason: "canonical",
        challengeId,
      });
      const bonus = points - challenge.pointsCanonical;
      if (bonus > 0) {
        await appendLedger({
          pubkey: session.pubkey,
          delta: bonus,
          reason: "mutation",
          challengeId,
        });
      }
    } else {
      // Canonical is binary, so any later increase is a better kill rate.
      await appendLedger({
        pubkey: session.pubkey,
        delta,
        reason: "mutation",
        challengeId,
      });
    }
  }

  return NextResponse.json({
    status: "passed",
    runUrl: run.html_url,
    commitSha: ctx.commitSha,
    canonical: { passed, total },
    mutation: { killed, total: mutantsTotal },
    pointsAwarded: delta > 0 ? delta : 0,
    note:
      delta > 0
        ? `${summary}. +${delta} points.`
        : `${summary}. No new points — you have already been awarded ${already} for this challenge.`,
  });
}
