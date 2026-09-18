import Link from "next/link";
import { notFound } from "next/navigation";
import { isAdmin } from "@/lib/admin";
import { CHALLENGES } from "@/lib/challenges";
import {
  countAttendanceSessions,
  getProfile,
  getPoints,
  getStudentAttendance,
  getSubmissions,
} from "@/lib/db";
import { shortAddress } from "@/lib/points";
import { StatusMark } from "@/components/StatusMark";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function StudentPage({
  params,
}: {
  params: Promise<{ pubkey: string }>;
}) {
  if (!(await isAdmin())) notFound();

  const { pubkey } = await params;
  const [profile, submissions, attendance, points, sessionCount] =
    await Promise.all([
      getProfile(pubkey),
      getSubmissions(pubkey),
      getStudentAttendance(pubkey),
      getPoints(pubkey),
      countAttendanceSessions(),
    ]);

  const name = profile.displayName ?? shortAddress(pubkey, 6, 6);

  return (
    <>
      <header className="page-head">
        <div className="eyebrow">
          <span className="rule" />
          <span className="lbl">Admin · Student</span>
        </div>
        <h1>{name}</h1>

        <div className="pf-detail" style={{ marginTop: 18 }}>
          <span>
            <span className="k">Wallet</span>
            <span className="mono">{shortAddress(pubkey, 8, 8)}</span>
          </span>
          <span>
            <span className="k">GitHub</span>
            {profile.githubLogin ? (
              <a
                href={`https://github.com/${profile.githubLogin}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mono"
              >
                {profile.githubLogin}
              </a>
            ) : (
              <span className="mono">not linked</span>
            )}
          </span>
          <span>
            <span className="k">Points</span>
            <span className="mono">{points}</span>
          </span>
        </div>

        <p className="inline-note" style={{ marginTop: 18 }}>
          <Link href="/admin/students">← All students</Link>
        </p>

        <p className="inline-note" style={{ marginTop: 10, color: "var(--ink-2)" }}>
          An amber half-ring means the fork is theirs and the source has moved
          from the upstream, but it does not grade yet — real work, not a pass.
        </p>
      </header>

      <section className="block">
        <div className="head">
          <div className="eyebrow">
            <span className="rule" />
            <span className="lbl">Assignments</span>
          </div>
        </div>

        <div>
          {CHALLENGES.map((c) => {
            const sub = submissions.find((s) => s.challengeId === c.id);
            const status = sub?.status ?? "none";
            return (
              <div className="pf-row" key={c.id}>
                <StatusMark status={status} title={c.eyebrow} />
                <div className="pf-body">
                  <span className="lbl">{c.eyebrow}</span>
                  <h3>{c.title}</h3>
                  {sub ? (
                    <div className="pf-detail">
                      <span>
                        <span className="k">Attempts</span>
                        <span className="mono">{sub.attempts ?? 1}</span>
                      </span>
                      {/* A submission that never reached the grader has no
                          canonical figures, and "—/—" reads as a broken
                          number rather than as "the suite did not run". */}
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
                      <span>
                        <span className="k">Last</span>
                        <span className="mono">
                          {sub.submittedAt
                            ? sub.submittedAt.slice(0, 10)
                            : "—"}
                        </span>
                      </span>
                      {sub.reason && sub.status !== "passed" && (
                        <span style={{ width: "100%", color: "var(--ink-2)" }}>
                          {sub.reason}
                        </span>
                      )}
                    </div>
                  ) : (
                    <p className="pf-empty">Not submitted.</p>
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
      </section>

      <section className="block">
        <div className="head">
          <div className="eyebrow">
            <span className="rule" />
            <span className="lbl">Attendance</span>
          </div>
          <h2>
            {attendance.length} of {sessionCount} session
            {sessionCount === 1 ? "" : "s"}
          </h2>
          {sessionCount > 0 && attendance.length < sessionCount && (
            <p>
              Missed {sessionCount - attendance.length}. A miss here can also
              mean their name was spelled differently on that roster and never
              linked — <Link href="/admin/attendance">check the rosters</Link>{" "}
              before treating it as an absence.
            </p>
          )}
        </div>

        {attendance.length === 0 ? (
          <div className="empty">
            <span className="lbl">
              {sessionCount === 0 ? "No rosters uploaded" : "No sessions"}
            </span>
            <p>
              This student has not been matched to any roster. If they attended,
              the name on that roster may still be unlinked —{" "}
              <Link href="/admin/attendance">check attendance</Link>.
            </p>
          </div>
        ) : (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Session</th>
                  <th>Listed as</th>
                </tr>
              </thead>
              <tbody>
                {attendance.map((a, i) => (
                  <tr key={`${a.heldOn}-${i}`}>
                    <td className="figure">{a.heldOn}</td>
                    <td>{a.label ?? "—"}</td>
                    <td className="mono" style={{ fontSize: ".82rem" }}>
                      {a.rawName}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
