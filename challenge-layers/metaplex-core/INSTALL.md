# Installing the grading layer — Metaplex Core

There is nothing to install in a challenge repo this time. No workflow, no
`grader/`, no manifest. This file explains why and lists what changed on the
site.

## Why there is no CI layer

Every other assignment ends in a fork, so the grade is read from a CI run in
that fork. This one doesn't. The required part (the easy track) never forks
the repo and never opens a PR. The guide's own deliverable is a single
explorer link:

```
https://explorer.solana.com/address/<ASSET>?cluster=devnet
```

The Anchor track and the editions bonus do ask for PRs, but against
`ASCorreia/fall-school-metaplex-core`, which is not a repo this site controls.
Both are optional.

The work itself is an account on devnet, and that is better evidence than
a repo:

- **It can't be edited afterwards.** A Core asset with a
  `PermanentFreezeDelegate` whose authority is `None` is frozen for good.
  Nobody, including the learner, can thaw it, burn it or change the plugin.
- **It can't be passed around.** Since the asset can never be transferred,
  its owner is the wallet it was minted to. Reading the owner proves who it
  was minted for, with no `wallet-pubkey` file needed.
- **Reading it executes nothing.** One `getAccountInfo` to devnet. This is
  the same principle as the CI graders: grading is a read, not an execution.

So the challenge uses a new grading mode, `grading: "chain"`.

## What a submission has to satisfy

| # | Check | Rejected with |
|---|---|---|
| 1 | The address is an account on devnet owned by the MPL Core program, with key `AssetV1` | no account / wrong program / "that's a collection, not an asset" |
| 2 | `owner` is the wallet signed in on the site | the owner it found, the wallet signed in, and the exact line to add to `create()` |
| 3 | `name` isn't blank or the starter's `CHANGE ME` | "still named …" |
| 4 | `PermanentFreezeDelegate` attached, `frozen: true`, authority `None` | whichever of the three is wrong, with the reason it matters |
| 5 | No transfer or burn delegate on the asset or its collection | the plugin it found |

Check 5 is stricter than the guide's `verify` script. A frozen asset that
also carries a `PermanentTransferDelegate` passes all three of the guide's
plugin checks, but a delegate on it is a door someone else holds. It is
rejected as "not a clean soulbound proof" rather than debated.

On a pass the submission is recorded with the explorer link as its `runUrl`,
so the portfolio, the admin roster and the submit form all link straight to
the asset. The labels read **Explorer →** instead of **CI run →**.

One address is one submission: the record is keyed `devnet:<asset>`, and a
second wallet trying the same address is rejected even before the owner check
would stop it.

## The one change learners have to make

Students have to mint the asset to the wallet they sign in to the site with.
Nothing in the upstream guide says that yet. The starter mints to whoever
signs (`umi.identity`), which is the throwaway `wallet.json`, and that wallet
isn't the one on the site.

It is one line in `create()`:

```ts
import { generateSigner, publicKey } from "@metaplex-foundation/umi";
// …
await create(umi, {
  asset,
  name: NAME,
  uri: URI,
  owner: publicKey("<their site wallet>"),   // ← this
  plugins: [ … ],
}).sendAndConfirm(umi);
```

`owner` is not a signer in `CreateV2`, so `wallet.json` still pays and signs
and nothing else in the flow changes. **The submit form shows this line with
the learner's own address filled in and a Copy button**, so they don't have
to find it in the guide.

Worth adding to the guide (checkpoint 2 or 3) and to
`01-easy-track/README.md`, because a learner who mints first and reads the
form second has to mint again. A soulbound asset can't be moved to the right
wallet afterwards, which is the point of the assignment. The rejection
message says exactly that, with the fix.

### What happens to `npm run verify`

The script only attempts its live transfer test when `wallet.json` is the
owner. With the asset minted to the site wallet it prints
`SKIP Transfer test (your wallet is not the owner)` and still ends in
`All checks passed`. The three plugin checks, which are the ones that decide
the outcome, still run. Tell learners the SKIP is expected.

## Files changed on the site

- `lib/core-asset.ts`: decodes MPL Core `AssetV1` and `CollectionV1`
  accounts, their plugin registry, and the freeze plugins' `frozen` flag.
  `judgeSoulbound()` applies checks 4 and 5. Decoded by hand, about 150
  lines, so the server bundle doesn't pull in Umi to read five fields.
- `lib/core-asset.server.ts`: one `getAccountInfo` over JSON-RPC, plus the
  collection when the asset has one. A devnet outage comes back as
  `transient`. The route answers 503 without writing a failed attempt into
  the learner's portfolio, because the outage isn't their fault.
- `app/api/submissions/route.ts`: `gradeFromChain()`, dispatched when
  `grading === "chain"`. It accepts a bare address or the explorer link the
  guide asks for, and refuses links to mainnet or testnet.
- `lib/types.ts`: `"chain"` added to `grading`.
- `lib/challenges.ts`: `metaplex-core` moves from `"repo"` to `"chain"`.
- `components/SubmitForm.tsx`: the chain form: the owner line to copy, then
  the asset field.
- `components/ChallengesList.tsx`, `app/admin/students/[pubkey]/page.tsx`:
  the link label follows the URL, so an asset reads **Explorer →**.
- `.env.example`: `DEVNET_RPC_URL`, optional. The public devnet endpoint
  rate-limits, so set a Helius or Triton devnet URL before a whole cohort
  submits at once.

## How the decoder was checked

It was checked against Metaplex's own SDK, not against a reading of the
docs. Accounts were built byte for byte with `@metaplex-foundation/mpl-core`'s
serializers, then decoded by both the SDK's `deserializeAssetV1` and
`lib/core-asset.ts`. Nine cases agreed on owner, name, update authority,
plugin presence, `frozen` and authority: frozen with authority None; with an
`Attributes` plugin registered first; not frozen; authority Owner; authority
Address; a plain `FreezeDelegate`; no plugins; plus a
`PermanentTransferDelegate`; inside a collection. A collection carrying a
`PermanentTransferDelegate` was rejected, a collection address submitted as
an asset was named as a collection, a truncated account errored cleanly, and
an asset with `seq` set decoded correctly.

**Not yet tested against a live devnet account.** Devnet isn't reachable
from where this was built. Before opening it to the cohort, mint one with
`01-easy-track/solution` plus the owner line and submit it yourself. That
takes about two minutes, and it's the only check still missing.

## What is still trusted

- **Who ran the mint.** The owner proves who the asset is *for*, not who
  typed the code. A friend could mint one to your wallet. That's the same
  boundary as a friend pushing to your fork: it cheats only the person who
  needs the skill.
- **The name.** The guide asks for the learner's name in `NAME`. The grader
  only checks it was changed from `CHANGE ME`. The accepted name is shown in
  the submission's reason, so a roster of "asdf" is visible at a glance.
- **Devnet itself.** Devnet has been reset before. A reset would wipe every
  asset, but the submission record and its points stay in the database. Only
  the explorer link would stop resolving.

## The optional tracks

Not graded. If you want them later, both fit this same mode:

- **Anchor track:** the asset checks are the same. Also fetch the mint
  transaction and require that its top-level instruction is *not* MPL Core,
  meaning the asset came from a CPI in the learner's own program.
- **Editions bonus:** a `CollectionV1` with `MasterEdition` (`maxSupply: 3`)
  and three assets with `Edition` 1–3 and three different asset-level
  `Royalties`. `decodeCollection()` already reads the registry. The remaining
  work is decoding the `Edition` and `Royalties` bodies.
