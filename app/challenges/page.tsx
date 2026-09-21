import type { Metadata } from "next";
import { ChallengesList } from "@/components/ChallengesList";
import { SideQuests } from "@/components/SideQuests";
import { MAX_SIDEQUEST_POINTS } from "@/lib/sidequests";

export const metadata: Metadata = {
  title: "Challenges · Solana School",
};

export default function ChallengesPage() {
  return (
    <>
      <header className="page-head">
        <div className="eyebrow">
          <span className="rule" />
          <span className="lbl">Challenges</span>
        </div>
        <h1>
          Build it. Prove it. <span className="hi">Fill the line.</span>
        </h1>
        <p className="deck">
          Each challenge starts from a repo that already works and asks for the
          one thing it is missing. Push to your fork and CI grades it in your
          own runner — your code never runs on our servers. Every challenge you
          pass fills its stretch of the line in purple.
        </p>
      </header>

      <section className="block">
        <ChallengesList />
      </section>

      <section className="block">
        <div className="head">
          <div className="eyebrow">
            <span className="rule" />
            <span className="lbl">Side quests · up to {MAX_SIDEQUEST_POINTS} pts</span>
          </div>
          <h2>Off the main line.</h2>
          <p>
            Things worth doing that are not a repo. Claims are reviewed by hand
            for now.
          </p>
        </div>
        <SideQuests />
      </section>
    </>
  );
}
