# Reference solution — Assignment 08, Metaplex Core

Admin only.

**What is verified and what isn't.** The mint script below typechecks
against `@metaplex-foundation/mpl-core` (strict `tsc`). The site's decoder
was checked against the SDK's own deserializer on accounts built with the
SDK's serializers: nine cases, all agreeing. What hasn't been done is a live
devnet mint, because devnet wasn't reachable from where this was written.
Mint one yourself before the cohort does: it's two minutes, and it's the
check that closes the loop.

## The shape of the assignment

Seven checkpoints, but only one deliverable is graded: a soulbound Core asset
on devnet, submitted as its explorer link. The Anchor track (checkpoints 4–5)
and the editions bonus (6) are optional and not graded by the site.

| # | Checkpoint | What it produces |
|---|---|---|
| 0–1 | Fork, install, wallet | `wallet.json` at the repo root, funded |
| 2 | Mint in TypeScript | the asset |
| 3 | Verify and submit | `npm run verify` green, the explorer link |
| 4–5 | Anchor track | optional |
| 6 | Editions bonus | optional |

## How the site grades it

The site reads the asset account off devnet. There is no CI and no repo:

1. It's a Core asset on devnet.
2. **Its owner is the wallet signed in on the site.**
3. Its name isn't `CHANGE ME`.
4. `PermanentFreezeDelegate`, `frozen: true`, authority `None`.
5. No transfer or burn delegate on the asset or its collection.

Check 2 is the only departure from the upstream guide, and the only thing a
correct solution has to do differently from the reference in the repo.

## Checkpoint 2 — the mint

`01-easy-track/scripts/2-mint-soulbound.ts`, completed:

```ts
import { generateSigner, publicKey } from "@metaplex-foundation/umi";
import { create } from "@metaplex-foundation/mpl-core";
import { getUmi, explorerAddress } from "../../shared/umi";

const NAME = "Ada Lovelace — Fall School soulbound";
const URI =
  "https://raw.githubusercontent.com/solana-developers/opos-asset/main/assets/DeveloperPortal/metadata.json";

// The wallet you sign in to the course site with. The site checks the asset's
// owner against it, and a soulbound asset can never be moved there later.
const SITE_WALLET = "REPLACE_WITH_YOUR_SITE_WALLET";

async function main() {
  const umi = getUmi();
  console.log("Minting from wallet:", umi.identity.publicKey.toString());

  // TODO 1 — every Core asset lives at its own fresh address.
  const asset = generateSigner(umi);

  // TODO 2 — create it frozen, with nobody able to thaw it.
  await create(umi, {
    asset,
    name: NAME,
    uri: URI,
    owner: publicKey(SITE_WALLET),
    plugins: [
      {
        type: "PermanentFreezeDelegate",
        frozen: true,               // born frozen: transfer and burn are refused
        authority: { type: "None" }, // nobody can ever flip it back
      },
    ],
  }).sendAndConfirm(umi);

  // TODO 3 — print what they submit.
  console.log("Asset address:", asset.publicKey.toString());
  console.log("Explorer:", explorerAddress(asset.publicKey.toString()));
}

main();
```

### The part that trips people up

**`owner` is not a signer.** `CreateV2` takes the owner as a plain account,
so `wallet.json` still pays and signs and the site wallet never has to be
connected to the script. Learners sometimes expect to need the site wallet's
secret key, and go looking for a way to export it from Phantom. They don't
need it. Say so before they try.

**Forgetting `owner` is permanent.** Without it the asset belongs to
`wallet.json`. Because it's soulbound, it can't be sent to the site wallet
afterwards. That's the assignment working as intended, but the learner has
to mint a second asset. The rejection message spells this out, with the
exact line to add and their address filled in.

**Both fields, not one.** `frozen: true` with the default authority (the
owner) makes a freeze the owner can undo. `authority: None` with
`frozen: false` makes an asset nobody can ever freeze. Only the pair makes
it permanent, which is the point of the guide's hint about which two fields
matter.

## Checkpoint 3 — verify and submit

```bash
npm run verify -- <ASSET_ADDRESS>
```

Expected, with the asset minted to the site wallet:

```
PASS  Asset exists: Ada Lovelace — Fall School soulbound
PASS  PermanentFreezeDelegate plugin attached
PASS  Asset is frozen
PASS  Plugin authority is None (found: None)
SKIP  Transfer test (your wallet is not the owner)

All checks passed! Submit this link:
https://explorer.solana.com/address/<ASSET>?cluster=devnet
```

The `SKIP` is correct and expected. The live transfer test signs as
`wallet.json`, which no longer owns the asset. The three plugin lines decide
the outcome: MPL Core refuses the transfer because of exactly that state.

Then paste the explorer link (or the bare address) into the submit form. It
passes with a note like:

```
"Ada Lovelace — Fall School soulbound" — Core asset owned by 7xKX…gAsU,
PermanentFreezeDelegate frozen with authority None. Nobody can ever thaw it,
so it can never leave this wallet.
```

## Why it can't be transferred

The guide asks learners to be ready to explain this, and it's a fair viva
question:

> The asset carries a `PermanentFreezeDelegate` with `frozen: true`. Every
> transfer and burn goes through MPL Core's lifecycle checks, and a frozen
> permanent freeze delegate rejects both. The plugin's authority is `None`,
> so no key exists that could update it to `frozen: false`. Because the
> plugin is *permanent*, it can't be removed either. The freeze is part of
> the asset for good.

The error a transfer gets back is MPL Core's `InvalidAuthority`, custom
program error `0x9`, which `verify.ts` matches on.

## Marking notes

**Rejections you'll see, and what they mean:**

- *"owned by X, but you are signed in as Y"* is by far the most common.
  They minted to `wallet.json`. The fix is to mint again with `owner`. It is
  not a bug in the grader.
- *"No account at that address on devnet"*: they pasted the transaction
  signature or their wallet address, or minted on localnet. The message
  lists all three.
- *"FreezeDelegate, not a PermanentFreezeDelegate"*: plausible-looking and
  wrong. A plain freeze delegate can be thawed and then revoked, so the
  asset can move.
- *"authority is Owner"*: they set `frozen: true` and left the authority at
  its default. The owner could thaw it.
- *"also carries PermanentTransferDelegate"*: rare, usually from copying a
  snippet that attaches several plugins. Frozen or not, a delegate is a door
  someone else holds.

**Things the grader can't see, worth a glance on the roster:**

- **The name.** The grader checks only that it isn't `CHANGE ME`. Every
  accepted name is in the submission's reason line, so "test" or "asdf"
  stands out.
- **The URI.** Personalised metadata is optional (the guide's "Optional:
  personalize your metadata"). A learner who hosted their own JSON has gone
  further, and it's visible on the explorer page.
- **Who typed it.** The owner proves who the asset is *for*. A friend could
  mint one to your wallet, the same way a friend could push to your fork.

**If you want a harder follow-up question:** ask them to make it burnable
but not transferable (guide stretch goal 1, the Oracle plugin). It forces
them to explain why `PermanentFreezeDelegate` blocks burn as well as
transfer, which the easy track only implies.
