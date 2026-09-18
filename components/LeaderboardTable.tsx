"use client";

import { useSession } from "./Providers";
import { shortAddress } from "@/lib/points";
import type { LeaderboardRow } from "@/lib/types";
import { CHALLENGES } from "@/lib/challenges";

export function LeaderboardTable({
  rows,
  limit,
}: {
  rows: LeaderboardRow[];
  limit?: number;
}) {
  const { profile } = useSession();
  const shown = limit ? rows.slice(0, limit) : rows;
  const meInList = profile
    ? shown.some((r) => r.pubkey === profile.pubkey)
    : false;

  if (shown.length === 0 && !profile) {
    return (
      <div className="empty">
        <span className="lbl">Nobody yet</span>
        <p>
          The board fills in from the points ledger as submissions pass. It is
          empty because nothing has been graded — not because it is waiting on
          data.
        </p>
      </div>
    );
  }

  return (
    <div className="tbl-wrap">
      <table>
        <thead>
          <tr>
            <th className="rank">#</th>
            <th>Wallet</th>
            <th>Assignments</th>
            <th>Side quests</th>
            <th className="right">Points</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.pubkey} className={r.pubkey === profile?.pubkey ? "me" : ""}>
              <td className="rank">{r.rank}</td>
              <td className="mono">{shortAddress(r.pubkey, 5, 4)}</td>
              <td className="figure">{r.challengesDone} of {CHALLENGES.length}</td>
              <td className="figure">{r.sideQuestsDone}</td>
              <td className="figure right">{r.points}</td>
            </tr>
          ))}

          {profile && !meInList && (
            <tr className="me">
              <td className="rank">—</td>
              <td className="mono">{shortAddress(profile.pubkey, 5, 4)}</td>
              <td className="figure">
                {profile.submissions.filter((s) => s.status === "passed").length} of{" "}
                {CHALLENGES.length}
              </td>
              <td className="figure">
                {profile.claims.filter((c) => c.state === "verified").length}
              </td>
              <td className="figure right">{profile.points}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
