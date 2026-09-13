import { NextResponse } from "next/server";
import { requireAdmin, NotFound } from "@/lib/admin";
import { appendLedger, getClaims, upsertClaim } from "@/lib/db";
import { getSideQuest } from "@/lib/sidequests";

export const dynamic = "force-dynamic";

/**
 * Approve or reject a side quest claim.
 *
 * Approving writes to the append-only ledger. Rejecting writes nothing —
 * there is nothing to undo, because nothing was ever awarded. If you approve
 * something by mistake, do not delete the row: append a negative delta with
 * reason "revoked" so the correction stays visible.
 */
export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof NotFound) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw e;
  }

  const { pubkey, questId, state } = (await req.json()) as {
    pubkey?: string;
    questId?: string;
    state?: "verified" | "rejected";
  };

  if (!pubkey || !questId || (state !== "verified" && state !== "rejected")) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const quest = getSideQuest(questId);
  if (!quest) {
    return NextResponse.json({ error: "No such side quest." }, { status: 404 });
  }

  const existing = (await getClaims(pubkey)).find((c) => c.questId === questId);
  if (existing?.state === "verified") {
    return NextResponse.json({ ok: true, note: "Already approved." });
  }

  if (state === "rejected") {
    await upsertClaim(pubkey, { questId, state: "rejected", pointsAwarded: 0 });
    return NextResponse.json({ ok: true });
  }

  await upsertClaim(pubkey, {
    questId,
    state: "verified",
    pointsAwarded: quest.points,
    claimedAt: new Date().toISOString(),
  });
  await appendLedger({
    pubkey,
    delta: quest.points,
    reason: "sidequest",
    questId,
  });

  return NextResponse.json({ ok: true, awarded: quest.points });
}
