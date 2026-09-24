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

Paste the printed entry into `lib/manifests.ts`.

The `transfer-hook` profile is already in `scripts/gen-manifest.mjs`. It is a
custom profile rather than the derived one, and its choices are worth knowing:

- **Locked:** the workflow, `grader/grade.py`, `grader/baseline.json`,
  `rust-toolchain.toml`. That is all, and it is the honest line for a
  gates-only challenge — nothing else decides the grade. There is no canonical
  suite to protect and no mutant pack to keep a learner away from.
- **Editable:** `programs/*/Cargo.toml`, `programs/*/src/**`,
  `programs/*/tests/**`, plus `wallet-pubkey`, `Anchor.toml`, both lockfiles
  and the usual repo furniture.
- **`programs/*/`, not `programs/solana-fall-transfer-hook/`.** Challenge 4
  has learners run `anchor new token-mover`, which adds a **second program** to
  the workspace, and the name is the guide's suggestion rather than a
  requirement. A glob keeps that from being a rejection — but it matches only
  `Cargo.toml`, `src/` and `tests/`, so a `build.rs` or a
  `.cargo/config.toml` still has nowhere to land.
- **`Anchor.toml` is editable on purpose.** `anchor keys sync` rewrites it, and
  every learner runs that; `anchor new` rewrites it again.

## 4. Point the site at it

Done — `lib/challenges.ts` now carries:

```ts
repoFullName: "javierbonill4/solana-fall-transfer-hook",
grading: "ci",
requires: "gates",
```

`requires: "gates"` is what tells the site to judge on the four gates rather
than on a canonical suite this challenge does not have. `repoFullName` moved
off `decentra1ized/…` because learners have to fork the copy that actually
carries the grader.

## 5. Smoke-test it

The workflow only grades forks:

```yaml
if: github.event.repository.fork || github.event_name == 'workflow_dispatch'
```

The upstream is not a fork, so pushing to it runs nothing. That is deliberate —
grading the starter parks a permanent red X on the repository every student
clones, which reads as "the starter is broken". To test it, dispatch it by hand
from the Actions tab.

Expect **`Gates met: 1/4`**: it builds, but its four tests are three short of
the bar, the IDL has no `mint` field, and no new error is returned. That is the
correct starting state, and seeing exactly that is the check that the wiring
works.

## Why the build step runs `anchor keys sync`

Same reason as the vault and the escrow: the repo declares a program id but
cannot ship its keypair, so a fresh checkout builds a new random one and
`anchor build` refuses on the mismatch. keys sync makes `declare_id!` agree
with the keypair just generated, in CI's throwaway checkout — nothing is
committed, and the sealed-file check is unaffected.

The build step is `continue-on-error: true`. A build that fails still has to
reach `grade.py`, which writes a `result.json` saying the build gate failed —
a red run with no artifact is a submission the site cannot read at all.

## What the workflow does not install

No Node, no yarn, no surfpool, no throwaway keypair. The suite is Rust and
drives the program through LiteSVM in-process: `helpers/mod.rs` pulls
`target/deploy/solana_fall_transfer_hook.so` in with `include_bytes!`, so
there is nothing to deploy and no validator to start. Anchor 1.2.0 comes down
as a checksum-pinned release binary rather than through `avm`, which compiles
itself from source and then fails its provenance check under `contents: read`.

## The one step that looks wrong and is not

`Install edition-2024-capable platform-tools` unpacks **v1.55** into the
**v1.51** cache slot. That is deliberate.

The committed `Cargo.lock` pins `ctutils 0.4.2` and `wincode 0.5.5`, both of
which declare `edition2024`. The `cargo-build-sbf` that ships with current
stable Agave (3.0.10) selects platform-tools v1.51, whose bundled Cargo is
1.84.1 — and 1.84 cannot parse an `edition2024` manifest. `anchor build` dies
during dependency resolution, before compiling a line, on a repo nobody has
touched:

```
error: failed to parse manifest at .../ctutils-0.4.2/Cargo.toml
  feature `edition2024` is required
```

`--tools-version` is not a way out: Anchor passes its own value through to
`cargo-build-sbf` and overrides anything given on the command line. What
`cargo-build-sbf` actually does is `rustup toolchain link
1.84.1-sbpf-solana-v1.51 platform-tools/rust` relative to that cache
directory, so seeding the v1.51 slot with the v1.55 tarball hands it a Cargo
1.89 under the name it expects. Verified from a cleared cache and an empty
toolchain list.

**This hits learners locally too**, so the same three lines belong in the repo
README, not only in CI:

```bash
curl -sSfL -o /tmp/pt.tar.bz2 \
  https://github.com/anza-xyz/platform-tools/releases/download/v1.55/platform-tools-linux-x86_64.tar.bz2
mkdir -p "$HOME/.cache/solana/v1.51/platform-tools"
tar xjf /tmp/pt.tar.bz2 -C "$HOME/.cache/solana/v1.51/platform-tools"
```

Delete the workflow step when an Agave release selects v1.52 or newer by
default.

## The reference solution

`solutions/transfer-hook.md` carries a complete, verified solution: all four
challenges, the `token-mover` program in full, the two new test files, and the
`result.json` it produces. It was built and run end to end — 7 tests passing,
gates 4/4, exit 0 — and the untouched starter was run through the same grader
for 1/4. Use it to smoke-test a fork before opening the challenge to a cohort.
