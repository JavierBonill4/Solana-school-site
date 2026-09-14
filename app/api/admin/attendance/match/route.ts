import { NextResponse } from "next/server";
import { requireAdmin, NotFound } from "@/lib/admin";
import { matchAttendanceName } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof NotFound) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw e;
  }

  const { recordId, pubkey } = (await req.json()) as {
    recordId?: string;
    pubkey?: string;
  };
  if (!recordId || !pubkey) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  await matchAttendanceName(recordId, pubkey);
  return NextResponse.json({ ok: true });
}
