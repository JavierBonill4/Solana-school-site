# Installing the grading layer — Assignment 04, Fundraiser

Different in kind from the first three. There is no canonical suite, because
nothing is canonical when the learner picks the feature. `grade.py` checks four
things instead, and reports them in the `canonical` slot so the site needs no
changes:

| Gate | What it means |
|---|---|
| `build` | `anchor keys sync` then `anchor build` succeeds. |
| `tests` | The suite is green and has at least **14** passing — the starter's 11 plus Checkpoint 6's three. |
| `surface` | The built IDL has an instruction, account, or account field the starter does not. |
| `errors` | At least one `#[error_code]` variant the starter does not have. |

All four or nothing, at 100 points. `notes` names the gate that failed and,
when the surface gate passes, lists exactly what it found — `claimMilestone`,
`Fundraiser.milestonesHit`, `MilestoneAlreadyClaimed`. That list is the fastest
way to see what somebody built before opening their PR.

## What this deliberately does not prove

The learner owns the test harness. They can pad the suite with three trivial
tests and pass the `tests` gate. There is no way around that: grading an
open-ended feature on correctness would require knowing what the feature is.

That is fine, because **this gate is a filter, not a judge**. Its job is to make
sure that what reaches Checkpoint 7 — the pull request, where the tutorial says
"most of the thinking shows" — already builds, already runs green, and already
has real on-chain surface behind it. The judgement happens when you read the PR.
`solutions/fundraiser-feature.md` is the rubric for that.

Two things it *does* close cheaply:

- `Anchor.toml` has to stay editable, because the starter ships a `declare_id!`
  whose keypair it does not ship and every learner runs `anchor keys sync`.
  That leaves `[scripts] test` editable too, so `grade.py` **overwrites that
  line with a pinned command** before running the suite rather than trusting it.
- A feature with no IDL delta cannot pass, whatever the tests say. Changing no
  on-chain state means there is nothing for a test to assert on.

## 1. Drop three files into the upstream

You own `JavierBonill4/anchor-fundraiser`, so there is no fork step here — this
goes straight into it.

```
.github/workflows/verify.yml   <- from this folder
grader/grade.py                <- from this folder
grader/baseline.json           <- from this folder
```

`baseline.json` is the starter's on-chain surface, written by hand from the
source: 4 instructions, 2 accounts (`Fundraiser` with 7 fields, `Contributor`
with 1), 8 errors, 11 tests. Names are compared case-insensitively with
underscores stripped, so the snake_case in that file matches the camelCase
Anchor 1.x emits in the IDL.

**Re-generate it if you ever change the starter program.** Add an instruction
upstream and every learner's `surface` gate starts passing for free.

## 2. Add `wallet-pubkey`

```bash
printf 'REPLACE_ME\n' > wallet-pubkey
git add wallet-pubkey && git commit -m "add wallet-pubkey" && git push
```

Same as the other challenges: it is what binds a fork to a wallet, and every
fork has to inherit it.

## 3. Pin the manifest

```bash
GITHUB_TOKEN=… node scripts/gen-manifest.mjs JavierBonill4/anchor-fundraiser main fundraiser-feature
```

Should print **3 files pinned** — the workflow, the grader and the baseline —
and a source baseline covering `programs/fundraiser/src/**` and `tests/**`.
Paste the entry into `lib/manifests.ts`.

The allow-list is much wider here than on the other challenges, on purpose:
`programs/fundraiser/**`, `tests/**`, `Anchor.toml`, `Cargo.*`, `package.json`,
`yarn.lock`, `tsconfig.json` and the README are all editable, because a feature
may need a dependency and every learner rewrites the program id. What stays
sealed is the part that decides the grade.

## 4. Nothing to change on the site

`lib/challenges.ts` already has the entry, `mutationEnabled: false`, ceiling
100. The route, the portfolio and the leaderboard all read `CHALLENGES`, so
adding the fourth assignment changed no counts by hand.

## 5. Smoke-test it

Expect the upstream's own run to go **red at the `surface` and `errors` gates**
and green at `build` and `tests` — the starter builds and its 11 tests pass, but
it has no feature. `Gates met: 2/4` is the correct starting state and a good
check that the grader is wired up.

Then from a second account: fork, put that wallet in `wallet-pubkey`, add a
feature, push. Expect `Gates met: 4/4 · 100 points`.

## Two things that are easy to get wrong

**`anchor test` needs surfpool, not solana-test-validator.** Anchor 1.0 changed
the default backend, and surfpool is a separate install. Without it the command
dies before a single test runs, and mocha prints nothing — which a naive grader
reports as "your tests failed". The workflow installs it, and `grade.py` retries
on `--validator legacy` if it is missing, so a toolchain problem never gets
blamed on a learner.

**avm cannot be used in a hardened workflow.** Current avm verifies the binary's
build provenance through the GitHub attestations API, which answers **403** to a
job holding only `contents: read`. `avm install 1.1.2` therefore fails outright.
The workflow takes the release binary directly and checks its SHA-256 itself;
the fallback is `cargo install anchor-cli`, which has no provenance step.

## Changing a sealed file after learners have forked

`verify.yml`, `grader/grade.py` and `grader/baseline.json` are pinned by blob
SHA, so editing one in the upstream invalidates every fork that has not synced.
The full sequence is:

1. Push the change to the upstream.
2. **Re-run `gen-manifest.mjs` and paste the new entry** into `lib/manifests.ts`,
   then redeploy. Until you do, every submission is rejected with
   *"verify.yml has been modified"* — including honest ones, because the fork's
   old copy no longer matches the new pin.
3. Tell learners to sync **and merge into their working branch**. Syncing `main`
   is not enough: the workflow that runs on a push to `feat/whatever` is the one
   in *that branch's* tree, and the manifest check reads the tree at the
   submitted commit. `git fetch upstream && git merge upstream/main` on their
   branch, then push.

Step 3 is the reason to get the workflow right before a cohort starts, and the
reason the grader falls back rather than failing whenever it reasonably can.

## How long a run takes

Roughly **8–14 minutes cold, 4–7 warm**, per fork.

| Step | Cold | Warm | Why |
|---|---|---|---|
| Rust + Node setup | ~30s | ~30s | prebuilt |
| Solana toolchain | 1–2 min | 1–2 min | prebuilt download, not cached by us |
| Anchor 1.1.2 | ~20s | ~20s | prebuilt binary, checksum-pinned; avm is not used |
| surfpool | ~15s | ~15s | prebuilt tarball, checksum-pinned |
| platform-tools | 1–2 min | ~0 | `actions/cache` on `~/.cache/solana` |
| `yarn install` | ~1 min | ~1 min | |
| `anchor build` | 4–7 min | 1–2 min | `Swatinem/rust-cache`; the SBF compile is the floor |
| `anchor test` | 2–4 min | 2–4 min | real validator, three suites — this is the actual work |

The caches are per-repository, so every learner pays the cold run once in their
own fork. There is no way to warm a cache across forks: Actions caches are
scoped to the repo, and a fork cannot read the upstream's on a `push` event.

Two things worth telling learners:

1. **The run starts on push, not on submit.** Push, go and do something else,
   come back and submit — by then CI has usually finished and the site answers
   immediately. Pushing and submitting in the same breath is what makes it feel
   like the site is hanging. It is not: the submit form polls every 20 seconds
   and says "Submission in progress" while it waits.
2. **The first run in a fork is the slow one.** After that the cargo cache is
   warm and it roughly halves.

If it ever does get slower, the timeout is 30 minutes — enough headroom for a
cold run on a bad day, and short enough that something genuinely stuck fails
rather than sitting there.
