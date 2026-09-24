# Installing the grading layer — Pinocchio Escrow

Four gates, nothing else. No canonical suite and no mutant pack, same as the
transfer hook: submissions are judged on the gates only (`requires: "gates"`).

| Gate | What it means here |
|---|---|
| `build` | `cargo build-sbf` produced `target/deploy/escrow.so`. |
| `tests` | The learner's own suite is green with **6+** passing. |
| `surface` | The dispatch `match` routes **Take** and **Cancel** to handlers. |
| `errors` | **MakeV2** has its own arm returning an error, and there is no `_ =>` arm. |

All four or nothing, at 100 points. A fork that is provably theirs with
changed source still earns the 20-point attempt credit.

## Why two of the gates are defined differently

This is native Rust on Pinocchio, so the Anchor versions of two gates cannot
be asked:

**There is no IDL.** Nothing emits one. What the IDL gate stood for was "the
instruction set grew", and in a Pinocchio program the instruction set *is*
the `match` in `lib.rs`. The starter routes Make only; Take and Cancel fall
into `_ => Err(InvalidInstructionData)`. So `surface` reads that match and
needs an arm for each of Take and Cancel that calls a handler rather than
returning `Err`. It finds the match wherever the learner puts it, handles
`use EscrowInstructions::*` with bare `Take =>`, block bodies, `A | B =>`
or-patterns, and ignores comments, strings and code under `src/tests/`.

**There is no `#[error_code]`.** Pinocchio answers with `ProgramError`, and
the guide's error requirement is concrete. Checkpoint 05 says no `_ =>` arm
may silently swallow `MakeV2`: return an explicit error for it. So `errors`
asks exactly that. Remove the wildcard and Rust's exhaustiveness check forces
a MakeV2 arm. The grader then checks that arm returns `Err` rather than
routing MakeV2 into Make.

Both are read from source, the same way the transfer-hook grader counts
`ErrorCode::` references. They show the dispatch is wired the way the guide
asks. Whether Take and Cancel move the right tokens is covered by the
learner's own tests, which have to be green.

## The numbers

**6 tests.** The starter reports **2** passing: `test_make_instruction`, plus
`test_id`, which Pinocchio's `declare_id!` generates. Challenge 3 asks for
four more (Take, Cancel, the underfunded Take, the stranger's Cancel), so the
bar is 2 + 4 = 6. That is five real tests, which matches the guide's
definition of done.

## 1. Drop three files into the upstream

Push to `JavierBonill4/solana-fall-pescrow`:

```
.github/workflows/verify.yml   <- from this folder
grader/grade.py                <- from this folder
grader/baseline.json           <- from this folder
```

All three are sealed by blob SHA, and so is `Cargo.toml`. Re-run
`gen-manifest.mjs` after **any** push that touches them.

## 2. Add `wallet-pubkey`

```bash
printf 'REPLACE_ME\n' > wallet-pubkey
git add wallet-pubkey && git commit -m "add wallet-pubkey" && git push
```

## 3. Pin the manifest

```bash
GITHUB_TOKEN=… node scripts/gen-manifest.mjs JavierBonill4/solana-fall-pescrow main pinocchio-escrow
```

**`lib/manifests.ts` already has a `pinocchio-escrow` entry.** It was generated
by running this same script against a local copy of the upstream with steps 1
and 2 applied. The blob SHAs are content hashes, so they match what GitHub
will report once you push these exact files. Run the command anyway after
pushing and compare. If anything differs, paste the printed entry over the
existing one.

The `pinocchio-escrow` profile in `scripts/gen-manifest.mjs`:

- **Locked:** the workflow, `grader/grade.py`, `grader/baseline.json`,
  `Cargo.toml`. Learners have no reason to edit `Cargo.toml`, because the guide
  pins every crate. Locking it also blocks `build = "src/…"`, which would let
  a build script in through the editable `src/` glob.
- **Editable:** `wallet-pubkey`, `src/**`, `tests/**`, `Cargo.lock`, the
  README and git dotfiles, `result.json` (written when a learner runs the
  grader locally and caught by `git add -A`), and `.DS_Store`. The upstream
  already ships a `.DS_Store` at its root, and macOS learners will commit more.
- **No `programs/` directory.** Pinocchio is a single crate at the repo root,
  so this profile names paths directly instead of using the derived Anchor
  shape.

## 4. Point the site at it

Done. `lib/challenges.ts` now has:

```ts
repoFullName: "javierbonill4/solana-fall-pescrow",
grading: "ci",
requires: "gates",
```

`repoFullName` moved off `decentra1ized/…` because learners have to fork the
copy that carries the grader. **The repo README still tells learners to fork
`decentra1ized/solana-fall-pescrow`** (checkpoint 00, step 1). Update that
link when you push the layer, or forks will fail check 1.

## 5. Smoke-test it

The workflow only grades forks. To test the upstream, dispatch it by hand
from the Actions tab.

Expect **`Gates met: 1/4`**. It builds, but 2 tests is four short of the bar,
Take and Cancel are not dispatched, and the `_ =>` arm is still there. That
starting state was verified here, and so was the reference solution:
**4/4, 6 passing, exit 0.**

## Toolchain choices in the workflow

- **Agave 3.1.14 from its GitHub release tarball, pinned by SHA-256**, not
  `release.anza.xyz/stable/install`. A moving `stable` can change a
  learner's result between two pushes of the same code. Also, 3.1.x selects
  platform-tools v1.52 (Cargo 1.89), which parses the edition-2024 manifests
  in this `Cargo.lock`. The 3.0.x line picks v1.51 (Cargo 1.84) and fails,
  which is the problem the transfer-hook workflow works around by seeding
  the cache by hand. Pinning a release that doesn't have the problem avoids
  that step here.
- **Rust 1.95.0** for the host (the test binary). The repo ships no
  `rust-toolchain.toml`, so the workflow pins it.
- **`rm -rf target/deploy` before building.** `rust-cache` restores `target/`,
  and a stale `escrow.so` from an earlier green commit would otherwise let a
  broken build pass the build gate and run the tests against the old program.
- **No `anchor keys sync`.** Pinocchio's `declare_id!` is a constant and the
  tests load the `.so` at `crate::ID`, so the generated keypair is never used.
- Build is `continue-on-error: true`, so a failed build still reaches
  `grade.py` and publishes a result saying so.

## The reference solution

`solutions/pinocchio-escrow.md` is the full reference solution: `take.rs`,
`cancel.rs`, a `shared.rs` for the drain-and-close tail, the dispatch arms,
the four new tests, CU numbers and marking notes. It was built with
`cargo build-sbf` and run through this grader from a clean clone.
