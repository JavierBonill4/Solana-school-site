# How a submission is graded

The short version: **we never run a learner's code.** They run it, in their own
GitHub Actions runner, on their own free minutes. Our server reads the result
GitHub already computed, and then spends most of its effort proving that the
result came from an unmodified grader, at the commit that was submitted, on a
machine GitHub owns.

Grading is a *read*, not an *execute*.

---

## Why not just run it

Running a stranger's Rust in our process is handing them our process. A build
script (`build.rs`) runs arbitrary code at compile time, before a single test
executes — they do not even need the tests to run. Sandboxing that properly
means containers, resource caps, network egress rules, and someone on call when
a learner's infinite loop pins a CPU at 3am. That is a platform, not a course.

So the execution moved to where it already was: the learner's own CI.

---

## Where the code actually runs

```
learner's fork  ──push──▶  GitHub Actions runner (ubuntu-latest, theirs)
                                   │
                                   │  anchor build
                                   │  cargo test --test canonical
                                   │  cargo test (their tests, our .so files)
                                   ▼
                            result.json  ──uploaded as an artifact──▶ GitHub
                                                                        │
  our server  ◀────── reads it over the GitHub API ─────────────────────┘
```

Every line of learner code executes inside a fresh virtual machine that GitHub
creates, isolates and destroys. It never touches our infrastructure. Our server
makes HTTP requests to `api.github.com` and nothing else.

Cost note: those are the learner's Actions minutes on their own public repo,
which are free and unlimited. We pay for nothing.

---

## The two halves of a grade

### Half 1 — our tests against their program

`programs/<program>/tests/canonical.rs` is ours. It is sealed (see below), it
is self-contained — it carries its own fixtures rather than importing helpers
the learner can edit — and it tests the thing the checkpoint asked for. On the
escrow challenge it is seven tests, one of which is the whole point:

```rust
warp_to(&mut svm, created_at + DELAY);   // exactly 300 seconds
send(..).expect("the lock has elapsed at created_at + 300, not after it");
```

`>` instead of `>=` passes every other test in the file. That is what a
canonical suite is for.

### Half 2 — their tests against our programs

This is the half people find surprising. We ship a **mutant pack**: a set of
pre-compiled Solana programs, stripped of symbols, each one the correct
implementation with exactly one bug introduced. Plus `reference.so`, the
correct build.

The grader swaps those binaries over `target/deploy/<program>.so` and re-runs
the learner's *unmodified* test suite against each one:

- Their tests must **pass** against `reference.so`.
- Their tests must **fail** against each mutant. A failure is a *kill*.

The trick that makes it work with no harness changes: the test files do

```rust
let bytes = include_bytes!("../../../target/deploy/escrow.so");
```

and Cargo tracks `include_bytes!` targets as build inputs. Drop a different
binary at that path and `cargo test` rebuilds the test binary automatically,
now pointed at a different program. The learner's tests do not know anything
changed.

Requiring both conditions is what makes the metric honest. `assert!(false)`
fails against every mutant — but it also fails the reference check, so it kills
nothing and scores zero. The only way to score is to write a test that is
right about correct code and wrong about broken code.

The source of each bug never ships. Only stripped binaries go out, and the
mutant ids are reshuffled on every pack version so "mutant 3 dies to the
boundary test" cannot circulate as an answer key.

> Escrow ships without a pack for now, so it is scored on half 1 only —
> 100 points instead of 160. The grader already looks for `.mutants/` and will
> score it the day a pack is dropped in; nothing else has to change.

---

## What the server checks before it believes a word of it

A learner submits `{ challengeId, repoFullName, commitSha }` while signed in
with their wallet. `POST /api/submissions` runs seven checks, in order, and
every rejection is recorded with a reason so the portfolio can show what
happened.

| # | Check | The attack it closes |
|---|---|---|
| 1 | The repo is a fork of our upstream (compared case-insensitively) | Submitting an unrelated repo that happens to contain a green run |
| 2 | The repo is public, and the short SHA resolves to a real commit | Grading something nobody can inspect |
| 3 | The `wallet-pubkey` file **at that commit** names the signed-in wallet, and that fork has not already been claimed by a different wallet | Submitting somebody else's passing fork; one fork farming points for many wallets |
| 4 | Every sealed file's git blob SHA matches the upstream, and every other file in the tree matches an `editable` glob | Editing the grader, the workflow, or the canonical tests; sneaking in a `build.rs` or a `.cargo/config.toml` that changes what `anchor build` produces |
| 5 | There is a **successful** run of *our* workflow at exactly that commit | Passing a SHA from a branch that never ran, or one whose run failed |
| 6 | The run executed on a GitHub-hosted runner | Registering a self-hosted runner that answers "yes" to everything |
| 7 | The `solana-summer-result` artifact parses, and its score is what gets awarded | Hand-writing a `result.json` — it has to be the one the job uploaded |

Check 4 is the load-bearing one, and it is an **allow-list, not a deny-list**.
Anything in the fork that is neither sealed nor explicitly permitted is a
rejection. A deny-list loses to the first file nobody thought of.

Git blob SHAs are content-addressed, so a fork of an identical file has an
identical hash. That is what makes "compare against the upstream" a single
cheap tree read rather than a diff.

If a challenge has no manifest, the endpoint answers **503**, not "pass".
Failing closed is the only correct default when the thing that decides a grade
is unpinned.

---

## Points

Awards go through an append-only ledger as deltas, and the delta is
`new_total - already_awarded_for_this_challenge`. So a resubmission that scores
higher tops up; one that scores lower does not claw back or double-pay; and a
regrade shows up in the history as a correction rather than a number that
quietly changed.

---

## What is still trusted, honestly

- **GitHub.** If a learner can forge a run's conclusion, a runner label, or an
  artifact through the API, they win. That is the same trust boundary as every
  status badge on every README on the internet.
- **The mutant binaries.** They are stripped, not encrypted. Someone determined
  enough can disassemble one and work out the bug. They would learn one bug —
  and they would have to write a test that catches it, which is the assignment.
- **The learner's own repo is public.** Their solution is visible to anyone
  who looks, which is true of every public fork of every public course repo.

None of those let anyone run code on our servers, which was the requirement.

---

## The one-paragraph version, for a student

> Push to your fork. GitHub Actions builds your program and runs two suites:
> ours against your code, and yours against a set of deliberately broken builds
> of the same program. It writes the score to `result.json` and uploads it.
> When you submit the commit on the site, we read that file straight from
> GitHub, confirm the grader and the tests were untouched, confirm the run was
> real and hosted, confirm the fork is yours via the `wallet-pubkey` file, and
> award what the run said. Your code runs on your machine and in your runner.
> It never runs on ours.
