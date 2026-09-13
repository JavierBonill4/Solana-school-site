import Link from "next/link";
import { ChallengeTrack } from "@/components/ChallengeTrack";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { getLeaderboard } from "@/lib/db";
import { ECOSYSTEM } from "@/lib/ecosystem";

// The leaderboard is a live query, so this page cannot be prerendered.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const rows = await getLeaderboard();
  const compete = ECOSYSTEM.find((g) => g.heading === "Go compete");

  return (
    <>
      <header className="page-head">
        <div className="eyebrow">
          <span className="rule" />
          <span className="lbl">Solana Summer · Challenge Track</span>
        </div>
        <h1>
          Write the program. Then write the tests that{" "}
          <span className="hi">catch you</span>.
        </h1>
        <p className="deck">
          Three Anchor challenges, nine checkpoints each, graded two ways: our
          tests run against your program, and your tests run against ours — the
          broken ones. Connect a wallet, push a commit, collect the points.
        </p>
      </header>

      <section className="block">
        <div className="head">
          <div className="eyebrow">
            <span className="rule" />
            <span className="lbl">The track</span>
          </div>
          <h2>Three assignments, in order.</h2>
          <p>
            Each starts from a repo that already works and asks you to add the
            one thing it is missing. The tutorials are free — you do not need a
            wallet to read them. To submit, push to your fork: CI grades it in
            your own runner and we read the result, so your code never runs on
            our servers.
          </p>
        </div>

        <ChallengeTrack />
      </section>

      <section className="block">
        <div className="head">
          <div className="eyebrow">
            <span className="rule" />
            <span className="lbl">Leaderboard</span>
          </div>
          <h2>Everyone who has shipped.</h2>
        </div>

        <LeaderboardTable rows={rows} limit={5} />

        <p className="inline-note">
          <Link href="/leaderboard">See the full board →</Link>
        </p>
      </section>

      {compete && (
        <section className="block">
          <div className="head">
            <div className="eyebrow">
              <span className="rule" />
              <span className="lbl">What&rsquo;s next</span>
            </div>
            <h2>Finish the track, then go build something.</h2>
            <p>{compete.intro}</p>
          </div>

          <div className="eco-grid">
            {compete.links.map((l) => (
              <div className="card eco" key={l.name}>
                <span className="n">
                  <a href={l.href} target="_blank" rel="noopener noreferrer">
                    {l.name}
                  </a>
                </span>
                <p className="b">{l.blurb}</p>
                {l.note && <span className="note">{l.note}</span>}
              </div>
            ))}
          </div>

          <p className="inline-note">
            <Link href="/ecosystem">
              Courses, hackathons and references worth bookmarking →
            </Link>
          </p>
        </section>
      )}
    </>
  );
}
