"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "./Providers";
import type { Challenge } from "@/lib/types";
import { SETUP_COMMAND } from "@/lib/setup-check";

const POLL_MS = 20_000;
const GIVE_UP_MS = 25 * 60 * 1000;

interface Outcome {
  status: string;
  runStatus?: string;
  reason?: string;
  note?: string;
  runUrl?: string;
  pointsAwarded?: number;
  canonical?: { passed: number; total: number };
  mutation?: { killed: number; total: number };
}

export function SubmitForm({ challenge }: { challenge: Challenge }) {
  const { refresh } = useSession();
  const [repo, setRepo] = useState("");
  const [sha, setSha] = useState("");
  const [output, setOutput] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  // A run takes minutes. Keep the handles so a poll in flight can be stopped
  // when the component unmounts or the learner cancels.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopped = useRef(false);

  useEffect(() => {
    return () => {
      stopped.current = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  async function check(body: string): Promise<Outcome> {
    const res = await fetch("/api/submissions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    return (await res.json()) as Outcome;
  }

  function stop() {
    stopped.current = true;
    if (timer.current) clearTimeout(timer.current);
    setWaiting(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    stopped.current = false;
    setBusy(true);
    setOutcome(null);

    const body = JSON.stringify(
      isPaste
        ? { challengeId: challenge.id, output }
        : {
            challengeId: challenge.id,
            repoFullName: repo.trim(),
            // Left out when the challenge is graded on the repo alone.
            ...(needsCommit ? { commitSha: sha.trim() } : {}),
          }
    );

    const startedAt = Date.now();

    const poll = async () => {
      if (stopped.current) return;
      try {
        const result = await check(body);
        setOutcome(result);
        await refresh();

        if (result.status !== "running") {
          setWaiting(false);
          return;
        }

        if (Date.now() - startedAt > GIVE_UP_MS) {
          setWaiting(false);
          setOutcome({
            status: "rejected",
            reason:
              "The grader has been running for over 25 minutes. Open the run to see what is stuck, then submit again.",
            runUrl: result.runUrl,
          });
          return;
        }

        setWaiting(true);
        timer.current = setTimeout(poll, POLL_MS);
      } catch {
        setWaiting(false);
        setOutcome({ status: "rejected", reason: "Could not reach the server." });
      }
    };

    try {
      await poll();
    } finally {
      setBusy(false);
    }
  }

  const mode = challenge.grading ?? "ci";
  // Challenges without a grading layer are judged on the repository alone,
  // so asking for a commit SHA would be asking for something we ignore.
  const needsCommit = mode === "ci";
  const isPaste = mode === "paste";

  const ok = outcome?.status === "passed";
  const running = outcome?.status === "running";
  const pending = outcome?.status === "pending";
  // Not graded, but the fork is theirs and the source has moved: real work,
  // and it is paid for. Rendering it as a plain rejection is the fastest way
  // to make somebody who is genuinely trying think the site is broken.
  const attempted = outcome?.status === "attempted";

  return (
    <form className="panel" onSubmit={submit}>
      <div className="lbl">Submit {challenge.eyebrow}</div>
      <p style={{ marginTop: 9, fontSize: ".94rem", color: "var(--ink-2)" }}>
        {needsCommit
          ? "Push your branch first and let CI finish. We read the run — we never run your code."
          : isPaste
            ? "Run one command on your own machine and paste what it prints. We read it back to you — anything missing, or a devnet wallet with nothing in it, gets called out."
            : "Automated grading is not wired up for this one yet. Give us your repository and we will check it exists and is public; the work itself is reviewed by hand."}
      </p>

      {isPaste ? (
        <>
          <p className="lbl" style={{ marginTop: 16 }}>
            Step 1 — run this in your terminal
          </p>
          <div className="cmd">
            <code>{SETUP_COMMAND}</code>
            <button
              type="button"
              className="btn quiet"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(SETUP_COMMAND);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1800);
                } catch {
                  // Clipboard blocked (http, or permission denied). The
                  // command is on screen and selectable either way.
                  setCopied(false);
                }
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          <p className="lbl" style={{ marginTop: 18 }}>
            Step 2 — paste everything it printed
          </p>
          <textarea
            className="paste"
            value={output}
            onChange={(e) => setOutput(e.target.value)}
            rows={8}
            spellCheck={false}
            placeholder={"rustc: rustc 1.91.0\nsolana: solana-cli 3.0.4\n…"}
            required
          />

          <div className="actions" style={{ marginTop: 14 }}>
            <button className="btn" disabled={busy || !output.trim()}>
              {busy ? "Checking…" : "Check my setup"}
            </button>
          </div>
        </>
      ) : (
        <div className="row">
          <div className="field">
            <label className="lbl" htmlFor={`repo-${challenge.id}`}>
              Your fork
            </label>
            <input
              id={`repo-${challenge.id}`}
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              placeholder={
                challenge.repoFullName
                  ? `you/${challenge.repoFullName.split("/")[1]}`
                  : "you/your-repo"
              }
              required
            />
          </div>
          {needsCommit && (
            <div className="field" style={{ flex: "0 1 190px" }}>
              <label className="lbl" htmlFor={`sha-${challenge.id}`}>
                Commit SHA
              </label>
              <input
                id={`sha-${challenge.id}`}
                value={sha}
                onChange={(e) => setSha(e.target.value)}
                placeholder="3f9a1c8"
                required
              />
            </div>
          )}
          <button className="btn" disabled={busy || waiting}>
            {waiting
              ? "Waiting on CI…"
              : busy
                ? "Checking…"
                : needsCommit
                  ? "Verify run"
                  : "Submit repo"}
          </button>
          {waiting && (
            <button type="button" className="btn quiet" onClick={stop}>
              Stop watching
            </button>
          )}
        </div>
      )}

      {outcome && (
        <div
          className={`callout ${ok || pending || running ? "" : "warn"}`}
          style={{ marginTop: 20 }}
          aria-live="polite"
        >
          <span className="lbl">
            {ok
              ? "Passed"
              : running
                ? "Submission in progress"
                : pending
                  ? "Verified, not yet scored"
                  : attempted
                    ? "Attempted — not graded yet"
                    : "Rejected"}
          </span>
          <p>{outcome.reason ?? outcome.note ?? "Done."}</p>
          {attempted && (
            <p style={{ marginTop: 6 }}>
              {outcome.pointsAwarded
                ? `Your work counts: +${outcome.pointsAwarded} points for starting this assignment.`
                : "Attempt credit for this assignment has already been awarded."}
            </p>
          )}
          {running && (
            <p className="lbl" style={{ marginTop: 8 }}>
              You can leave this page open — it keeps checking. Closing it only
              stops the watching, not the run.
            </p>
          )}
          {outcome.canonical && (
            <p className="mono" style={{ fontSize: ".85rem", marginTop: 6 }}>
              canonical {outcome.canonical.passed}/{outcome.canonical.total}
              {outcome.mutation
                ? ` · mutants killed ${outcome.mutation.killed}/${outcome.mutation.total}`
                : ""}
              {outcome.pointsAwarded ? ` · +${outcome.pointsAwarded} pts` : ""}
            </p>
          )}
          {outcome.runUrl && (
            <p style={{ marginTop: 6 }}>
              <a href={outcome.runUrl} target="_blank" rel="noopener noreferrer">
                View the CI run →
              </a>
            </p>
          )}
        </div>
      )}
    </form>
  );
}
