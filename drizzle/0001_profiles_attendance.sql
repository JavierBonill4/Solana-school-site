-- Display names, attendance rosters, and remembered name matches.

ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name text;

CREATE TABLE IF NOT EXISTS attendance_sessions (
  id              text PRIMARY KEY,
  held_on         text NOT NULL,
  label           text,
  source_filename text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attendance_records (
  id          text PRIMARY KEY,
  session_id  text NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  raw_name    text NOT NULL,
  user_pubkey text REFERENCES users(pubkey)
);
CREATE UNIQUE INDEX IF NOT EXISTS attendance_once
  ON attendance_records (session_id, raw_name);
CREATE INDEX IF NOT EXISTS attendance_by_session ON attendance_records (session_id);
CREATE INDEX IF NOT EXISTS attendance_by_user ON attendance_records (user_pubkey);

CREATE TABLE IF NOT EXISTS name_aliases (
  alias       text PRIMARY KEY,
  user_pubkey text NOT NULL REFERENCES users(pubkey),
  created_at  timestamptz NOT NULL DEFAULT now()
);
