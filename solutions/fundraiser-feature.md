# Review rubric — Assignment 04, Fundraiser

Admin only. There is no reference solution here, because there is no reference
feature. This is what to look for when you read the pull request.

## What the grader already told you

If the submission passed, these four are true and you do not need to re-check
them:

- it builds under Anchor 1.1.2
- the suite is green with at least 14 passing (starter ships 11)
- the IDL gained an instruction, an account, or a field
- at least one new `#[error_code]` variant exists

The run's notes list the new surface by name. Read that first — it tells you
which of the five options they took, and roughly how ambitious it was, before
you open a single file.

`Gates met: 2/4` on the starter itself is expected: it builds and its tests
pass, and it has no feature.

## What the grader cannot tell you

**Are the three tests real?** Checkpoint 6 asks for the happy path, the
boundary, and the abuse case, and says to assert on *their* error code. The
padding failure mode is three happy-path tests with different numbers. Look for:

- a test that asserts the trigger does **not** fire one unit below the boundary
- a `try { … } catch (e)` that checks `e.error.errorCode.number` or the
  equivalent, not just that something threw
- an assertion on on-chain state read back after the transaction, not only on
  the transaction succeeding

The tutorial's own self-check is the one to apply: comment out the feature's
logic and see whether at least one test goes red. If none do, the tests describe
the program rather than constrain it.

**Is the state design sound?** The things that actually go wrong:

- *Unbounded growth.* A `Vec<Pubkey>` of every contributor on the `Fundraiser`
  account grows until `realloc` fails or rent becomes absurd. A per-contributor
  PDA is the answer, and the starter already demonstrates the pattern with
  `Contributor`.
- *Rent nobody pays.* A new account per contribution needs a payer named and a
  close path, or the maker silently funds everyone.
- *The milestone fires twice.* Anything triggered by crossing a threshold needs
  a flag on the state saying it already fired, checked before the effect. Option
  A is the common one here — `current_amount` crossing 25% is re-evaluated on
  every subsequent contribution.
- *Reward minting without a supply cap*, or with the mint authority left on a
  signer instead of a PDA.
- *A lottery seeded by a slot hash the caller can grind.* Not solvable properly
  on-chain; what matters is whether the README admits it.

**Does the README earn its section?** Four headings are asked for. The first
three are usually fine. The fourth — "how you would attack it" — is where the
difference shows. A good answer names a specific, concrete attack on *their*
feature. A weak one says "reentrancy" or "make sure to validate inputs".

## Suggested weighting, if you want one

The grader's 100 covers "shipped and tested". For the human half, the split that
matches what the tutorial actually asks for:

| | |
|---|---|
| Tests genuinely constrain the feature | 40% |
| State design — growth, rent, double-fire | 30% |
| README, especially the attack section | 30% |

## Red flags worth a second look

- New surface exists but nothing reads it — a field written in `initialize` and
  never checked anywhere. The `surface` gate passes; the feature does not exist.
- The new error is declared but never returned by any `require!`.
- Tests added to `tests/fundraiser.ts` rather than a new file, mixed in with
  the starter's, so it is hard to tell which three are theirs. Not wrong, but
  ask them to split it — Checkpoint 6 is easier to grade as its own file.
- `anchor keys sync` committed alongside real work, so the diff is noisy with
  program-id churn. Expected, not a problem; just do not mistake it for content.
