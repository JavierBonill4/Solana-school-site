# Solana Summer

A challenge hub for the Solana Summer tutorials. Wallet auth, a real points
ledger, a portfolio, an admin view, and a submission pipeline that never
executes learner code.

```bash
cp .env.example .env.local
# put your wallet address in ADMIN_PUBKEYS, then:
npm install
npm run dev
```

Data lives in `data/solana-summer.db` (SQLite, created on first use). It starts
empty, and an empty database means an empty leaderboard and an empty portfolio.
Nothing on screen is invented.

## Why you couldn't find the solutions

Three reasons, all fixed now:

1. **There was no page.** Only an API route existed. There is now `/admin`,
   plus `/admin/<challenge-id>` for each solution, and an **Admin** link appears
   in the left rail when your wallet is allowlisted.
2. **There were no solution files.** `solutions/vault-limit.md` now exists — a
   verified reference solution for Assignment 01.
3. **`ADMIN_PUBKEYS` has to be set before the server boots.** Next.js reads
   `.env.local` at startup; editing it while `npm run dev` is running changes
   nothing. Set it, restart, reconnect.

If the Admin link still doesn't appear, check `GET /api/me` — it returns
`isAdmin`. A `false` there means the string in `ADMIN_PUBKEYS` doesn't match
your connected address exactly (it is case-sensitive base58).

Everything admin-gated returns **404, not 403**, to anyone else. That is
deliberate: a 403 confirms the page exists and that there is something behind it
worth having.

## What's here

| Route | What it is |
|---|---|
| `/` | Hero, the three assignments, top of the leaderboard, what to do next |
| `/portfolio` | Green check / red cross / nothing per assignment, and the submit form |
| `/leaderboard` | Live query over the points ledger |
| `/ecosystem` | Courses, hackathons, references — checked Sep 2026 |
| `/admin` | Reference solutions and the side quest review queue |

## Making submissions real

The grading layer for Assignment 01 is in
[`challenge-layers/vault-limit/`](challenge-layers/vault-limit/INSTALL.md).
Read that file — it is the actual next step.

Short version:

1. **Fork the challenge repos into an account you control.** This is required,
   not a preference: you cannot add a workflow to somebody else's repo, you
   cannot merge PRs into it, and if the current owner pushes a commit every
   integrity manifest you generated goes stale at once.
2. Drop `verify.yml`, `grader/grade.py` and `tests/canonical.rs` into your copy.
3. Build the mutant pack from a private repo (`mutants/build.py`).
4. `node scripts/gen-manifest.mjs <you>/solana-fall-vault main` and paste the
   output into `lib/manifests.ts`.
5. Point `repoFullName` in `lib/challenges.ts` at your repo.

Until step 4, `POST /api/submissions` refuses every submission with a 503.
Failing closed is correct when the thing that decides a grade is unpinned.

### The PR is no longer the grading mechanism

Learners push to their fork; Actions runs there; the site reads the run. The
pull request stays in the tutorial as the human review step. This is better than
grading the PR itself: `pull_request` runs from a first-time contributor need a
maintainer to approve the workflow before anything executes, which would put a
manual gate in front of every single submission.

## What works, and what's stubbed

**Works**

- Sign In With Solana — nonce, `ed25519` verify, HttpOnly JWT cookie. The pubkey
  is only ever read from the cookie, never from a request body.
- Real SQLite persistence: users, submissions, claims, append-only points ledger.
- Leaderboard as a live `SUM(delta)` query.
- Side quest claims → pending → admin approve → points on the ledger.
- Admin solutions pages.
- `POST /api/submissions` checks 1, 2, 4, 5 and 6 — fork lineage, visibility,
  every sealed file's blob SHA, a successful run of our workflow at that commit,
  and a GitHub-hosted runner. Rejections are recorded with a reason, so the
  portfolio shows what happened.

**Stubbed, and marked in the code**

- **Check 3, GitHub account linking.** Without it, anyone can submit somebody
  else's passing fork. This is the most important remaining gap.
- **Check 7, result artifact parsing.** The run is verified but the score is not
  read, so a verified submission sits at `pending` and awards nothing. The TODO
  in `app/api/submissions/route.ts` lists the exact API calls.
- **Side quest verification.** `lib/sidequest-verifiers.server.ts` is an empty
  map. Every claim goes to `pending` and awards zero, so an unproven claim
  cannot mint points. Add an entry keyed by quest id and the claim route starts
  calling it.
- **Manifests.** `lib/manifests.ts` is empty until you install the grading layer
  and generate one.

## Where to change things

| You want to | Edit |
|---|---|
| Add or reorder assignments | `lib/challenges.ts` |
| Add a side quest | `lib/sidequests.ts` (public metadata only) |
| Turn on side quest verification | `lib/sidequest-verifiers.server.ts` |
| Update cohort dates and links | `lib/ecosystem.ts` |
| Change scoring | `lib/points.ts` |
| Move to Postgres | `lib/db.ts` + `lib/schema.ts` — nothing else imports the store |
| Colours, type, spacing | `app/globals.css` (tokens at the top) |

## Solutions

`solutions/<challenge-id>.md`, read inside a server component after the admin
check and rendered there, so the markdown never enters a client bundle. Not in
`public/` — anything there is served unauthenticated, forever, to anyone who
guesses the filename.

**`solutions/` is not gitignored.** If this repo is public, so are the
solutions. Keep it private, or move the content to a private repo read with a
server-side token.

## Postgres, when you need it

`lib/db.ts` is the only file that touches the database. Swap
`drizzle-orm/better-sqlite3` for `drizzle-orm/node-postgres`, change
`lib/schema.ts` from `sqlite-core` to `pg-core`, and leave every query alone.
`lib/nonces.ts` is also in-memory and should move at the same time — sign-in
works locally and fails intermittently across multiple processes otherwise,
which is a confusing bug to chase.
