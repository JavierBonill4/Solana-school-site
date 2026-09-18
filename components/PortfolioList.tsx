"use client";

import { useState } from "react";
import { CHALLENGES } from "@/lib/challenges";
import { useSession } from "./Providers";
import { StatusMark } from "./StatusMark";
import { SubmitForm } from "./SubmitForm";

export function PortfolioList() {
  const { profile } = useSession();
  const [open, setOpen] = useState<string | null>(null);

  if (!profile) {
    return (
      <div className="card" style={{ padding: "26px 26px 28px", maxWidth: "38rem" }}>
        <p style={{ color: "var(--ink-2)" }}>
          Connect a wallet to see your portfolio. Your wallet address is your
          account — there is no signup, no password, and no email.
        </p>
      </div>
    );
  }

  return (
    <div>
      {CHALLENGES.map((c) => {
        const sub = profile.submissions.find((s) => s.challengeId === c.id);
        const status = sub?.status ?? "none";

        return (
          <div className="pf-row" key={c.id}>
            <StatusMark status={status} title={c.eyebrow} />

            <div className="pf-body">
              <div className="t">
                <span className="lbl">{c.eyebrow}</span>
              </div>

              <h3>
                <a href={c.tutorialUrl} target="_blank" rel="noopener noreferrer">
                  {c.title}
                </a>
              </h3>

              {status === "none" && (
                <p className="pf-empty">
                  Nothing submitted yet.{" "}
                  <a href={c.tutorialUrl} target="_blank" rel="noopener noreferrer">
                    Read the tutorial
                  </a>{" "}
                  or{" "}
                  <a
                    href={`https://github.com/${c.repoFullName}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    fork the repo
                  </a>
                  .
                </p>
              )}

              {sub && (
                <>
                  <div className="pf-detail">
                    <span>
                      <span className="k">Canonical</span>
                      <span className="mono">
                        {sub.canonicalPassed}/{sub.canonicalTotal}
                      </span>
                    </span>
                    {!!sub.mutantsTotal && (
                      <span>
                        <span className="k">Mutants killed</span>
                        <span className="mono">
                          {sub.mutantsKilled}/{sub.mutantsTotal}
                        </span>
                      </span>
                    )}
                    {sub.commitSha && (
                      <span>
                        <span className="k">Commit</span>
                        <span className="mono">{sub.commitSha}</span>
                      </span>
                    )}
                    {sub.runUrl && (
                      <a
                        href={sub.runUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mono"
                        style={{ fontSize: ".82rem" }}
                      >
                        View CI run →
                      </a>
                    )}
                  </div>

                  {(sub.status === "failed" || sub.status === "attempted") &&
                    sub.reason && (
                      <p className="pf-reason">
                        <strong>
                          {sub.status === "attempted"
                            ? "Counted, not graded."
                            : "Why it failed."}
                        </strong>{" "}
                        {sub.reason}
                      </p>
                    )}
                </>
              )}

              <div className="actions">
                <button
                  className="btn quiet"
                  onClick={() => setOpen(open === c.id ? null : c.id)}
                  aria-expanded={open === c.id}
                >
                  {open === c.id
                    ? "Close"
                    : status === "none"
                      ? "Submit"
                      : "Submit again"}
                </button>
              </div>

              {open === c.id && (
                <div style={{ marginTop: 16, maxWidth: "38rem" }}>
                  <SubmitForm challenge={c} />
                </div>
              )}
            </div>

            <div className="pf-points">
              <span className={`n ${sub?.pointsAwarded ? "" : "zero"}`}>
                {sub?.pointsAwarded ?? 0}
              </span>
              <span className="u">pts</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
