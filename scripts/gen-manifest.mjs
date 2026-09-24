#!/usr/bin/env node
/**
 * Generate the integrity manifest for a challenge.
 *
 *   node scripts/gen-manifest.mjs <owner>/<repo> <ref> <challenge-id>
 *
 * Reads the repo tree from GitHub in one call and prints a manifest entry you
 * paste into lib/manifests.ts. Never hand-write these — a wrong SHA rejects
 * every honest submission, and there is no error message that tells you why.
 *
 * Set GITHUB_TOKEN to avoid the 60 req/hour anonymous rate limit.
 *
 * The challenge id is required, not decorative: it picks the profile below,
 * and the profiles differ by program directory. Generating the vault's file
 * list against the escrow repo produces an entry that pins nothing real and
 * rejects everything, with no error to say so.
 */

/**
 * One profile per challenge.
 *
 * `program` is the directory under `programs/`. Every challenge repo in this
 * course has the same shape — one Anchor program, a sealed canonical suite
 * beside the learner's tests — so the file lists are derived from it rather
 * than retyped. `extraLocked` / `extraEditable` are there for the repo that
 * eventually does not fit.
 */
const PROFILES = {
  "vault-limit": { program: "lamports-vault" },
  "escrow-timelock": { program: "escrow" },
  // "token22-identity": { program: "<dir under programs/>" },

  // The transfer hook does not fit the derived shape either, for its own
  // reasons: there is no sealed canonical suite (the grader is gates-only, so
  // nothing is canonical), the learner's tests live beside a `helpers/` module
  // they are expected to extend, and Anchor.toml has to stay editable because
  // the starter ships a declare_id! whose keypair it does not ship — so every
  // learner runs `anchor keys sync`, which rewrites it.
  //
  // Cargo.lock is editable while both Cargo.toml files are locked. A lockfile
  // cannot introduce a dependency that no manifest names, so pinning it buys
  // nothing and costs a rejection every time `anchor build` refreshes it.
  "transfer-hook": {
    program: "solana-fall-transfer-hook",
    // Only the grader is sealed, and that is the honest line for a gates-only
    // challenge: nothing else here decides the grade. There is no canonical
    // suite to protect and no mutant pack to keep a learner away from — the
    // gates measure the learner's own build, their own tests and their own
    // IDL, so sealing their build inputs would buy integrity that is not at
    // risk and cost rejections that are.
    locked: [
      ".github/workflows/verify.yml",
      "grader/grade.py",
      "grader/baseline.json",
      "rust-toolchain.toml",
    ],
    editable: [
      "wallet-pubkey",
      // `programs/*/...`, not `programs/solana-fall-transfer-hook/...`.
      // Challenge 4 has learners run `anchor new token-mover`, so a SECOND
      // program directory appears, and its name is the guide's suggestion
      // rather than a requirement. Matching any directory keeps that from
      // being a rejection — but only its Cargo.toml, src/ and tests/, so a
      // build.rs or a .cargo/config.toml still has nowhere to land.
      "programs/*/Cargo.toml",
      "programs/*/Xargo.toml",
      "programs/*/src/**",
      "programs/*/tests/**",
      // Rewritten by `anchor keys sync`, which every learner runs — the
      // starter declares a program id whose keypair it cannot ship — and
      // again by `anchor new`, which registers the second program.
      "Anchor.toml",
      "Cargo.toml",
      "Cargo.lock",
      "migrations/**",
      "package.json",
      "yarn.lock",
      "tsconfig.json",
      "README.md",
      ".gitignore",
      ".gitattributes",
      ".prettierignore",
    ],
    source: [
      "programs/solana-fall-transfer-hook/src/**",
      "programs/solana-fall-transfer-hook/tests/**",
    ],
  },

  // Pinocchio has no Anchor workspace: one crate at the repo root, source in
  // src/, tests as a unit-test module in src/tests/. So nothing lives under
  // programs/ and the derived profile would pin files that do not exist.
  //
  // Gates only, like the transfer hook, so only the grader is sealed — plus
  // Cargo.toml. Learners have no reason to touch it (the guide pins every
  // crate version), and locking it closes `build = "src/…"`, which would
  // otherwise let a build script ride in through the editable src/ glob.
  //
  // .DS_Store is editable because the upstream ships one at the root, and
  // every macOS learner will commit more. Better an allowed junk file than a
  // rejection nobody can explain.
  "pinocchio-escrow": {
    program: "escrow",
    locked: [
      ".github/workflows/verify.yml",
      "grader/grade.py",
      "grader/baseline.json",
      "Cargo.toml",
    ],
    editable: [
      "wallet-pubkey",
      "src/**",
      // Cargo also discovers integration tests in a top-level tests/. The
      // guide keeps them in src/tests/, but either is fine for the count.
      "tests/**",
      "Cargo.lock",
      "README.md",
      ".gitignore",
      ".gitattributes",
      ".DS_Store",
      "**/.DS_Store",
      // Written by `python3 grader/grade.py` when a learner runs it locally,
      // and swept up by `git add -A`. The site reads the CI artifact, never
      // this file, so a committed copy is noise rather than a threat.
      "result.json",
    ],
    source: ["src/**", "tests/**"],
  },
};

