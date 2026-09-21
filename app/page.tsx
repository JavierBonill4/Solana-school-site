import Link from "next/link";
import { ChallengeTrack } from "@/components/ChallengeTrack";
import { ECOSYSTEM } from "@/lib/ecosystem";

export default function HomePage() {
  const compete = ECOSYSTEM.find((g) => g.heading === "Go compete");

  return (
    <>
      <header className="page-head">
        <div className="eyebrow">
          <span className="rule" />
          <span className="lbl">Solana School · Home Page</span>
        </div>
        <h1>
          Learn how to build on Solana. Then explore the greater{" "}
          <span className="hi">ecosystem</span>.
        </h1>
        <p className="deck">
          Welcome to the home site for Solana School. As a student, access your 
          assignments, attendance, and resources from the course and beyond. If 
          you're not a student explore resources from the Solana ecosystem, try 
          out our first challenge, and apply for Solana School's next cohort in the Resources
          tab. Connect a wallet, set up your profile, and explore Solana!
        </p>
      </header>

      <section className="block">
        <div className="head">
          <div className="eyebrow">
            <span className="rule" />
            <span className="lbl">The track</span>
          </div>
          {/* <h2>Four assignments, in order.</h2>
          <p>
            Each starts from a repo that already works and asks you to add the
            one thing it is missing — and the last one asks you to decide what
            that thing is. The tutorials are free — you do not need a wallet to
            read them. To submit, push to your fork: CI grades it in
            your own runner and we read the result, so your code never runs on
            our servers.
          </p> */}
        </div>

        <ChallengeTrack />
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
            <Link href="/resources">
              Courses, hackathons and references worth bookmarking →
            </Link>
          </p>
        </section>
      )}
    </>
  );
}
