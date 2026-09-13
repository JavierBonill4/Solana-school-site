#!/usr/bin/env node
/**
 * Generate the integrity manifest for a challenge.
 *
 *   node scripts/gen-manifest.mjs <owner>/<repo> [ref] [challenge-id]
 *
 * Reads the repo tree from GitHub in one call and prints a manifest entry you
 * paste into lib/manifests.ts. Never hand-write these — a wrong SHA rejects
 * every honest submission, and there is no error message that tells you why.
 *
 * Set GITHUB_TOKEN to avoid the 60 req/hour anonymous rate limit.
 */

// Files whose contents decide the grade. Anything here must be byte-identical
// in a learner's fork.
const LOCKED = [
  ".github/workflows/verify.yml",
  "grader/grade.py",
  "programs/lamports-vault/tests/canonical.rs",
  "Anchor.toml",
  "Cargo.toml",
  "Cargo.lock",
  "programs/lamports-vault/Cargo.toml",
  "rust-toolchain.toml",
];

// Paths a learner is allowed to change. This is an ALLOW-list: any file in the
// fork that is neither locked nor matched here is a rejection, which is what
// stops a new build.rs or .cargo/config.toml from changing the build.
const EDITABLE = [
  // Identity, not code. The learner writes their wallet address here and the
  // submissions route reads it to decide whose fork this is, so it MUST be
  // editable — pinning it would make every submission fail.
  "wallet-pubkey",
  "programs/lamports-vault/src/**",
  "programs/lamports-vault/tests/common/**",
  "programs/lamports-vault/tests/test_*.rs",
  "README.md",
  ".gitignore",
  ".gitattributes",
  "package.json",
  "tsconfig.json",
  "yarn.lock",
  "migrations/**",
];

const [, , repo, ref = "main", challengeId = "CHALLENGE_ID"] = process.argv;

if (!repo || !repo.includes("/")) {
  console.error(
    "usage: node scripts/gen-manifest.mjs <owner>/<repo> [ref] [challenge-id]"
  );
  process.exit(1);
}

const headers = {
  accept: "application/vnd.github+json",
  "x-github-api-version": "2022-11-28",
};
if (process.env.GITHUB_TOKEN) {
  headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
}

const res = await fetch(
  `https://api.github.com/repos/${repo}/git/trees/${ref}?recursive=1`,
  { headers }
);

if (!res.ok) {
  console.error(`GitHub said ${res.status}: ${await res.text()}`);
  process.exit(1);
}

const { tree, truncated } = await res.json();

if (truncated) {
  console.error("That tree is too large to read in one call.");
  process.exit(1);
}

const blobs = new Map(
  tree.filter((e) => e.type === "blob").map((e) => [e.path, e.sha])
);

const locked = {};
const missing = [];

for (const path of LOCKED) {
  const sha = blobs.get(path);
  if (!sha) missing.push(path);
  else locked[path] = sha;
}

if (missing.length) {
  console.error("Not in the upstream repo yet:");
  for (const m of missing) console.error(`  ${m}`);
  console.error("\nInstall the grading layer first, then re-run this.");
  process.exit(1);
}

// Same allow-list the submissions route applies, run here so drift between
// this script and lib/manifests.ts shows up now rather than as a mystery
// rejection later. Keep this in sync with matchesGlob() in lib/manifests.ts.
function matchesGlob(pathname, glob) {
  const DOUBLE = "\x00";
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, DOUBLE)
    .replace(/\*/g, "[^/]*")
    .split(DOUBLE)
    .join(".*");
  return new RegExp(`^${escaped}$`).test(pathname);
}

const uncovered = [...blobs.keys()].filter(
  (p) => !LOCKED.includes(p) && !EDITABLE.some((g) => matchesGlob(p, g))
);

const entry = { version: 1, locked, editable: EDITABLE };

console.log(`// ${repo} @ ${ref} — generated ${new Date().toISOString()}`);
console.log(`${JSON.stringify(challengeId)}: ${JSON.stringify(entry, null, 2)},`);
console.error(`\n${Object.keys(locked).length} files pinned.`);

if (uncovered.length) {
  console.error(
    `\n!! ${uncovered.length} file(s) in the upstream are neither locked nor editable.`
  );
  console.error("   Every submission will be rejected as an unexpected file:");
  for (const u of uncovered) console.error(`     ${u}`);
  console.error("   Add each to LOCKED or EDITABLE above, then re-run.");
  process.exit(2);
}

console.error("Every file in the upstream is covered.");
