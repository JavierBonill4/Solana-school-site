# Installing the grading layer — Assignment 02, Escrow

Same shape as the vault layer, with one thing removed: there is no mutant pack
for this challenge, so there is no private repo, no release asset and no
`MUTANT_PACK_SHA256` to paste. `grade.py` sees `.mutants/` is absent, records
`mutation 0/0`, and scores the canonical half only. The site already knows:
`escrow-timelock` has `mutationEnabled: false`, so its ceiling is 100 points,
not 160, and a submission that passes reads *"no mutant pack configured, so
mutation was not scored"* rather than looking like a zero.

## 0. Fork the upstream into an account you control

`lib/challenges.ts` currently points at **`ASCorreia/solana-summer-escrow`**,
which you do not own. You cannot add a workflow to it, and if its owner pushes
anything, every blob SHA you pin below goes stale at once and every honest
submission starts failing with *"Anchor.toml has been modified"*.

So fork it, add the three files below to **your** fork, and point
`repoFullName` at yours. Learners fork from you.

> The escrow tutorial's Checkpoint 1 links
> `decentra1ized/solana-fall-t22-escrow`. Pick whichever of the two the
> tutorial actually tells students to clone and make `repoFullName`,
> the tutorial and this layer all name the same repo — a mismatch here is the
> single most common cause of *"That repository is not a fork of …"*.

## 1. Drop three files into your fork

```
.github/workflows/verify.yml            <- from this folder
grader/grade.py                         <- from this folder
programs/escrow/tests/canonical.rs      <- from this folder
```

Nothing else changes. `canonical.rs` is self-contained — it carries its own
`setup_mint` / `setup_token_account` / `setup_escrow` rather than sharing the
helpers in `test_make.rs` and `test_cancel.rs`, because those are files a
learner may edit, and a helper a learner can edit is a helper that can be made
to lie.

Commit and push. The workflow runs on your own upstream too; it should come
back red, because upstream has no `created_at` yet and the canonical suite will
not compile against it. That red run is the correct starting state.

## 2. Add `wallet-pubkey`

```bash
printf 'REPLACE_ME\n' > wallet-pubkey
git add wallet-pubkey && git commit -m "add wallet-pubkey" && git push
```

This is what binds a fork to a wallet: the learner replaces the contents with
their own base58 address, and `/api/submissions` rejects the submission unless
the file at that commit names the signed-in wallet. It must exist upstream so
every fork inherits it.

## 3. Pin the manifest

```bash
node scripts/gen-manifest.mjs <you>/solana-summer-escrow main escrow-timelock
```

Paste the printed entry into `lib/manifests.ts` under `"escrow-timelock"`. The
locked set should come out as:

```
.github/workflows/verify.yml
grader/grade.py
programs/escrow/tests/canonical.rs
Anchor.toml
Cargo.toml
Cargo.lock
programs/escrow/Cargo.toml
rust-toolchain.toml
```

and `editable` must include `wallet-pubkey`, `programs/escrow/src/**`,
`programs/escrow/tests/test_*.rs`, and the housekeeping files. Note the
editable glob for tests is `test_*.rs`, **not** `**` — otherwise a learner can
overwrite `canonical.rs` and the lock above is the only thing standing in the
way. (It is. Belt and braces.)

Re-run this after **any** push to a locked file. Until the entry exists,
`POST /api/submissions` answers 503 for this challenge. Failing closed is
correct when the thing that decides a grade is unpinned.

## 4. Point the site at your fork

In `lib/challenges.ts`:

```ts
repoFullName: "<you>/solana-summer-escrow",
```

Redeploy. That value is read at request time, so a Vercel redeploy is enough —
no migration, nothing to rebuild in the database.

## 5. Smoke-test it the way a learner would

1. Fork your repo from a second GitHub account.
2. Put that account's wallet address in `wallet-pubkey`.
3. Solve Checkpoint 6 (`solutions/escrow-timelock.md` has the diff).
4. Push. Watch the run go green in **that fork's** Actions tab.
5. Submit **the fork's** commit SHA on `/portfolio`.

Expected: `Canonical 7/7 · no mutant pack configured, so mutation was not
scored · 100 points`.

## What the canonical suite actually asserts

Seven tests, all of them Checkpoint 6:

| Test | Catches |
|---|---|
| `make_records_the_creation_time` | `created_at` never written, or written as a constant |
| `make_still_moves_the_deposit_into_the_vault` | the time lock broke `make` |
| `cancel_immediately_is_refused` | no check at all |
| `a_refused_cancel_moves_nothing` | check placed *after* the transfer |
| `cancel_one_second_early_is_refused` | delay wired to the wrong constant |
| `cancel_at_the_exact_boundary_succeeds` | `>` where the spec says `>=` |
| `cancel_after_the_delay_returns_everything` | the happy path still closes both accounts |

The boundary test is the one that matters. `>` instead of `>=` passes every
other test in the file, which is exactly why it is in there.

## If you ever want the mutation half here too

Copy `challenge-layers/vault-limit/mutants/build.py`, swap the paths for
`programs/escrow/src/instructions/cancel.rs`, and give it one mutant — `>`
instead of `>=` — built from the reference solution. Then add the fetch step
back into `verify.yml` and flip `mutationEnabled: true` in `lib/challenges.ts`.
`grade.py` needs no edit: it already looks for `.mutants/reference.so` and
`.mutants/m*.so` and scores them if they are there.

## The four gates

`grade.py` also measures the same four things the vault and fundraiser do, and
reports them under `gates` in `result.json`:

| Gate | What it means |
|---|---|
| `build` | `anchor build` produced an IDL at `target/idl/escrow.json`. |
| `tests` | The learner's own suite is green with **4+** passing. |
| `surface` | The IDL gained an instruction, account or field. |
| `errors` | At least one new `#[error_code]` variant. |

**4, not 14 or 15.** The starter's learner-editable tests are `test_make.rs`
(1) and `test_cancel.rs` (1) — two — and the tutorial asks for two more. Four.
`canonical.rs` is ours and sealed, so it does not count toward the learner's
total. Each bar is derived from its own repo and its own tutorial: do not copy
a number across challenges.

A correct submission adds `Escrow.createdAt` and at least one error
(`TimeLockActive`), so the gates line up with what Checkpoint 6 already asks
for rather than adding new work.

`grader/baseline.json` is a new sealed file holding the starter's surface and
that test count. **It has to go into the repo alongside grade.py, and the
manifest regenerated**, or every submission fails the sealed-file check.

Which picture a pass requires is `requires:` on the challenge in
`lib/challenges.ts` — `"canonical"` (today), `"gates"` or `"both"`. Changing
it is a redeploy; nothing is pushed here.

## Why the build step runs `anchor keys sync`

The repo declares a program id and deliberately does not ship its keypair — a
keypair is a private key and has no business in a public repo. A fresh CI
checkout therefore has no `target/`, so `anchor build` generates a new random
keypair and then refuses to continue because its pubkey does not match
`declare_id!`:

```
Program ID mismatch
Keypair file has: <random>
Source code has:  8hVo1qi4VPNuieLP9NFpuUcDA9CLT8aMooo9exCunTQF
```

Every learner hits this. It is a property of the checkout, not of their work.

`anchor keys sync` rewrites `declare_id!` and `Anchor.toml` to match the
keypair that was just generated. Both edits land in CI's throwaway working
copy, so nothing is committed and the sealed-file check is unaffected. The
program id is arbitrary here anyway — LiteSVM loads the `.so` at whatever
`escrow::id()` reports.

**Do not commit the keypair instead.** It is a private key, the repo is
public, and anyone holding it can deploy a program at that address.
