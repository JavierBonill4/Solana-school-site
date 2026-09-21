"use client";

import { useState } from "react";
import { useSession } from "./Providers";
import { SIDE_QUESTS } from "@/lib/sidequests";
import type { SideQuestState } from "@/lib/types";

const STATE_LABEL: Record<SideQuestState, string> = {
  verified: "Verified",
  pending: "Awaiting review",
  rejected: "Not accepted",
  unclaimed: "Open",
};

export function SideQuests() {
  const { profile, refresh } = useSession();
  const [claiming, setClaiming] = useState<string | null>(null);

  async function claim(questId: string) {
    setClaiming(questId);
    try {
      await fetch(`/api/sidequests/${questId}/claim`, { method: "POST" });
      await refresh();
    } finally {
      setClaiming(null);
    }
  }

  return (
    <div className="quest-grid">
      {SIDE_QUESTS.map((q) => {
        const state: SideQuestState =
          profile?.claims.find((c) => c.questId === q.id)?.state ?? "unclaimed";
        return (
          <div key={q.id} className={`card quest-card quest ${state}`}>
            <div className="t">
              {q.href ? (
                <a href={q.href} target="_blank" rel="noopener noreferrer">
                  {q.title}
                </a>
              ) : (
                <span>{q.title}</span>
              )}
              <span className="pts">+{q.points}</span>
            </div>
            <p className="b">{q.blurb}</p>
            {profile && state === "unclaimed" ? (
              <button
                className="quest-claim"
                disabled={claiming === q.id}
                onClick={() => void claim(q.id)}
              >
                {claiming === q.id ? "Claiming…" : "I did this"}
              </button>
            ) : profile ? (
              <span className={`state ${state}`}>{STATE_LABEL[state]}</span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

