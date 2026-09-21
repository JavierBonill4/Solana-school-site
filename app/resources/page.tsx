import type { Metadata } from "next";
import { ECOSYSTEM } from "@/lib/ecosystem";

export const metadata: Metadata = {
  title: "Resources · Solana School",
};

export default function ResourcesPage() {
  return (
    <>
      <header className="page-head">
        <div className="eyebrow">
          <span className="rule" />
          <span className="lbl">Resources</span>
        </div>
        <h1>Where to go after this.</h1>
        <p className="deck">
          Four assignments will not make you a Solana engineer. These will get
          you closer, and several of them pay.
        </p>
      </header>

      {ECOSYSTEM.map((group) => (
        <section className="block" key={group.heading}>
          <div className="head">
            <div className="eyebrow">
              <span className="rule" />
              <span className="lbl">{group.heading}</span>
            </div>
            <p style={{ marginTop: 14 }}>{group.intro}</p>
          </div>

          <div className="eco-grid">
            {group.links.map((l) => (
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
        </section>
      ))}

      <div className="banner">
        <span className="lbl">Dates</span>
        <p>
          Checked September 2026. Cohort dates and application windows move —
          they all live in <code className="inl">lib/ecosystem.ts</code> so
          there is one place to update.
        </p>
      </div>
    </>
  );
}
