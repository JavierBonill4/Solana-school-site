import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isAdmin } from "@/lib/admin";
import { listStudents } from "@/lib/db";
import { shortAddress } from "@/lib/points";
import { CHALLENGES } from "@/lib/challenges";

export const metadata: Metadata = { title: "Students · Admin" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function StudentsPage() {
  if (!(await isAdmin())) notFound();
  const students = await listStudents();

  return (
    <>
      <header className="page-head">
        <div className="eyebrow">
          <span className="rule" />
          <span className="lbl">Admin · Students</span>
        </div>
        <h1>Everyone who has connected.</h1>
        <p className="deck">
          A row appears the first time a wallet signs in. A blank name means
          they have not set one — profiles are optional. <b>Started</b> counts
          assignments where the fork is theirs and the source has moved from
          the upstream, whether or not it grades.
        </p>
      </header>

      <section className="block">
        {students.length === 0 ? (
          <div className="empty">
            <span className="lbl">Nobody yet</span>
            <p>No wallet has signed in.</p>
          </div>
        ) : (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Wallet</th>
                  <th>GitHub</th>
                  <th className="right">Started</th>
                  <th className="right">Passed</th>
                  <th className="right">Attended</th>
                  <th className="right">Last seen</th>
                  <th className="right">Points</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.pubkey}>
                    <td>
                      <Link href={`/admin/students/${s.pubkey}`}>
                        {s.displayName ?? <span className="lbl">No name set</span>}
                      </Link>
                    </td>
                    <td className="mono" style={{ fontSize: ".8rem" }}>
                      {shortAddress(s.pubkey, 5, 4)}
                    </td>
                    <td className="mono" style={{ fontSize: ".8rem" }}>
                      {s.githubLogin ?? "—"}
                    </td>
                    <td className="figure right">
                      {s.started} of {CHALLENGES.length}
                    </td>
                    <td className="figure right">
                      {s.passed} of {CHALLENGES.length}
                    </td>
                    <td className="figure right">{s.attended}</td>
                    <td className="figure right" style={{ fontSize: ".82rem" }}>
                      {s.lastSubmittedAt ? s.lastSubmittedAt.slice(0, 10) : "—"}
                    </td>
                    <td className="figure right">{s.points}</td>
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
