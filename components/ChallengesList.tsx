"use client";

import { useState } from "react";
import { CHALLENGES } from "@/lib/challenges";
import { useSession } from "./Providers";
import { StatusMark } from "./StatusMark";
import { SubmitForm } from "./SubmitForm";

/** Splits a title so the emphasised word can be coloured. */
function Title({ title, emphasis }: { title: string; emphasis: string }) {
  const i = title.indexOf(emphasis);
  if (i < 0) return <>{title}</>;
  return (
    <>
      {title.slice(0, i)}
      <em className="hi">{emphasis}</em>
      {title.slice(i + emphasis.length)}
    </>
  );
}

/**
 * Every challenge on one line down the left edge.
 *
 * Each challenge owns the stretch of line below its node, and that stretch
 * fills purple when the challenge is passed. Doing it per segment rather than
 * as one bar measured from the top means passing 1 and 3 but not 2 shows
 * exactly that — a gap where the gap is — instead of implying 2 is done.
 *
 * Visible signed out too: this is where "Explore!" lands, and a visitor
 * should see the challenges before being asked for a wallet.
 */
export function ChallengesList() {
  const { profile } = useSession();
  const [open, setOpen] = useState<string | null>(null);

  const passed = CHALLENGES.filter(
    (c) =>
      profile?.submissions.find((s) => s.challengeId === c.id)?.status ===
      "passed"
  ).length;

  return (
    <>
      {profile ? (
        <div className="rail-summary">
          <span className="rail-count">
            {passed}
            <span className="of">/{CHALLENGES.length}</span>
          </span>
          <span className="lbl">challenges complete</span>
        </div>
      ) : (
        <p className="rail-hint">
          Connect a wallet (top right) to track your progress and submit.
          Reading the tutorials needs nothing at all.
        </p>
      )}

      <ol
        className="rail"
        style={{ ["--n" as string]: CHALLENGES.length }}
      >
        {CHALLENGES.map((c, i) => {
          const sub = profile?.submissions.find((s) => s.challengeId === c.id);
          const status = sub?.status ?? "none";

          return (
            <li
              key={c.id}
              className={`rail-item ${status}`}
              style={{ ["--i" as string]: i }}
            >
              <span className="rail-node" aria-hidden="true" />

              <div className="rail-body">
                <div className="rail-top">
                  <span className="lbl">{c.eyebrow}</span>
                  {profile && status !== "none" && (
                    <StatusMark status={status} title={c.eyebrow} />
                  )}
                  {profile && (
                    <span className="rail-pts">
                      {sub?.pointsAwarded ?? 0} pts
                    </span>
                  )}
                </div>

                <h3>
                  <Title title={c.title} emphasis={c.emphasis} />
                </h3>
                <p className="tag">{c.tagline}</p>

                <div className="facts">
                  <span className="fact">{c.level}</span>
                  <span className="fact">{c.time}</span>
                  <span className="fact">{c.stack}</span>
                  <span className="fact">{c.checkpoints} checkpoints</span>
                </div>

                {sub && (sub.canonicalTotal != null || sub.reason) && (
                  <div className="pf-detail" style={{ marginTop: 14 }}>
                    {sub.canonicalTotal != null && (
                      <span>
                        <span className="k">Canonical</span>
                        <span className="mono">
                          {sub.canonicalPassed ?? 0}/{sub.canonicalTotal}
                        </span>
                      </span>
                    )}
                    {!!sub.mutantsTotal && (
                      <span>
                        <span className="k">Mutants killed</span>
                        <span className="mono">
                          {sub.mutantsKilled}/{sub.mutantsTotal}
                        </span>
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
                        CI run →
                      </a>
                    )}
                  </div>
                )}

                {sub &&
                  (sub.status === "failed" || sub.status === "attempted") &&
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

                <div className="actions">
                  <a
                    className="btn"
                    href={c.tutorialUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Challenge!
                  </a>
                  {profile && (
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
                  )}
                </div>

                {open === c.id && (
                  <div style={{ marginTop: 16, maxWidth: "38rem" }}>
                    <SubmitForm challenge={c} />
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}
