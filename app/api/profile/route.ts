import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { getProfile, setDisplayName } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  return NextResponse.json(await getProfile(session.pubkey));
}

export async function POST(req: Request) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { displayName } = (await req.json()) as { displayName?: string };
  const trimmed = (displayName ?? "").trim();

  if (trimmed.length > 60) {
    return NextResponse.json(
      { error: "That name is too long — 60 characters at most." },
      { status: 400 }
    );
  }

  // Empty clears it. A display name is optional, so removing one is allowed.
  await setDisplayName(session.pubkey, trimmed || null);
  return NextResponse.json(await getProfile(session.pubkey));
}
