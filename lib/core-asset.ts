/**
 * Assignment 08 — reading a Metaplex Core asset straight off devnet.
 *
 * There is no repository and no CI run for this one: the work IS the account.
 * A learner mints a soulbound asset and the proof lives on-chain, where
 * nobody (including them) can edit it after the fact. So grading is the same
 * kind of thing it is everywhere else on this site — a read, never an
 * execution — just of an account instead of a workflow artifact.
 *
 * Decoded by hand rather than through @metaplex-foundation/mpl-core, which
 * would pull Umi and its serializers into the server bundle to read five
 * fields. The layout below is MPL Core's (Borsh), checked against the SDK's
 * own deserializer in tests — see challenge-layers/metaplex-core/INSTALL.md.
 *
 *   AssetV1
 *     key               u8        1 = AssetV1
 *     owner             [u8; 32]
 *     update_authority  enum u8   0 None | 1 Address(32) | 2 Collection(32)
 *     name              string    u32 LE length + UTF-8
 *     uri               string
 *     seq               Option<u64>
 *   PluginHeaderV1      (only if the account is longer than the above)
 *     key               u8        3
 *     registry_offset   u64 LE
 *   PluginRegistryV1    (at registry_offset)
 *     key               u8        4
 *     registry          Vec<{ plugin_type u8, authority enum u8 (+32 if Address), offset u64 }>
 *   Plugin data         (at each record's offset)
 *     tag               u8        same numbering as plugin_type
 *     PermanentFreezeDelegate { frozen: bool }
 *
 *   CollectionV1
 *     key 5, update_authority [u8; 32], name, uri, num_minted u32, current_size u32,
 *     then the same plugin header and registry.
 */

import bs58 from "bs58";

export const MPL_CORE_PROGRAM_ID = "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d";

/** MPL Core's PluginType enum, in declaration order. */
export const PLUGIN_TYPES = [
  "Royalties",
  "FreezeDelegate",
  "BurnDelegate",
  "TransferDelegate",
  "UpdateDelegate",
  "PermanentFreezeDelegate",
  "Attributes",
  "PermanentTransferDelegate",
  "PermanentBurnDelegate",
  "Edition",
  "MasterEdition",
  "AddBlocker",
  "ImmutableMetadata",
  "VerifiedCreators",
  "Autograph",
  "BubblegumV2",
  "FreezeExecute",
  "PermanentFreezeExecute",
  "Groups",
] as const;

export type PluginName = (typeof PLUGIN_TYPES)[number] | `Unknown(${number})`;

export type PluginAuthority =
  | { type: "None" }
  | { type: "Owner" }
  | { type: "UpdateAuthority" }
  | { type: "Address"; address: string };

export interface PluginRecord {
  type: PluginName;
  authority: PluginAuthority;
  offset: number;
  /** Only decoded for the plugins grading cares about. */
  frozen?: boolean;
}

export type UpdateAuthority =
  | { type: "None" }
  | { type: "Address"; address: string }
  | { type: "Collection"; address: string };

export interface CoreAsset {
  owner: string;
  updateAuthority: UpdateAuthority;
  name: string;
  uri: string;
  plugins: PluginRecord[];
}

export interface CoreCollection {
  updateAuthority: string;
  name: string;
  plugins: PluginRecord[];
}

class Reader {
  constructor(
    private buf: Uint8Array,
    public pos = 0
  ) {}
  private need(n: number) {
    if (this.pos + n > this.buf.length) {
      throw new Error("account data ends early");
    }
  }
  u8(): number {
    this.need(1);
    return this.buf[this.pos++];
  }
  u32(): number {
    this.need(4);
    const v = new DataView(this.buf.buffer, this.buf.byteOffset + this.pos, 4).getUint32(0, true);
    this.pos += 4;
    return v;
  }
  u64(): number {
    this.need(8);
    const v = new DataView(this.buf.buffer, this.buf.byteOffset + this.pos, 8).getBigUint64(0, true);
    this.pos += 8;
    if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("offset out of range");
    return Number(v);
  }
  pubkey(): string {
    this.need(32);
    const s = bs58.encode(this.buf.subarray(this.pos, this.pos + 32));
    this.pos += 32;
    return s;
  }
  string(): string {
    const len = this.u32();
    // A name or URI is bounded by the account; a huge length is corruption,
    // not a string.
    if (len > 10_000) throw new Error("string length out of range");
    this.need(len);
    const s = new TextDecoder().decode(this.buf.subarray(this.pos, this.pos + len));
    this.pos += len;
    return s;
  }
}

function pluginName(tag: number): PluginName {
  return PLUGIN_TYPES[tag] ?? (`Unknown(${tag})` as PluginName);
}

