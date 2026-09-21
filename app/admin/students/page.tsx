import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isAdmin } from "@/lib/admin";
import { listStudents } from "@/lib/db";
import { StudentsTable } from "@/components/StudentsTable";
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
          they have not set one — profiles are optional. Click a column to
          sort by it — numbers most to least, names A to Z — and click again to
          reverse. <b>Attempted</b> counts assignments where the fork is theirs
          and the source has moved from the upstream, whether or not it grades.
        </p>
      </header>

      <section className="block">
        {students.length === 0 ? (
          <div className="empty">
            <span className="lbl">Nobody yet</span>
            <p>No wallet has signed in.</p>
          </div>
        ) : (
          <StudentsTable
            challengeCount={CHALLENGES.length}
            rows={students.map((s) => ({
              pubkey: s.pubkey,
              displayName: s.displayName,
              githubLogin: s.githubLogin,
              started: s.started,
              passed: s.passed,
              attended: s.attended,
              sessionCount: s.sessionCount,
              points: s.points,
            }))}
          />
        )}
      </section>
    </>
  );
}
