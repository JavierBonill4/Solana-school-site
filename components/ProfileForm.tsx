"use client";

import { useEffect, useState } from "react";
import { useSession } from "./Providers";
import { shortAddress } from "@/lib/points";
import {
  MAX_NAME_LENGTH,
  NAME_HINTS,
  NAME_LABELS,
  NAME_SOURCES,
  type NameSource,
} from "@/lib/names";

interface Profile {
  pubkey: string;
  displayName: string | null;
  githubLogin: string | null;
  preferredName: string | null;
  discordName: string | null;
  lumaName: string | null;
  meetName: string | null;
  displayNameSource: NameSource;
}

type Draft = Record<NameSource, string>;

const EMPTY_DRAFT: Draft = { preferred: "", discord: "", luma: "", meet: "" };

const FIELD_ID: Record<NameSource, string> = {
  preferred: "preferredName",
  discord: "discordName",
  luma: "lumaName",
  meet: "meetName",
};

function draftFrom(p: Profile): Draft {
  return {
    // An account that only ever had a display name keeps it, as the preferred
    // one — otherwise adding these fields would silently blank everybody.
    preferred: p.preferredName ?? p.displayName ?? "",
    discord: p.discordName ?? "",
    luma: p.lumaName ?? "",
    meet: p.meetName ?? "",
  };
}

export function ProfileForm() {
  const { profile: session, refresh } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [source, setSource] = useState<NameSource>("preferred");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    void (async () => {
      const res = await fetch("/api/profile", { cache: "no-store" });
      if (!res.ok) return;
      const p = (await res.json()) as Profile;
      setProfile(p);
      setDraft(draftFrom(p));
      setSource(p.displayNameSource ?? "preferred");
    })();
  }, [session?.pubkey]);

  if (!session) {
    return (
      <div className="empty">
        <span className="lbl">Not connected</span>
        <p>Connect a wallet to set up your profile.</p>
      </div>
    );
  }

  // What the site will show, worked out the same way the server does.
  const preview =
    draft[source].trim() ||
    NAME_SOURCES.map((s) => draft[s].trim()).find(Boolean) ||
    null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          preferredName: draft.preferred,
          discordName: draft.discord,
          lumaName: draft.luma,
          meetName: draft.meet,
          displayNameSource: source,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Could not save that.");
        return;
      }
      setProfile(body as Profile);
      setSaved(true);
      // The sidebar reads the session's profile.
      refresh?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={save} style={{ maxWidth: "40rem" }}>
      <div className="lbl">Your names</div>

      <div className="pf-detail" style={{ marginTop: 14 }}>
        <span>
          <span className="k">Wallet</span>
          <span className="mono">{shortAddress(session.pubkey, 6, 6)}</span>
        </span>
      </div>

      <p style={{ marginTop: 14, fontSize: ".94rem", color: "var(--ink-2)" }}>
        All four are optional, and you choose which one is public. The Google
        Meet one is the only one that does any work behind the scenes: class
        rosters are exported from Meet, so that is the name attendance is
        matched against.
      </p>

      <div style={{ marginTop: 18 }}>
        {NAME_SOURCES.map((s) => (
          <div
            key={s}
            className="field"
            style={{ marginBottom: 16, maxWidth: "100%" }}
          >
            <label className="lbl" htmlFor={FIELD_ID[s]}>
              {NAME_LABELS[s]}
            </label>
            <input
              id={FIELD_ID[s]}
              value={draft[s]}
              onChange={(e) =>
                setDraft((d) => ({ ...d, [s]: e.target.value }))
              }
              maxLength={MAX_NAME_LENGTH}
              placeholder={s === "meet" ? "Exactly as Meet shows it" : ""}
            />
            <span
              className="lbl"
              style={{ marginTop: 6, display: "block", lineHeight: 1.5 }}
            >
              {NAME_HINTS[s]}
            </span>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 6,
          paddingTop: 18,
          borderTop: "1px solid var(--rule)",
        }}
      >
        <div className="lbl">Show publicly</div>
        <p style={{ marginTop: 8, fontSize: ".94rem", color: "var(--ink-2)" }}>
          Which of them appears on the site — the sidebar, the challenge track, and to your instructors.
        </p>

        <div className="actions" style={{ marginTop: 12, flexWrap: "wrap" }}>
          {NAME_SOURCES.map((s) => (
            <button
              type="button"
              key={s}
              className={`btn ${source === s ? "" : "quiet"}`}
              aria-pressed={source === s}
              onClick={() => setSource(s)}
              disabled={!draft[s].trim()}
              title={
                draft[s].trim()
                  ? undefined
                  : `Fill in your ${NAME_LABELS[s].toLowerCase()} first`
              }
            >
              {NAME_LABELS[s]}
            </button>
          ))}
        </div>

        <p className="lbl" style={{ marginTop: 12, lineHeight: 1.5 }}>
          {preview
            ? `You will appear as ${preview}.`
            : "With none of them filled in, you appear as your wallet address."}
        </p>
      </div>

      <div className="actions" style={{ marginTop: 20 }}>
        <button className="btn" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>

      <div
        style={{
          marginTop: 22,
          paddingTop: 18,
          borderTop: "1px solid var(--rule)",
        }}
      >
        <div className="lbl">GitHub</div>
        <p style={{ marginTop: 8, fontSize: ".94rem", color: "var(--ink-2)" }}>
          {profile?.githubLogin ? (
            <>
              Linked to{" "}
              <a
                href={`https://github.com/${profile.githubLogin}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mono"
              >
                {profile.githubLogin}
              </a>
              .
            </>
          ) : (
            <>Not linked yet.</>
          )}
        </p>
        <p className="lbl" style={{ marginTop: 8, lineHeight: 1.5 }}>
          Set automatically from the fork your first accepted submission comes
          from. There is nothing to type — the wallet-pubkey file in that fork
          already proves the two belong together.
        </p>
      </div>

      {error && (
        <div className="callout warn" style={{ marginTop: 18 }}>
          <span className="lbl">Not saved</span>
          <p>{error}</p>
        </div>
      )}
      {saved && !error && (
        <div className="callout" style={{ marginTop: 18 }}>
          <span className="lbl">Saved</span>
          <p>
            {profile?.displayName
              ? `You appear as ${profile.displayName}.`
              : "No name set — you appear as your wallet address."}
          </p>
          {profile?.meetName ? (
            <p style={{ marginTop: 6 }}>
              Past rosters have been re-checked against your Meet name —{" "}
              <a href="/attendance">see your attendance</a>.
            </p>
          ) : (
            <p style={{ marginTop: 6 }}>
              You have not set a Google Meet name, so class rosters will not
              find you automatically.
            </p>
          )}
        </div>
      )}
    </form>
  );
}
