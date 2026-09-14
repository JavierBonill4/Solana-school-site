import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isAdmin } from "@/lib/admin";
import { CHALLENGES } from "@/lib/challenges";
import { getSubmissionsForChallenge } from "@/lib/db";
import { shortAddress } from "@/lib/points";
import { StatusMark } from "@/components/StatusMark";
import type { SubmissionStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Submissions · Admin" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminSubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ challenge?: string }>;
}) {
  if (!(await isAdmin())) notFound();

  const { challenge: selected } = await searchParams;
  const active =
    CHALLENGES.find((c) => c.id === selected)?.id ?? CHALLENGES[0].id;
  const challenge = CHALLENGES.find((c) => c.id === active)!;
  const rows = await getSubmissionsForChallenge(active);

  return (
    <>
      <header className="page-head">
        <div className="eyebrow">
          <span className="rule" />
          <span className="lbl">Admin · Submissions</span>
        </div>
        <h1>Who submitted what.</h1>
        <p className="deck">
          Every attempt, newest first — including rejections, because a
          rejection with a reason is usually the more useful row.
        </p>
      </header>

      <section className="block">
        <div className="actions" style={{ marginTop: 0, marginBottom: 26 }}>
          {CHALLENGES.map((c) => (
            <Link
              key={c.id}
              href={`/admin/submissions?challenge=${c.id}`}
              className={`btn ${c.id === active ? "" : "quiet"}`}
            >
              {c.eyebrow.replace("Assignment ", "")}
            </Link>
          ))}
        </div>

        <h2 style={{ marginBottom: 18 }}>{challenge.title}</h2>

        {rows.length === 0 ? (
          <div className="empty">
            <span className="lbl">Nothing yet</span>
            <p>No one has submitted this assignment.</p>
          </div>
        ) : (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Student</th>
                  <th>GitHub</th>
                  <th>Fork</th>
                  <th>Result</th>
                  <th className="right">Points</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <StatusMark status={r.status as SubmissionStatus} />
                    </td>
                    <td>
                      <Link href={`/admin/students/${r.userPubkey}`}>
                        {r.displayName ?? shortAddress(r.userPubkey, 4, 4)}
                      </Link>
                    </td>
                    <td className="mono">{r.githubLogin ?? "—"}</td>
                    <td className="mono" style={{ fontSize: ".78rem" }}>
                      {r.runUrl ? (
                        <a href={r.runUrl} target="_blank" rel="noopener noreferrer">
                          {r.commitSha.slice(0, 7)}
                        </a>
                      ) : (
                        r.commitSha.slice(0, 7)
                      )}
                    </td>
                    <td style={{ maxWidth: "22rem" }}>
                      {r.status === "passed" ? (
                        <span className="mono" style={{ fontSize: ".8rem" }}>
                          {r.canonicalPassed}/{r.canonicalTotal}
                          {r.mutantsTotal
                            ? ` · ${r.mutantsKilled}/${r.mutantsTotal} killed`
                            : ""}
                        </span>
                      ) : (
                        <span style={{ fontSize: ".88rem" }}>{r.reason ?? "—"}</span>
                      )}
                    </td>
                    <td className="figure right">{r.pointsAwarded}</td>
                    <td className="figure">
                      {r.createdAt.toISOString().slice(0, 10)}
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
