"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { useSession } from "./Providers";
import { shortAddress } from "@/lib/points";

export function ConnectButton() {
  const { wallets, select, connect, connected, publicKey, connecting } =
    useWallet();
  const { profile, signingIn, error, signOut } = useSession();

  // A valid session cookie is enough to be "signed in" — the wallet does not
  // have to be reconnected on every page load.
  const address = profile?.pubkey ?? (connected ? publicKey?.toBase58() : null);

  if (address) {
    return (
      <div className="wallet-box">
        <div className="addr">
          <span className="avat" />
          <span title={address}>
            {profile?.displayName || shortAddress(address, 4, 4)}
          </span>
        </div>
        {signingIn && <p className="lbl">Waiting for signature…</p>}
        {error && (
          <p className="lbl" style={{ color: "var(--bad)" }}>
            {error}
          </p>
        )}
        {profile?.isAdmin && <p className="lbl">Admin</p>}
        <button className="btn quiet wide" onClick={() => void signOut()}>
          Disconnect
        </button>
      </div>
    );
  }

  const installed = wallets.filter(
    (w) => w.readyState === WalletReadyState.Installed
  );

  return (
    <div className="wallet-box">
      <p className="lbl">Connect a wallet</p>
      {installed.length === 0 ? (
        <p className="quest-b" style={{ fontSize: ".85rem", color: "var(--ink-3)" }}>
          No Solana wallet detected in this browser.{" "}
          <a href="https://phantom.app/" target="_blank" rel="noopener noreferrer">
            Install one
          </a>{" "}
          and reload.
        </p>
      ) : (
        <div className="wallet-list">
          {installed.map((w) => (
            <button
              key={w.adapter.name}
              className="btn wide"
              disabled={connecting}
              onClick={async () => {
                select(w.adapter.name);
                try {
                  await connect();
                } catch {
                  /* the adapter surfaces its own errors */
                }
              }}
            >
              {connecting ? "Connecting…" : w.adapter.name}
            </button>
          ))}
        </div>
      )}
      <p className="lbl">Your wallet is your account. No email, no password.</p>
    </div>
  );
}
