import type { Metadata } from "next";
import { PortfolioList } from "@/components/PortfolioList";

export const metadata: Metadata = {
  title: "Portfolio · Solana School",
};

export default function PortfolioPage() {
  return (
    <>
      <header className="page-head">
        <div className="eyebrow">
          <span className="rule" />
          <span className="lbl">Portfolio</span>
        </div>
        <h1>Where you stand.</h1>
        <p className="deck">
          Every assignment, with the result of your latest submission. A green
          check means the run passed. A red cross means it failed and why.
          Nothing means you have not submitted it yet.
        </p>
      </header>

      <section className="block">
        <PortfolioList />
      </section>
    </>
  );
}
