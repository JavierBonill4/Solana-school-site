import { NextResponse } from "next/server";
import { requireAdmin, NotFound } from "@/lib/admin";
import { createAttendanceSession } from "@/lib/db";
import { parseNames } from "@/lib/attendance";

export const dynamic = "force-dynamic";

/**
 * Import a roster.
 *
 * The client reads the .md file and posts its text, which avoids multipart
 * parsing for what is a few kilobytes of plain text.
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

  const { heldOn, label, filename, content } = (await req.json()) as {
    heldOn?: string;
    label?: string;
    filename?: string;
    content?: string;
  };

  if (!heldOn || !/^\d{4}-\d{2}-\d{2}$/.test(heldOn)) {
    return NextResponse.json(
      { error: "Pick a date for the session." },
      { status: 400 }
    );
  }
  if (!content || !content.trim()) {
    return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  }

  const names = parseNames(content);
  if (names.length === 0) {
    return NextResponse.json(
      {
        error:
          "No names found. Expected a list, a table, or one name per line — headings and code blocks are ignored.",
      },
      { status: 400 }
    );
  }

  const result = await createAttendanceSession({
    heldOn,
    label: label?.trim() || undefined,
    sourceFilename: filename,
    names,
  });

  return NextResponse.json(result);
}
