# Reference solutions

Put one file per challenge here, named for the challenge id:

```
solutions/vault-limit.md
solutions/escrow-timelock.md
solutions/token22-identity.md
```

`GET /api/solutions/[id]` serves these to wallets listed in `ADMIN_PUBKEYS`
and returns 404 to everyone else.

**This directory is not gitignored.** If the repo is public, so is anything you
put here. Keep the repo private, or move the content to a private repo that the
route reads with a server-side token.
