"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useSession } from "./Providers";
import { ConnectButton } from "./ConnectButton";
import { SIDE_QUESTS, MAX_SIDEQUEST_POINTS } from "@/lib/sidequests";
import { MAX_CHALLENGE_POINTS } from "@/lib/challenges";
import type { SideQuestState } from "@/lib/types";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/ecosystem", label: "Ecosystem" },
  { href: "/profile", label: "Profile" },
];

const STATE_LABEL: Record<SideQuestState, string> = {
  verified: "Verified",
  pending: "Awaiting review",
  rejected: "Not accepted",
  unclaimed: "Open",
};

export function Sidebar() {
  const pathname = usePathname();
  const { profile, refresh } = useSession();
  const [claiming, setClaiming] = useState<string | null>(null);

  async function claimQuest(questId: string) {
    setClaiming(questId);
    try {
      await fetch(`/api/sidequests/${questId}/claim`, { method: "POST" });
      await refresh();
    } finally {
      setClaiming(null);
    }
  }

  const total = profile?.points ?? 0;
  const fromChallenges = profile?.challengePoints ?? 0;
  const fromQuests = profile?.questPoints ?? 0;
  const ceiling = MAX_CHALLENGE_POINTS + MAX_SIDEQUEST_POINTS;

  const pctChallenges = ceiling ? (fromChallenges / ceiling) * 100 : 0;
  const pctQuests = ceiling ? (fromQuests / ceiling) * 100 : 0;

  return (
    <aside className="sidebar">
      <Link href="/" className="brand">
        <span className="dot" />
        <span className="name">Solana Summer</span>
      </Link>

      <nav className="nav">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={pathname === item.href ? "page" : undefined}
          >
            {item.label}
          </Link>
        ))}
        {profile?.isAdmin && (
          <Link
            href="/admin"
            aria-current={pathname.startsWith("/admin") ? "page" : undefined}
          >
            Admin
          </Link>
        )}
      </nav>

      <ConnectButton />

      <div className="points">
        <div className="lbl">Your points</div>
        <div style={{ marginTop: 6 }}>
          <span className="total">{total}</span>
          <span className="unit">pts</span>
        </div>

        <div
          className="bar"
          role="img"
          aria-label={`${fromChallenges} points from assignments, ${fromQuests} from side quests, out of ${ceiling} available`}
        >
          <span className="from-challenges" style={{ width: `${pctChallenges}%` }} />
          <span className="from-quests" style={{ width: `${pctQuests}%` }} />
        </div>

        <div className="split">
          <div className="row">
            <span className="swatch" style={{ background: "var(--accent)" }} />
            <span>Assignments</span>
            <span className="v">{fromChallenges}</span>
          </div>
          <div className="row">
            <span className="swatch" style={{ background: "var(--teal)" }} />
            <span>Side quests</span>
            <span className="v">{fromQuests}</span>
          </div>
          <div className="row">
            <span className="swatch" style={{ background: "var(--rule-2)" }} />
            <span>Available</span>
            <span className="v">{ceiling}</span>
          </div>
        </div>
      </div>

      <div className="quests">
        <div className="head">
          <span className="lbl">Side quests</span>
          <span className="v">
            {fromQuests}/{MAX_SIDEQUEST_POINTS}
          </span>
        </div>

        {SIDE_QUESTS.map((q) => {
          const claim = profile?.claims.find((c) => c.questId === q.id);
          const state: SideQuestState = claim?.state ?? "unclaimed";
          return (
            <div key={q.id} className={`quest ${state}`}>
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
                  onClick={() => void claimQuest(q.id)}
                >
                  {claiming === q.id ? "Claiming…" : "I did this"}
                </button>
              ) : profile ? (
                <span className={`state ${state}`}>{STATE_LABEL[state]}</span>
              ) : null}
            </div>
          );
        })}

        <p className="lbl" style={{ marginTop: 12, lineHeight: 1.5 }}>
          Side quest verification is not wired up yet — claims are recorded and
          reviewed by hand.
        </p>
      </div>
    </aside>
  );
}
