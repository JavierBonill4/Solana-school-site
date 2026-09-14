# Installing the grading layer — Assignment 01, Vault

You need to own the challenge repo. Everything here adds files to the repo
learners fork, and the submission checker pins their hashes.

## 1. Take ownership of the repo

Fork `ASCorreia/solana-fall-vault` into your account, then flip your fork to a
**template** or just treat it as the new upstream. Point the tutorial's
Checkpoint 0 at your copy:

```
git clone https://github.com/<you>/solana-fall-vault.git
git remote add upstream https://github.com/<you>/solana-fall-vault.git
```

This is not optional. You cannot add a workflow to somebody else's repo, you
cannot merge PRs into it, and if the current owner pushes a commit every
manifest you generated goes stale at once.

## 2. Drop these files in

```
.github/workflows/verify.yml                       ← the grader
grader/grade.py                                    ← what it runs
programs/lamports-vault/tests/canonical.rs         ← our tests
```

Nothing else in the repo changes. `canonical.rs` is a normal Cargo integration
test, so `cargo test` picks it up with no config.

## 3. Build the mutant pack

In a **separate private repo**, put a checkout with the reference solution
applied (see `solutions/vault-limit.md`), then:

```
python3 mutants/build.py --repo ../solana-fall-vault-reference --out dist/
```

Upload `dist/vault-v1.tar.gz` as a release asset, and paste the printed
sha256 into `MUTANT_PACK_SHA256` in `verify.yml`. Keep `kill-matrix.json`
private — it maps mutant id to bug, and it is what lets you tell a learner
*what kind* of bug they missed without revealing the mutant.

**One mutant ships by default**: the off-by-one, `<` where the rule is `<=`.
That is the bug Checkpoint 7's boundary pair exists to catch, and it is the
only one those two tests can tell apart. Eight more are written and commented
out in `build.py` — switch any of them on when you want a harder bar.

Keeping it at one matters for cost. Each mutant forces a rebuild of the test
binaries, because swapping the `.so` invalidates `include_bytes!`, so the pack
size lands directly on every learner's CI time: one mutant adds roughly two
minutes, nine adds closer to fifteen.

Note `build.py` reshuffles mutant ids every time you build a pack. That is
deliberate: it stops "mutant m4f2ab dies to the boundary test" circulating.

## 4. Generate the manifest

From the Next.js app:

```
GITHUB_TOKEN=ghp_… node scripts/gen-manifest.mjs <you>/solana-summer-vault main vault-limit
```

Paste the output into `MANIFESTS` in `lib/manifests.ts` under the key
`vault-limit`. Until you do, `POST /api/submissions` refuses every submission
with a 503 — failing closed is the right default when the thing that decides a
grade is unpinned.

Re-run it after **any** push to a locked file. A commit to `verify.yml` that
you forget to regenerate rejects every submission with "verify.yml has been
modified", which is a confusing hour to spend.

## 5. Point the site at your repo

In `lib/challenges.ts`, set `repoFullName` for `vault-limit` to your repo.

## What learners do

```
git switch -c feat/max-withdraw
# … checkpoints 2 through 7 …
git push -u origin feat/max-withdraw
```

The push triggers `verify` in **their** fork. They paste the repo and commit
into the submit form; the site checks the run and awards points. The pull
request stays in the tutorial as the human review step — it is no longer what
produces the grade, which is why a first-time contributor no longer has to
wait for a maintainer to approve their workflow run.

## How grading works, in one paragraph

`anchor build` produces the learner's `.so`. The canonical suite runs against
it — those are our tests, and `canonical.rs` deliberately does not use
`tests/common/mod.rs`, because Checkpoint 6 has learners editing that file.
Then the grader copies `reference.so` over `target/deploy/lamports_vault.so`
and runs the **learner's** tests, which must pass. Then it does the same with
each mutant, where their tests must fail to count as a kill. The swap works
because `common/mod.rs` pulls the program in with `include_bytes!`, and Cargo
tracks that path as a build input, so changing the file rebuilds the test
binaries automatically. No harness changes, no environment variables, nothing
for the learner to notice.

## Known limits

- A learner could hash the `.so` inside their own test and fake a kill.
  Nobody will, and it is visible in their diff if they do.
- The canonical tests are public, so they can be read and coded to. That is
  true of SpeedRunEthereum too, and a learner who reverse-engineers the suite
  has effectively done the assignment.
- CI takes roughly 6–9 minutes with the default single-mutant pack: Solana
  toolchain install, `anchor build`, then one test-binary rebuild per mutant. `Swatinem/rust-cache` keeps dependency
  compilation out of that after the first run.
