import { NextResponse } from "next/server";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { parseSiwsMessage } from "@/lib/siws";
import { createSessionCookie } from "@/lib/session";
import { consumeNonce, ensureUser } from "@/lib/db";

export const dynamic = "force-dynamic";

const MAX_AGE_MS = 5 * 60 * 1000;

export async function POST(req: Request) {
  let body: { message?: string; signature?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const { message, signature } = body;
  if (!message || !signature) {
    return NextResponse.json(
      { error: "Missing message or signature." },
      { status: 400 }
    );
  }

  const fields = parseSiwsMessage(message);
  if (!fields) {
    return NextResponse.json(
      { error: "That message is not a sign-in request." },
      { status: 400 }
    );
  }

  // The message must be for this site, not one that looks like it. That is
  // the whole job of domain binding: a signature a learner was tricked into
  // producing on evil.example must not be replayable here.
  //
  // Do NOT just trust the Host header — an attacker sets that freely. Check
  // the signed domain against hosts we know are ours. Vercel's per-deploy and
  // per-branch URLs are included, otherwise sign-in works in production and
  // mysteriously fails on every preview deployment.
  const allowedHosts = new Set(
    [
      process.env.NEXT_PUBLIC_SITE_ORIGIN,
      process.env.VERCEL_PROJECT_PRODUCTION_URL,
      process.env.VERCEL_BRANCH_URL,
      process.env.VERCEL_URL,
    ]
      .filter((v): v is string => !!v)
      .map((v) => {
        try {
          return new URL(v.includes("://") ? v : `https://${v}`).host;
        } catch {
          return null;
        }
      })
      .filter((v): v is string => !!v)
  );

  if (allowedHosts.size === 0) {
    console.error(
      "[auth] No NEXT_PUBLIC_SITE_ORIGIN and no VERCEL_* host. Refusing to " +
        "accept any signature rather than accepting all of them."
    );
    return NextResponse.json(
      { error: "This site is misconfigured and cannot sign anyone in." },
      { status: 500 }
    );
  }

  if (!allowedHosts.has(fields.domain)) {
    console.error(
      `[auth] rejected domain ${fields.domain}; allowed: ${[...allowedHosts].join(", ")}`
    );
    return NextResponse.json(
      {
        error: `That signature was issued for ${fields.domain}, which is not this site.`,
      },
      { status: 400 }
    );
  }

  // Fresh, and never seen before.
  const age = Date.now() - Date.parse(fields.issuedAt);
  if (!Number.isFinite(age) || age < -60_000 || age > MAX_AGE_MS) {
    return NextResponse.json(
      { error: "That sign-in request expired. Try again." },
      { status: 400 }
    );
  }
  if (!(await consumeNonce(fields.nonce))) {
    return NextResponse.json(
      { error: "That sign-in request was already used." },
      { status: 400 }
    );
  }

  // ed25519 over the exact bytes the wallet was shown.
  let ok = false;
  try {
    ok = nacl.sign.detached.verify(
      new TextEncoder().encode(message),
      bs58.decode(signature),
      bs58.decode(fields.address)
    );
  } catch {
    ok = false;
  }

  if (!ok) {
    return NextResponse.json(
      { error: "Signature did not match that wallet." },
      { status: 401 }
    );
  }

  await ensureUser(fields.address);
  await createSessionCookie(fields.address);
  return NextResponse.json({ pubkey: fields.address });
}
