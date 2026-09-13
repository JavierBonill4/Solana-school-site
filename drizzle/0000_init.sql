-- Solana Summer — initial schema.
-- Apply with `npm run db:push`, or paste into your provider's SQL console.

CREATE TABLE IF NOT EXISTS users (
  pubkey       text PRIMARY KEY,
  github_login text UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS submissions (
  id               text PRIMARY KEY,
  user_pubkey      text NOT NULL REFERENCES users(pubkey),
  challenge_id     text NOT NULL,
  repo_full_name   text NOT NULL,
  commit_sha       text NOT NULL,
  run_id           bigint,
  run_url          text,
  status           text NOT NULL DEFAULT 'pending',
  canonical_passed integer,
  canonical_total  integer,
  mutants_killed   integer,
  mutants_total    integer,
  points_awarded   integer NOT NULL DEFAULT 0,
  reason           text,
  result_json      text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
-- Resubmitting the same commit updates the row instead of awarding twice.
CREATE UNIQUE INDEX IF NOT EXISTS submissions_once
  ON submissions (user_pubkey, challenge_id, commit_sha);
CREATE INDEX IF NOT EXISTS submissions_by_user ON submissions (user_pubkey);

CREATE TABLE IF NOT EXISTS side_quest_claims (
  id             text PRIMARY KEY,
  user_pubkey    text NOT NULL REFERENCES users(pubkey),
  quest_id       text NOT NULL,
  state          text NOT NULL DEFAULT 'pending',
  points_awarded integer NOT NULL DEFAULT 0,
  evidence       text,
  claimed_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS claims_once
  ON side_quest_claims (user_pubkey, quest_id);

-- Append-only. Correct a mistake with a negative delta, never an UPDATE.
CREATE TABLE IF NOT EXISTS points_ledger (
  id            text PRIMARY KEY,
  user_pubkey   text NOT NULL REFERENCES users(pubkey),
  delta         integer NOT NULL,
  reason        text NOT NULL,
  challenge_id  text,
  quest_id      text,
  submission_id text,
  badge_mint    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ledger_by_user ON points_ledger (user_pubkey);

CREATE TABLE IF NOT EXISTS auth_nonces (
  nonce      text PRIMARY KEY,
  expires_at timestamptz NOT NULL
);
