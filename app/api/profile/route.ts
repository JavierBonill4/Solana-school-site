import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { getProfile, setProfileNames } from "@/lib/db";
import {
  MAX_NAME_LENGTH,
  NAME_LABELS,
  NAME_SOURCES,
  isNameSource,
  type NameSource,
} from "@/lib/names";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  return NextResponse.json(await getProfile(session.pubkey));
}

interface Body {
  preferredName?: string | null;
  discordName?: string | null;
  lumaName?: string | null;
  meetName?: string | null;
  displayNameSource?: string;
}

const FIELDS: { key: keyof Body; source: NameSource }[] = [
  { key: "preferredName", source: "preferred" },
  { key: "discordName", source: "discord" },
  { key: "lumaName", source: "luma" },
  { key: "meetName", source: "meet" },
];

export async function POST(req: Request) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  for (const { key, source } of FIELDS) {
    const v = body[key];
    if (typeof v === "string" && v.trim().length > MAX_NAME_LENGTH) {
      return NextResponse.json(
        {
          error: `${NAME_LABELS[source]} is too long — ${MAX_NAME_LENGTH} characters at most.`,
        },
        { status: 400 }
      );
    }
  }

  const source = body.displayNameSource;
  if (source !== undefined && !isNameSource(source)) {
    return NextResponse.json(
      { error: `Pick one of: ${NAME_SOURCES.join(", ")}.` },
      { status: 400 }
    );
  }

  // Every field is optional and empty clears it. Nobody is required to tell us
  // their Discord handle to be on a leaderboard.
  await setProfileNames(session.pubkey, {
    preferredName: body.preferredName ?? null,
    discordName: body.discordName ?? null,
    lumaName: body.lumaName ?? null,
    meetName: body.meetName ?? null,
    displayNameSource: (source as NameSource) ?? "preferred",
  });

  return NextResponse.json(await getProfile(session.pubkey));
}
