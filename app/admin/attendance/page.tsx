import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isAdmin } from "@/lib/admin";
import {
  getAttendanceSession,
  listAttendanceSessions,
  listStudents,
} from "@/lib/db";
import { shortAddress } from "@/lib/points";
import { AttendanceUpload } from "@/components/AttendanceUpload";
import { AttendanceMatch } from "@/components/AttendanceMatch";

export const metadata: Metadata = { title: "Attendance · Admin" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  if (!(await isAdmin())) notFound();

  const { session: selected } = await searchParams;
  const [sessions, students] = await Promise.all([
    listAttendanceSessions(),
    listStudents(),
  ]);

  const activeId = selected ?? sessions[0]?.id;
  const detail = activeId ? await getAttendanceSession(activeId) : null;

  const candidates = students.map((s) => ({
    pubkey: s.pubkey,
    label:
      s.displayName ??
      s.githubLogin ??
      shortAddress(s.pubkey, 6, 4),
  }));

  return (
    <>
      <header className="page-head">
        <div className="eyebrow">
          <span className="rule" />
          <span className="lbl">Admin · Attendance</span>
        </div>
        <h1>Who was in the room.</h1>
        <p className="deck">
          Upload the roster you already keep. Names are matched against display
          names and GitHub logins; anything left over you link once, and it
          matches itself from then on.
        </p>
      </header>

      <section className="block">
        <AttendanceUpload />
      </section>

      {sessions.length > 0 && (
        <section className="block">
          <div className="head">
            <div className="eyebrow">
              <span className="rule" />
              <span className="lbl">Sessions</span>
            </div>
          </div>

          <div className="actions" style={{ marginTop: 0, marginBottom: 26 }}>
            {sessions.map((s) => (
              <Link
                key={s.id}
                href={`/admin/attendance?session=${s.id}`}
                className={`btn ${s.id === activeId ? "" : "quiet"}`}
              >
                {s.heldOn} · {s.matched}/{s.total}
              </Link>
            ))}
          </div>

          {detail && (
            <>
              <h2 style={{ marginBottom: 6 }}>
                {detail.session.label ?? detail.session.heldOn}
              </h2>
              <p className="lbl" style={{ marginBottom: 20 }}>
                {detail.session.heldOn}
                {detail.session.sourceFilename
                  ? ` · ${detail.session.sourceFilename}`
                  : ""}
              </p>

              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Name on the roster</th>
                      <th>Student</th>
                      <th className="right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.records.map((r) => (
                      <tr key={r.id}>
                        <td>{r.rawName}</td>
                        <td>
                          {r.userPubkey ? (
                            <Link href={`/admin/students/${r.userPubkey}`}>
                              {r.displayName ??
                                r.githubLogin ??
                                shortAddress(r.userPubkey, 4, 4)}
                            </Link>
                          ) : (
                            <span className="lbl">Unmatched</span>
                          )}
                        </td>
                        <td className="right">
                          {r.userPubkey ? (
                            <span className="chip passed">Linked</span>
                          ) : (
                            <AttendanceMatch
                              recordId={r.id}
                              candidates={candidates}
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}
