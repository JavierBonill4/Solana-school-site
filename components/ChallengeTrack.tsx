"use client";

import { CHALLENGES } from "@/lib/challenges";
import { useSession } from "./Providers";
import { StatusMark, statusOf } from "./StatusMark";

/** Splits a title so the emphasised word can be coloured. */
function Title({ title, emphasis }: { title: string; emphasis: string }) {
  const i = title.indexOf(emphasis);
  if (i < 0) return <>{title}</>;
  return (
    <>
      {title.slice(0, i)}
      <em className="hi">{emphasis}</em>
      {title.slice(i + emphasis.length)}
    </>
  );
}

export function ChallengeTrack() {
  const { profile } = useSession();

  return (
    <div className="track">
      {CHALLENGES.map((c) => {
        const status = statusOf(c.id, profile?.submissions);
        return (
          <article className="chal" key={c.id}>
            <span className={`node ${status}`} aria-hidden="true" />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <span className="lbl">{c.eyebrow}</span>
              {profile && status !== "none" && (
                <StatusMark status={status} title={c.eyebrow} />
              )}
            </div>

            <h3>
              <Title title={c.title} emphasis={c.emphasis} />
            </h3>
            <p className="tag">{c.tagline}</p>

            <div className="facts">
              <span className="fact">{c.level}</span>
              <span className="fact">{c.time}</span>
              <span className="fact">{c.stack}</span>
              <span className="fact">{c.checkpoints} checkpoints</span>
            </div>

            <div className="actions">
              <a
                className="btn"
                href={c.tutorialUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Challenge!
              </a>
              <a
                className="btn quiet"
                href={`https://github.com/${c.repoFullName}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Fork the repo
              </a>
            </div>
          </article>
        );
      })}
    </div>
  );
}