function readPlugins(data: Uint8Array, headerAt: number): PluginRecord[] {
  if (headerAt >= data.length) return [];

  const header = new Reader(data, headerAt);
  if (header.u8() !== 3) throw new Error("expected a plugin header");
  const registryAt = header.u64();

  const r = new Reader(data, registryAt);
  if (r.u8() !== 4) throw new Error("expected a plugin registry");
  const count = r.u32();
  if (count > 64) throw new Error("plugin registry too large");

  const records: PluginRecord[] = [];
  for (let i = 0; i < count; i += 1) {
    const type = pluginName(r.u8());
    const a = r.u8();
    const authority: PluginAuthority =
      a === 0
        ? { type: "None" }
        : a === 1
          ? { type: "Owner" }
          : a === 2
            ? { type: "UpdateAuthority" }
            : a === 3
              ? { type: "Address", address: r.pubkey() }
              : (() => {
                  throw new Error(`unknown plugin authority ${a}`);
                })();
    const offset = r.u64();
    records.push({ type, authority, offset });
  }

  // Plugin bodies. Only the freeze flags matter for grading.
  for (const rec of records) {
    if (rec.type !== "PermanentFreezeDelegate" && rec.type !== "FreezeDelegate") {
      continue;
    }
    const p = new Reader(data, rec.offset);
    const tag = p.u8();
    if (pluginName(tag) !== rec.type) {
      throw new Error(`plugin at offset ${rec.offset} is not ${rec.type}`);
    }
    rec.frozen = p.u8() === 1;
  }

  return records;
}

export function decodeAsset(data: Uint8Array): CoreAsset {
  const r = new Reader(data);
  const key = r.u8();
  if (key !== 1) {
    throw new Error(
      key === 5
        ? "that address is a Core collection, not an asset"
        : `not a Core asset (account key ${key})`
    );
  }
  const owner = r.pubkey();
  const ua = r.u8();
  const updateAuthority: UpdateAuthority =
    ua === 0
      ? { type: "None" }
      : ua === 1
        ? { type: "Address", address: r.pubkey() }
        : ua === 2
          ? { type: "Collection", address: r.pubkey() }
          : (() => {
              throw new Error(`unknown update authority ${ua}`);
            })();
  const name = r.string();
  const uri = r.string();
  if (r.u8() === 1) r.u64(); // seq

  return { owner, updateAuthority, name, uri, plugins: readPlugins(data, r.pos) };
}

export function decodeCollection(data: Uint8Array): CoreCollection {
  const r = new Reader(data);
  if (r.u8() !== 5) throw new Error("not a Core collection");
  const updateAuthority = r.pubkey();
  const name = r.string();
  r.string(); // uri
  r.u32(); // num_minted
  r.u32(); // current_size
  return { updateAuthority, name, plugins: readPlugins(data, r.pos) };
}

/**
 * Plugins that let somebody other than the owner move or destroy the asset.
 * A frozen asset carrying one of these is not a clean soulbound proof, so
 * grading refuses it rather than arguing about which rule wins.
 */
export const ESCAPE_HATCHES: PluginName[] = [
  "PermanentTransferDelegate",
  "TransferDelegate",
  "PermanentBurnDelegate",
  "BurnDelegate",
];

export interface SoulboundVerdict {
  ok: boolean;
  /** Learner-facing reasons, first one is the one that matters. */
  problems: string[];
}

/**
 * Is this asset soulbound, the way the assignment defines it?
 *
 *   - PermanentFreezeDelegate attached
 *   - frozen: true
 *   - plugin authority None, so nobody can ever thaw it
 *   - nothing attached (to the asset or its collection) that hands a
 *     transfer or burn to someone else
 *
 * The first three are what verify.ts checks locally. The fourth closes the
 * obvious way to satisfy them and still leave a door open.
 */
export function judgeSoulbound(
  asset: CoreAsset,
  collection: CoreCollection | null
): SoulboundVerdict {
  const problems: string[] = [];
  const pfd = asset.plugins.find((p) => p.type === "PermanentFreezeDelegate");

  if (!pfd) {
    const plain = asset.plugins.find((p) => p.type === "FreezeDelegate");
    problems.push(
      plain
        ? "The asset has a FreezeDelegate, not a PermanentFreezeDelegate. A plain freeze delegate can be thawed by its authority and then revoked, so the asset can still move."
        : "No PermanentFreezeDelegate plugin on this asset, so nothing stops a transfer."
    );
  } else {
    if (pfd.frozen !== true) {
      problems.push("The PermanentFreezeDelegate is attached but frozen is false.");
    }
    if (pfd.authority.type !== "None") {
      problems.push(
        `The PermanentFreezeDelegate's authority is ${pfd.authority.type}, not None — ` +
          "whoever holds it can thaw the asset, so it is not bound forever."
      );
    }
  }

  const hatches = [
    ...asset.plugins.filter((p) => ESCAPE_HATCHES.includes(p.type)).map((p) => p.type),
    ...(collection?.plugins ?? [])
      .filter((p) => ESCAPE_HATCHES.includes(p.type))
      .map((p) => `${p.type} (on its collection)`),
  ];
  if (hatches.length) {
    problems.push(
      `It also carries ${hatches.join(", ")}, which hands a transfer or burn to someone other than the owner. Mint it with the PermanentFreezeDelegate alone.`
    );
  }

  return { ok: problems.length === 0, problems };
}
