import "server-only";
import {
  MPL_CORE_PROGRAM_ID,
  decodeAsset,
  decodeCollection,
  type CoreAsset,
  type CoreCollection,
} from "./core-asset";

/**
 * Devnet, read-only. The public endpoint is rate limited, which is fine for
 * one getAccountInfo per submission; point DEVNET_RPC_URL at a Helius/Triton
 * devnet URL if a cohort submits all at once.
 */
const RPC_URL = process.env.DEVNET_RPC_URL || "https://api.devnet.solana.com";

interface RawAccount {
  owner: string;
  data: Uint8Array;
}

async function getAccount(address: string): Promise<RawAccount | null> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getAccountInfo",
      // "confirmed", not "finalized": a learner who submits the second their
      // mint confirms should not be told the asset does not exist.
      params: [address, { encoding: "base64", commitment: "confirmed" }],
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`devnet RPC answered ${res.status}`);
  const body = (await res.json()) as {
    result?: { value: { owner: string; data: [string, string] } | null };
    error?: { message: string };
  };
  if (body.error) throw new Error(`devnet RPC: ${body.error.message}`);
  const v = body.result?.value;
  if (!v) return null;
  return { owner: v.owner, data: new Uint8Array(Buffer.from(v.data[0], "base64")) };
}

export type AssetLookup =
  | { ok: true; asset: CoreAsset; collection: CoreCollection | null }
  | { ok: false; reason: string; transient?: boolean };

/**
 * Fetch and decode a Core asset, plus its collection when it has one (a
 * collection can carry plugins that apply to every asset in it).
 *
 * Messages are written for the learner: they are what the submit form shows.
 */
export async function lookupCoreAsset(address: string): Promise<AssetLookup> {
  let raw: RawAccount | null;
  try {
    raw = await getAccount(address);
  } catch (e) {
    return {
      ok: false,
      transient: true,
      reason: `We could not reach devnet just now (${(e as Error).message}). Try again in a minute.`,
    };
  }

  if (!raw) {
    return {
      ok: false,
      reason:
        "No account at that address on devnet. Check you copied the ASSET address (not your wallet, not the transaction), and that you minted on devnet rather than localnet or mainnet.",
    };
  }
  if (raw.owner !== MPL_CORE_PROGRAM_ID) {
    return {
      ok: false,
      reason: `That account exists but is owned by ${raw.owner}, not the Metaplex Core program. It is not a Core asset.`,
    };
  }

  let asset: CoreAsset;
  try {
    asset = decodeAsset(raw.data);
  } catch (e) {
    return { ok: false, reason: `That is not a readable Core asset: ${(e as Error).message}.` };
  }

  let collection: CoreCollection | null = null;
  if (asset.updateAuthority.type === "Collection") {
    const c = await getAccount(asset.updateAuthority.address).catch(() => null);
    if (!c || c.owner !== MPL_CORE_PROGRAM_ID) {
      return {
        ok: false,
        transient: !c,
        reason: "The asset belongs to a collection we could not read. Try again, or mint it without a collection.",
      };
    }
    try {
      collection = decodeCollection(c.data);
    } catch (e) {
      return { ok: false, reason: `Its collection is not readable: ${(e as Error).message}.` };
    }
  }

  return { ok: true, asset, collection };
}
