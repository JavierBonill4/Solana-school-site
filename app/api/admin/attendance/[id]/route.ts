import { NextResponse } from "next/server";
import { requireAdmin, NotFound } from "@/lib/admin";
import {
  deleteAttendanceSession,
  rematchAttendanceSession,
  updateAttendanceSession,
} from "@/lib/db";

export const dynamic = "force-dynamic";

async function guard() {
  try {
    await requireAdmin();
    return null;
  } catch (e) {
    if (e instanceof NotFound) {
      // 404, not 403. A 403 confirms the route exists and that there is
      // something behind it worth having.
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw e;
  }
}

/** Change the date or the label. The roster's names are untouched. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await guard();
  if (denied) return denied;

  const { id } = await params;
  const { heldOn, label } = (await req.json()) as {
    heldOn?: string;
    label?: string | null;
  };

  if (heldOn !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(heldOn)) {
    return NextResponse.json(
      { error: "Dates look like 2026-09-18." },
      { status: 400 }
    );
  }

  const ok = await updateAttendanceSession(id, {
    ...(heldOn !== undefined ? { heldOn } : {}),
    // An empty label clears it rather than storing "".
    ...(label !== undefined ? { label: label?.trim() || null } : {}),
  });

  if (!ok) {
    return NextResponse.json(
      { error: "No such session, or nothing to change." },
      { status: 404 }
    );
  }
  return NextResponse.json({ ok: true });
}

/**
 * Re-run the name lookup over the rows still unmatched.
 *
 * Rosters get uploaded before everyone has filled in their Meet name. Without
 * this, every student who sets theirs later has to be linked by hand.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await guard();
  if (denied) return denied;

  const { id } = await params;
  return NextResponse.json(await rematchAttendanceSession(id));
}

/** Delete the roster and every record in it, attendance credit included. */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await guard();
  if (denied) return denied;

  const { id } = await params;
  const ok = await deleteAttendanceSession(id);
  if (!ok) {
    return NextResponse.json({ error: "No such session." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
