import Link from "next/link";
import { DustLogo } from "@/components/DustLogo";

/**
 * The landing page. Dark, one idea, one way forward.
 *
 * The logo is dust sampled from /public/solana-logo.svg — drop the official
 * file from Solana's brand kit there. Until it exists the dust spells the
 * site's name instead.
 */
export default function HomePage() {
  return (
    <div className="hero">
      <div className="hero-glow" aria-hidden="true" />

      <DustLogo label="Solana logo, drawn in dust — hover to scatter it" />

      <p className="hero-quote">the only true failure would be to not learn</p>

      <h1 className="hero-title">
        Learn Solana:
        <span className="hero-sub">Community Developer Resources</span>
      </h1>

      <Link href="/challenges" className="hero-cta">
        Explore!
      </Link>

      <p className="hero-by">
        made with <span aria-label="love">❤️</span> by{" "}
        <a href="https://x.com/Javi_4B" target="_blank" rel="noopener noreferrer">
          @Javi_4B
        </a>
      </p>
    </div>
  );
}
