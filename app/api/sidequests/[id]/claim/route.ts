import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { getSideQuest } from "@/lib/sidequests";
import { getVerifier } from "@/lib/sidequest-verifiers.server";
import { appendLedger, getClaims, upsertClaim } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Claim a side quest.
 *
 * No verifier is registered for any quest yet (see
 * lib/sidequest-verifiers.server.ts), so today every claim lands in
 * "pending" and awards nothing. That is the safe default: an unproven claim
 * cannot mint points.
 *
 * The moment you add a verifier for a quest id, this route starts calling it
 * and awarding on success. Nothing else has to change.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { id } = await params;
  const quest = getSideQuest(id);
  if (!quest) {
    return NextResponse.json({ error: "No such side quest." }, { status: 404 });
  }

  const existing = (await getClaims(session.pubkey)).find(
    (c) => c.questId === id
  );
  if (existing?.state === "verified") {
    return NextResponse.json(existing);
  }

  const verifier = getVerifier(id);

  if (!verifier) {
    const claim = {
      questId: id,
      state: "pending" as const,
      pointsAwarded: 0,
      claimedAt: new Date().toISOString(),
    };
    await upsertClaim(session.pubkey, claim);
    return NextResponse.json({
      ...claim,
      note: "Recorded. Verification for this quest is not automated yet, so a human will look at it.",
    });
  }

  const proven = await verifier.check(session.pubkey);
  if (!proven) {
    const claim = {
      questId: id,
      state: "pending" as const,
      pointsAwarded: 0,
      claimedAt: new Date().toISOString(),
    };
    await upsertClaim(session.pubkey, claim);
    return NextResponse.json({
      ...claim,
      note: "We could not confirm this one yet. It has been queued for review.",
    });
  }

  const claim = {
    questId: id,
    state: "verified" as const,
    pointsAwarded: quest.points,
    claimedAt: new Date().toISOString(),
  };
  await upsertClaim(session.pubkey, claim);
  await appendLedger({
    pubkey: session.pubkey,
    delta: quest.points,
    reason: "sidequest",
    questId: id,
  });

  return NextResponse.json(claim);
}
