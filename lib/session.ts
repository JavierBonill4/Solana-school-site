import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

const COOKIE = "ss_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export interface Session {
  pubkey: string;
}

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set");
  return new TextEncoder().encode(s);
}

export async function createSessionCookie(pubkey: string): Promise<void> {
  const token = await new SignJWT({ pubkey })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());

  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

/**
 * The only trusted source of "who is this". Never read a pubkey from a
 * request body, a query string or a header — those are attacker-controlled.
 */
export async function readSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const pubkey = payload.pubkey;
    return typeof pubkey === "string" ? { pubkey } : null;
  } catch {
    return null;
  }
}
