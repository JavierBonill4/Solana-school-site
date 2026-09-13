# Deploying Solana Summer

Assignment 01 grades end to end. This gets it somewhere learners can reach.

## 0. Put it in git first

The project is not a repository yet, which means none of this work has
history and `.gitignore` is currently decorative.

```bash
git init
git add -A
git status --short | grep -E '\.env' && echo "STOP — a secret is staged" || echo "no env files staged"
```

That grep is the point of the step. `.gitignore` already lists `.env`,
`.env.local` and `.env*.local`, but a file created **before** `git init` is
still ignored correctly — what is not covered is a stray copy like
`.env.backup`, which matches none of those patterns. Check before the first
commit, not after; a secret in history stays in history.

```bash
git commit -m "Solana Summer platform"
gh repo create JavierBonill4/solana-summer --private --source=. --push
```

Private, because `solutions/` is not gitignored and contains the reference
answer.

## 1. Database

Any Postgres works — Neon, Supabase, Vercel Postgres, Railway. Create one and
take the **pooled** connection string; the direct one runs out of connections
on serverless.

```bash
echo 'DATABASE_URL=postgres://…' >> .env.local
npm run db:push
```

Or paste `drizzle/0000_init.sql` into the provider's SQL console. Both are
idempotent.

Local development now needs a database too. A free Neon branch is the least
friction — you can point dev and production at separate branches of the same
project.

## 2. A bot account for the GitHub token

Do this before the token reaches a hosting provider.

Create a GitHub account that owns no repositories and belongs to no
organizations — `solana-summer-bot` or similar. Issue a **classic** token on
it with the full `repo` scope.

That scope is not optional: artifact downloads are gated behind
`actions:read`, which classic tokens only get from `repo`, and fine-grained
tokens can only be granted repositories the token owner owns — learner forks
are owned by learners. So the token is broad by necessity. The answer is to
put it on an account where broad means nothing.

Then rotate the personal token you have been using.

## 3. Environment variables

Set these in your host, not in a file:

| Variable | Value |
|---|---|
| `DATABASE_URL` | pooled Postgres connection string |
| `SESSION_SECRET` | fresh 32 random bytes, different from dev |
| `NEXT_PUBLIC_SITE_ORIGIN` | `https://your-domain` — must match the browser bar exactly |
| `ADMIN_PUBKEYS` | your wallet, comma separated for more |
| `GITHUB_TOKEN` | the bot account's classic `repo` token |

`NEXT_PUBLIC_SITE_ORIGIN` is the one that bites. The wallet signs your domain
and the server checks it, so a mismatch rejects every sign-in with "that
signature was issued for a different site". On Vercel, `VERCEL_URL` and
`VERCEL_PROJECT_PRODUCTION_URL` are read automatically as well, so preview
deployments work without extra configuration.

## 4. Deploy

Vercel: import the repo, add the variables above, deploy. No build
configuration needed.

## 5. Check it in this order

1. **Load the site.** An empty leaderboard is correct, not a bug.
2. **Connect a wallet and sign.** If it fails, `NEXT_PUBLIC_SITE_ORIGIN` does
   not match the browser bar. The server logs the domain it rejected and the
   ones it would accept.
3. **Confirm the Admin link appears.** If not, `ADMIN_PUBKEYS` does not match
   your address — it is case-sensitive base58. `GET /api/me` returns
   `isAdmin`.
4. **Submit a known-good commit.** You have one: the vault commit that scored
   160. It should come straight back as already graded.
5. **Claim a side quest, approve it in `/admin`.** Proves writes work.

## Known limits you are shipping with

- **Polling, not webhooks.** The submit form watches a running grader while
  the tab is open. Close it and the run still finishes, but the page stops
  updating. A `workflow_run` webhook fixes this properly and is much easier
  now that you have a public URL.
- **One challenge is graded.** Escrow and Token-2022 have no manifest, so
  `/api/submissions` refuses them with a 503. That is deliberate — it fails
  closed rather than awarding points for something unverified.
- **Solutions live in the repo.** Keep it private, or move `solutions/` to a
  separate private repo read with a server-side token.
