import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import {
  getChallengePoints,
  getClaims,
  getPoints,
  getSideQuestPoints,
  getSubmissions,
} from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Everything the signed-in UI needs, in one call. The pubkey comes from the
 * session cookie — never from the request — so this cannot be used to read
 * somebody else's profile.
 */
export async function GET() {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const [points, challengePoints, questPoints, submissions, claims, admin] =
    await Promise.all([
      getPoints(session.pubkey),
      getChallengePoints(session.pubkey),
      getSideQuestPoints(session.pubkey),
      getSubmissions(session.pubkey),
      getClaims(session.pubkey),
      isAdmin(),
    ]);

  return NextResponse.json({
    pubkey: session.pubkey,
    points,
    challengePoints,
    questPoints,
    submissions,
    claims,
    isAdmin: admin,
  });
}
