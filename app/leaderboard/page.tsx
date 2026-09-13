import type { Metadata } from "next";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { getLeaderboard } from "@/lib/db";

// The leaderboard is a live query, so this page cannot be prerendered.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Leaderboard · Solana Summer",
};

export default async function LeaderboardPage() {
  const rows = await getLeaderboard();

  return (
    <>
      <header className="page-head">
        <div className="eyebrow">
          <span className="rule" />
          <span className="lbl">Leaderboard</span>
        </div>
        <h1>Everyone who has shipped.</h1>
        <p className="deck">
          Points come from a ledger, not a counter — assignments and side quests
          both land here, and a regrade shows up as a correction rather than a
          number that quietly changed.
        </p>
      </header>

      <section className="block">
        <LeaderboardTable rows={rows} />
      </section>
    </>
  );
}
