import { NextResponse } from "next/server";
import { issueNonce } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ nonce: await issueNonce() });
}