/** Files whose contents decide the grade. Must be byte-identical in a fork. */
function lockedFor({ program, locked, extraLocked = [] }) {
  if (locked) return [...locked, ...extraLocked];
  return [
    ".github/workflows/verify.yml",
    "grader/grade.py",
    `programs/${program}/tests/canonical.rs`,
    "Anchor.toml",
    "Cargo.toml",
    "Cargo.lock",
    `programs/${program}/Cargo.toml`,
    "rust-toolchain.toml",
    ...extraLocked,
  ];
}

/**
 * Paths a learner may change. This is an ALLOW-list: any file in the fork that
 * is neither locked nor matched here is a rejection, which is what stops a new
 * build.rs or .cargo/config.toml from changing what `anchor build` produces.
 *
 * Note `tests/test_*.rs` rather than `tests/**`. The canonical suite is locked
 * either way, but a narrow glob means a learner cannot park a second copy of
 * anything in there and have it treated as ordinary coursework.
 */
function editableFor({ program, editable, extraEditable = [] }) {
  if (editable) return [...editable, ...extraEditable];
  return [
    // Identity, not code. The learner writes their wallet address here and the
    // submissions route reads it to decide whose fork this is, so it MUST be
    // editable — pinning it would make every submission fail.
    "wallet-pubkey",
    `programs/${program}/src/**`,
    `programs/${program}/tests/common/**`,
    `programs/${program}/tests/test_*.rs`,
    "README.md",
    ".gitignore",
    ".gitattributes",
    "package.json",
    "tsconfig.json",
    "yarn.lock",
    "migrations/**",
    ...extraEditable,
  ];
}

/**
 * Where a learner is expected to do the work.
 *
 * The upstream's blob SHAs for these paths become the manifest's `baseline`,
 * which is how the submissions route decides whether a fork contains any work
 * at all. It is not an integrity check — these files are supposed to change.
 */
function sourceGlobsFor({ program, source }) {
  if (source) return source;
  return [`programs/${program}/src/**`, `programs/${program}/tests/**`];
}

const [, , repo, ref = "main", challengeId] = process.argv;

function usage(msg) {
  if (msg) console.error(msg + "\n");
  console.error(
    "usage: node scripts/gen-manifest.mjs <owner>/<repo> <ref> <challenge-id>\n"
  );
  console.error("known challenge ids:");
  for (const [id, p] of Object.entries(PROFILES)) {
    console.error(`  ${id.padEnd(20)} programs/${p.program}`);
  }
  process.exit(1);
}

if (!repo || !repo.includes("/")) usage();
if (!challengeId) {
  usage("Missing challenge id. It selects which file list to pin.");
}

const profile = PROFILES[challengeId];
if (!profile) {
  usage(`No profile for ${JSON.stringify(challengeId)}.`);
}

const LOCKED = lockedFor(profile);
const EDITABLE = editableFor(profile);

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
  console.error(`Not in ${repo}@${ref} yet:`);
  for (const m of missing) console.error(`  ${m}`);
  console.error("\nInstall the grading layer first, then re-run this.");
  process.exit(1);
}

// The learner file that binds a fork to a wallet. It is editable by design, so
// it is not in LOCKED and its absence is not caught above — but a fork that
// never inherits it makes check 3 fail for every honest submission.
if (!blobs.has("wallet-pubkey")) {
  console.error(
    `!! ${repo}@${ref} has no wallet-pubkey file.\n` +
      "   Forks inherit it from the upstream, and /api/submissions rejects any\n" +
      "   submission whose fork does not have one. Add it before going live:\n" +
      "     printf 'REPLACE_ME\\n' > wallet-pubkey\n"
  );
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

// The upstream's own source, for attempt credit. Locked files are left out:
// they can never differ, so listing them here would be noise.
const SOURCE = sourceGlobsFor(profile);
const baseline = {};
for (const [path, sha] of blobs) {
  if (LOCKED.includes(path)) continue;
  if (SOURCE.some((g) => matchesGlob(path, g))) baseline[path] = sha;
}

if (Object.keys(baseline).length === 0) {
  console.error(
    `!! No source files matched ${SOURCE.join(", ")}.\n` +
      "   The manifest will carry no baseline, so this challenge awards no\n" +
      "   attempt credit. Check the program directory in the profile."
  );
}

const entry = { version: 1, locked, editable: EDITABLE, baseline };

console.log(`// ${repo} @ ${ref} — generated ${new Date().toISOString()}`);
console.log(`${JSON.stringify(challengeId)}: ${JSON.stringify(entry, null, 2)},`);
console.error(
  `\n${Object.keys(locked).length} files pinned, ` +
    `${Object.keys(baseline).length} source files baselined for ${challengeId}.`
);

if (uncovered.length) {
  console.error(
    `\n!! ${uncovered.length} file(s) in the upstream are neither locked nor editable.`
  );
  console.error("   Every submission will be rejected as an unexpected file:");
  for (const u of uncovered) console.error(`     ${u}`);
  console.error(
    "   Add each to the profile's extraLocked/extraEditable above, then re-run."
  );
  process.exit(2);
}

console.error("Every file in the upstream is covered.");
