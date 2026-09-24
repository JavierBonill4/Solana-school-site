# Installing the grading layer — Transfer Hook

Four gates, nothing else. No canonical suite and no mutant pack: this
assignment is about fixing a program that already runs, and the guide's own
checkpoints are specific enough that the gates line up with them.

| Gate | What it means |
|---|---|
| `build` | `anchor build` produced both the program and the IDL. |
| `tests` | The learner's own suite is green with **7+** passing. |
| `surface` | The IDL gained an instruction, account or field. |
| `errors` | A declared error is returned somewhere the starter returned none. |

All four or nothing, at 100 points. A fork that is provably theirs with
changed source still earns the 20-point attempt credit.

## The numbers, and where they come from

**7 tests.** The starter ships four: `test_initialize.rs` (1),
`test_init_extra_account_meta.rs` (1), `test_transfer_hook.rs` (2). Challenge 3
asks for one new test, Challenge 4 for two. Four plus three is seven. Counted
from the repo and the guide, not copied from another challenge — the bars so
far have been 15, 4 and 7.

**The `errors` gate is defined differently here, deliberately.** Every other
challenge asks for a new `#[error_code]` variant. This one does not: the guide
hands learners the existing codes and their hex values (`0x1771`
RateLimitExceeded, `0x1772` InvalidMint, `0x1773` NotTransferring) and asks
them to *return* the right one. A "new variant" gate would fail every correct
solution.

So the gate counts references to `ErrorCode::` outside `error.rs`. The starter
has **2**, both in `transfer_hook.rs`. Challenge 1 requires rejecting a
non-Token-2022 mint with `InvalidMint`, which makes it 3 or more. A brand new
variant still satisfies the gate, so nobody is penalised for going further.

**`surface` is satisfied by Challenge 2**, which adds `mint` to the
`RateLimit` account so the limit can be per-mint. Verified against the real
starter IDL shape: untouched → nothing new; with `mint` added →
`RateLimit.mint`.

## 1. Drop three files into the upstream

```
.github/workflows/verify.yml   <- from this folder
grader/grade.py                <- from this folder
grader/baseline.json           <- from this folder
```

All three are sealed by blob SHA. Re-run `gen-manifest.mjs` after **any** push
that touches them.

## 2. Add `wallet-pubkey`

```bash
printf 'REPLACE_ME\n' > wallet-pubkey
git add wallet-pubkey && git commit -m "add wallet-pubkey" && git push
```

It binds a fork to a wallet, and every fork has to inherit it.

## 3. Pin the manifest

```bash
GITHUB_TOKEN=… node scripts/gen-manifest.mjs JavierBonill4/solana-fall-transfer-hook main transfer-hook
```

Add a `transfer-hook` profile to `scripts/gen-manifest.mjs` first — the
program directory is `solana-fall-transfer-hook`, and `grader/baseline.json`
needs to be in its locked list alongside the workflow and the grader.

## 4. Point the site at it

`lib/challenges.ts` already carries the entry. Set:

```ts
grading: "ci",
requires: "gates",
```

`requires: "gates"` is what tells the site to judge on the four gates rather
than on a canonical suite this challenge does not have.

## 5. Smoke-test it

The upstream's own run should land at **`Gates met: 2/4`** — it builds and its
four tests pass, but it has no `mint` field and returns no new error. That is
the correct starting state and a good check that the wiring works.

## Why the build step runs `anchor keys sync`

Same reason as the vault and the escrow: the repo declares a program id but
cannot ship its keypair, so a fresh checkout builds a new random one and
`anchor build` refuses on the mismatch. keys sync makes `declare_id!` agree
with the keypair just generated, in CI's throwaway checkout — nothing is
committed, and the sealed-file check is unaffected.
