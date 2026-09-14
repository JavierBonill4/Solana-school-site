import type { Config } from "drizzle-kit";

/**
 * `npm run db:push` loads .env.local via node's --env-file-if-exists, because
 * drizzle-kit is a standalone CLI and never sees the env files Next.js reads
 * at runtime. Running `npx drizzle-kit push` directly will NOT pick it up.
 */
const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    "DATABASE_URL is not set.\n\n" +
      "  1. Create a Postgres database (Neon, Supabase, Vercel Postgres, Railway).\n" +
      "  2. Put the POOLED connection string in .env.local:\n" +
      "       DATABASE_URL=postgres://user:pass@host/db?sslmode=require\n" +
      "  3. Re-run `npm run db:push`.\n"
  );
}

export default {
  schema: "./lib/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
} satisfies Config;
