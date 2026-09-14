"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface Candidate {
  pubkey: string;
  label: string;
}

/**
 * Attach one unmatched roster name to a student.
 *
 * The match is remembered as an alias, so the same spelling resolves itself
 * on every later import — otherwise you would reconcile the same roster every
 * week forever.
 */
export function AttendanceMatch({
  recordId,
  candidates,
}: {
  recordId: string;
  candidates: Candidate[];
}) {
  const router = useRouter();
  const [pubkey, setPubkey] = useState("");
  const [busy, setBusy] = useState(false);

  if (candidates.length === 0) {
    return <span className="lbl">No students to match against yet</span>;
  }

  async function match() {
    if (!pubkey) return;
    setBusy(true);
    try {
      await fetch("/api/admin/attendance/match", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recordId, pubkey }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <select
        className="mini-select"
        value={pubkey}
        onChange={(e) => setPubkey(e.target.value)}
        aria-label="Match to student"
      >
        <option value="">Match to…</option>
        {candidates.map((c) => (
          <option key={c.pubkey} value={c.pubkey}>
            {c.label}
          </option>
        ))}
      </select>
      <button
        className="btn quiet"
        disabled={busy || !pubkey}
        onClick={() => void match()}
      >
        {busy ? "…" : "Link"}
      </button>
    </span>
  );
}
