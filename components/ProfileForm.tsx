"use client";

import { useEffect, useState } from "react";
import { useSession } from "./Providers";
import { shortAddress } from "@/lib/points";

interface Profile {
  pubkey: string;
  displayName: string | null;
  githubLogin: string | null;
}

export function ProfileForm() {
  const { profile: session } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
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
      setName(p.displayName ?? "");
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

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: name }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Could not save that.");
        return;
      }
      setProfile(body as Profile);
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={save} style={{ maxWidth: "38rem" }}>
      <div className="lbl">Your profile</div>

      <div className="pf-detail" style={{ marginTop: 14 }}>
        <span>
          <span className="k">Wallet</span>
          <span className="mono">{shortAddress(session.pubkey, 6, 6)}</span>
        </span>
      </div>

      <div className="row">
        <div className="field">
          <label className="lbl" htmlFor="displayName">
            Display name
          </label>
          <input
            id="displayName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="How you want to appear"
            maxLength={60}
          />
        </div>
        <button className="btn" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>

      <p className="lbl" style={{ marginTop: 10, lineHeight: 1.5 }}>
        Optional. It replaces your wallet address on the leaderboard, and it is
        how attendance rosters find you — a roster lists names, not addresses.
      </p>

      <div style={{ marginTop: 22, paddingTop: 18, borderTop: "1px solid var(--rule)" }}>
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
              : "Display name cleared — you appear as your wallet address."}
          </p>
        </div>
      )}
    </form>
  );
}
