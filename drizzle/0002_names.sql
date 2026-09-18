-- Four names per person, and a choice of which one is public.
--
-- `display_name` is kept and becomes a derived projection: setProfileNames
-- rewrites it on every save. Nothing is backfilled, because nothing needs to
-- be — an account that only ever had a display_name keeps it, and
-- resolveDisplayName() falls back to it until its owner fills in the new
-- fields.
--
-- `npm run db:push` produces the same columns; this file is here so the
-- change is reviewable and replayable.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "preferred_name" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "discord_name" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "luma_name" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "meet_name" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "display_name_source" text NOT NULL DEFAULT 'preferred';
