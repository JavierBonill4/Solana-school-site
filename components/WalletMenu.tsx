"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { useSession } from "./Providers";
import { shortAddress } from "@/lib/points";

/**
 * The wallet, as a button in the top-right corner with a popover under it.
 *
 * Signed out, the popover lists the wallets installed in this browser.
 * Signed in, it shows who you are and how to leave. A sign-in error opens it
 * on its own — an error hidden inside a closed menu is an error nobody reads.
 */
export function WalletMenu() {
  const { wallets, wallet, select, connect, connected, publicKey, connecting } =
    useWallet();
  const { profile, signingIn, error, signOut } = useSession();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const address = profile?.pubkey ?? (connected ? publicKey?.toBase58() : null);

  useEffect(() => {
    if (error) setOpen(true);
  }, [error]);

  // Close on outside click and on Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const installed = wallets.filter(
    (w) => w.readyState === WalletReadyState.Installed
  );

  const label = address
    ? profile?.displayName || shortAddress(address, 4, 4)
    : signingIn
      ? "Signing in…"
      : connecting
        ? "Connecting…"
        : "Connect wallet";

  return (
    <div className="wallet" ref={rootRef}>
      <button
        type="button"
        className={`wallet-btn ${address ? "on" : ""}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
      >
        {address && <span className="avat" aria-hidden="true" />}
        <span className="wallet-label">{label}</span>
        {error && <span className="wallet-err" aria-label="Sign-in problem" />}
      </button>

      {open && (
        <div className="wallet-pop" role="dialog" aria-label="Wallet">
          {address ? (
            <>
              <div className="lbl">Signed in</div>
              <div className="addr" style={{ marginTop: 8 }}>
                <span className="avat" />
                <span className="mono" title={address}>
                  {shortAddress(address, 6, 6)}
                </span>
              </div>
              {profile?.isAdmin && (
                <p className="lbl" style={{ marginTop: 8 }}>
                  Admin
                </p>
              )}
              {signingIn && (
                <p className="wallet-note">Waiting for your signature…</p>
              )}
              {error && <p className="wallet-note bad">{error}</p>}
              <div className="wallet-actions">
                <Link
                  href="/profile"
                  className="btn quiet"
                  onClick={() => setOpen(false)}
                >
                  Profile
                </Link>
                <button
                  className="btn quiet"
                  onClick={() => {
                    setOpen(false);
                    void signOut();
                  }}
                >
                  Disconnect
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="lbl">Connect a wallet</div>
              {error && <p className="wallet-note bad">{error}</p>}
              {installed.length === 0 ? (
                <p className="wallet-note">
                  No Solana wallet found in this browser.{" "}
                  <a
                    href="https://phantom.app/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
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
                        // Selecting is enough: the provider has autoConnect
                        // on, so it connects the wallet it just selected.
                        // Calling connect() here as well used the connect
                        // function from BEFORE the selection — a second,
                        // racing connect against the previous wallet — and
                        // that churn is what left a sign-in holding a
                        // signMessage the library had already deleted.
                        //
                        // The one case select() cannot handle is picking the
                        // wallet that is already selected (after a declined
                        // prompt, say): nothing changes, so nothing
                        // auto-connects. Connect that one explicitly.
                        if (wallet?.adapter.name === w.adapter.name) {
                          try {
                            await connect();
                          } catch {
                            /* the adapter surfaces its own errors */
                          }
                        } else {
                          select(w.adapter.name);
                        }
                      }}
                    >
                      {w.adapter.icon && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={w.adapter.icon} alt="" width={18} height={18} />
                      )}
                      {w.adapter.name}
                    </button>
                  ))}
                </div>
              )}
              <p className="wallet-note">
                Your wallet is your account — no email, no password.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
