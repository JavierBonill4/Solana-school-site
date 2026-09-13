"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ClaimActions({
  pubkey,
  questId,
}: {
  pubkey: string;
  questId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function decide(state: "verified" | "rejected") {
    setBusy(true);
    try {
      await fetch("/api/admin/claims", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pubkey, questId, state }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", gap: 6 }}>
      <button
        className="btn"
        disabled={busy}
        onClick={() => void decide("verified")}
      >
        Approve
      </button>
      <button
        className="btn quiet"
        disabled={busy}
        onClick={() => void decide("rejected")}
      >
        Reject
      </button>
    </span>
  );
}
