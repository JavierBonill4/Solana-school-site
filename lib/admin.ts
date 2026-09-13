import "server-only";
import { readSession } from "./session";

/**
 * Admin wallets come from ADMIN_PUBKEYS, comma separated.
 *
 * Note the missing NEXT_PUBLIC_ prefix — that is deliberate. A NEXT_PUBLIC_
 * variable is inlined into the browser bundle at build time, which would
 * publish the admin list to everyone.
 */
function allowlist(): string[] {
  return (process.env.ADMIN_PUBKEYS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function isAdmin(): Promise<boolean> {
  const session = await readSession();
  if (!session) return false;
  return allowlist().includes(session.pubkey);
}

/**
 * Throws a 404-shaped error rather than a 403. A 403 confirms the route
 * exists and that there is something behind it worth having.
 */
export async function requireAdmin(): Promise<string> {
  const session = await readSession();
  if (!session || !allowlist().includes(session.pubkey)) {
    throw new NotFound();
  }
  return session.pubkey;
}

export class NotFound extends Error {
  constructor() {
    super("Not found");
    this.name = "NotFound";
  }
}
