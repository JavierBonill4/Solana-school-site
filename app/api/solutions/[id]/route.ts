import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { requireAdmin, NotFound } from "@/lib/admin";
import { getChallenge } from "@/lib/challenges";

// Never cache this, and never render it statically. A cached response can be
// served from the edge to somebody who is not an admin.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Reference solutions, admin wallets only.
 *
 * Four things keep this closed, and each one has caused a real leak somewhere:
 *
 *   1. Solutions are read here, inside a route handler, and returned as data.
 *      They are never imported into a component — a server component's props
 *      are serialized into the RSC payload and shipped to the browser.
 *   2. They live in solutions/ at the repo root, NOT in public/. Anything in
 *      public/ is served unauthenticated, forever, to anyone who guesses the
 *      filename.
 *   3. A non-admin gets 404, not 403. A 403 confirms the route exists and
 *      that there is something behind it worth having.
 *   4. force-dynamic, so nothing is prerendered or cached.
 *
 * When this outgrows a folder, move the content to a private GitHub repo read
 * with a server-side token. Same gate, and a leak of your deployed bundle
 * then leaks nothing.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof NotFound) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw e;
  }

  const { id } = await params;

  // Never interpolate a path segment straight into a filesystem path.
  const challenge = getChallenge(id);
  if (!challenge) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const file = path.join(process.cwd(), "solutions", `${challenge.id}.md`);

  try {
    const content = await readFile(file, "utf8");
    return new NextResponse(content, {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { error: `No solution file yet at solutions/${challenge.id}.md` },
      { status: 404 }
    );
  }
}
