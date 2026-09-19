import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import {
  claimAttendanceForUser,
  countAttendanceSessions,
  getProfile,
  getStudentAttendance,
} from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * A learner's own attendance.
 *
 * Deliberately not admin-gated. Anyone signed in sees the sessions matched to
 * THEIR wallet — and since matching is by the names they typed into their own
 * profile, claiming somebody else's attendance is a matter of typing their
 * name. That is accepted: the class is small, the records are not a grade, and
 * making people wait on an admin to see whether they were marked present is a
 * worse problem than the one it would solve.
 *
 * Reading also claims: a roster uploaded before somebody set their Meet name
 * would otherwise sit unmatched until an admin pressed Re-match.
 */
export async function GET() {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const claimed = await claimAttendanceForUser(session.pubkey);

  const [records, totalSessions, profile] = await Promise.all([
    getStudentAttendance(session.pubkey),
    countAttendanceSessions(),
    getProfile(session.pubkey),
  ]);

  return NextResponse.json({
    records,
    totalSessions,
    // The UI needs to know whether an empty list means "you missed everything"
    // or "we have no name to look for you under", which are very different
    // messages to show somebody.
    meetName: profile.meetName,
    justClaimed: claimed,
  });
}
