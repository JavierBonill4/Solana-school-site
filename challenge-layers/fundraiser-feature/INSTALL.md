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

## The run is slow

45 minutes of timeout, and it will use a fair chunk of it: `avm install 1.1.2`
builds Anchor from source, and `anchor test` starts a real validator. The cargo
cache makes the second run much faster. This is the learner's own runner and
their own free minutes, so slow is acceptable — but tell them, or the first
submission looks hung.
