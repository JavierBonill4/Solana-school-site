"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ConnectionProvider,
  WalletProvider,
  useWallet,
} from "@solana/wallet-adapter-react";
import { clusterApiUrl } from "@solana/web3.js";
import bs58 from "bs58";
import { buildSiwsMessage } from "@/lib/siws";
import type { SideQuestClaim, Submission } from "@/lib/types";

export interface Profile {
  pubkey: string;
  displayName: string | null;
  githubLogin: string | null;
  points: number;
  challengePoints: number;
  questPoints: number;
  submissions: Submission[];
  claims: SideQuestClaim[];
  isAdmin: boolean;
  /** Sessions this wallet is credited with. Gates the Attendance tab. */
  attended: number;
}

interface SessionValue {
  profile: Profile | null;
  /** True while a signature is pending in the wallet. */
  signingIn: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue>({
  profile: null,
  signingIn: false,
  error: null,
  refresh: async () => {},
  signOut: async () => {},
});

export function useSession() {
  return useContext(SessionContext);
}

function SessionBridge({ children }: { children: React.ReactNode }) {
  const { publicKey, connected, signMessage, disconnect } = useWallet();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/me", { cache: "no-store" });
    if (!res.ok) {
      setProfile(null);
      return;
    }
    setProfile((await res.json()) as Profile);
  }, []);

  const signIn = useCallback(async () => {
    if (!publicKey || !signMessage) return;
    setSigningIn(true);
    setError(null);
    try {
      const nonceRes = await fetch("/api/auth/nonce", { cache: "no-store" });
      const { nonce } = (await nonceRes.json()) as { nonce: string };

      const message = buildSiwsMessage({
        domain: window.location.host,
        address: publicKey.toBase58(),
        uri: window.location.origin,
        nonce,
        issuedAt: new Date().toISOString(),
      });

      const signature = await signMessage(new TextEncoder().encode(message));

      const verify = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message,
          signature: bs58.encode(signature),
        }),
      });

      if (!verify.ok) {
        // A 500 from Next is an HTML error page, so .json() throws and there
        // is no `error` field to read. Saying "could not verify that
        // signature" there is a lie that costs somebody an evening: the
        // signature was almost certainly fine and the server broke.
        const body = (await verify.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          body?.error ??
            (verify.status >= 500
              ? `The server errored while signing you in (HTTP ${verify.status}). Your wallet and signature are probably fine — check the server logs.`
              : `Sign-in was refused (HTTP ${verify.status}).`)
        );
      }
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Sign-in was cancelled or failed."
      );
      setProfile(null);
    } finally {
      setSigningIn(false);
    }
  }, [publicKey, signMessage, refresh]);

  // The session cookie lasts a week, so on load we ask the server who we are
  // before touching the wallet. Without this, a returning visitor would be
  // prompted for a fresh signature on every page load.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    void refresh().finally(() => setHydrated(true));
  }, [refresh]);

  // Ask for a signature only when a wallet connects that we have no session
  // for — a different wallet than the cookie, or no cookie at all.
  useEffect(() => {
    if (!hydrated || !connected || !publicKey || signingIn) return;
    const address = publicKey.toBase58();
    if (profile?.pubkey === address) return;
    void signIn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, connected, publicKey?.toBase58(), profile?.pubkey]);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setProfile(null);
    setError(null);
    await disconnect().catch(() => {});
  }, [disconnect]);

  const value = useMemo(
    () => ({ profile, signingIn, error, refresh, signOut }),
    [profile, signingIn, error, refresh, signOut]
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  // Devnet by default. Nothing here sends a transaction — the connection is
  // only present because wallet adapters expect it to be.
  const endpoint = useMemo(() => clusterApiUrl("devnet"), []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      {/* Standard wallets (Phantom, Solflare, Backpack…) register themselves,
          so this array stays empty unless you need a legacy adapter. */}
      <WalletProvider wallets={[]} autoConnect>
        <SessionBridge>{children}</SessionBridge>
      </WalletProvider>
    </ConnectionProvider>
  );
}
