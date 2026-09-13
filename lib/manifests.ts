import "server-only";

/**
 * Integrity manifests: the blob SHA of every file that decides a grade.
 *
 * A challenge with no entry here cannot be graded — /api/submissions answers
 * 503 rather than awarding points. Failing closed is the right default when
 * the thing that decides a grade is unpinned.
 *
 * Generate these, never hand-write them:
 *
 *   node scripts/gen-manifest.mjs <owner>/<repo> main
 *
 * That reads the whole tree in one call and prints an entry to paste below.
 * Re-run it after ANY push to a locked file in the upstream, or every honest
 * submission starts failing with "<file> has been modified" and there is
 * nothing in the message to tell you it was your commit that did it.
 *
 * `editable` is an ALLOW-list, not a deny-list. Any blob in the fork that is
 * neither locked nor matched by an editable glob is a rejection — otherwise a
 * new build.rs or .cargo/config.toml changes what `anchor build` produces
 * without touching a single sealed file.
 */
export interface Manifest {
  version: number;
  locked: Record<string, string>;
  editable: string[];
}

export const MANIFESTS: Record<string, Manifest> = {
    // JavierBonill4/solana-summer-vault @ main
    "vault-limit": {
      version: 1,
      locked: {
        ".github/workflows/verify.yml":
          "b7709a5a9f48858e67ff2b419ead975261752d4c",
        "grader/grade.py": "303497fa423405f15345b54bbff7a71834161c7c",
        "programs/lamports-vault/tests/canonical.rs":
          "203706e9128c47b2c1d106a93e167b59488e9695",
        "Anchor.toml": "1d2c558eae3966f1bca48608c34104b3dfe0433c",
        "Cargo.toml": "f397704811733aec712c2e03e7a6f671c81c2f6b",
        "Cargo.lock": "9514ef59e03ded1662c448c01170e55aaa28ca57",
        "programs/lamports-vault/Cargo.toml":
          "438b54b575136e168ee0b708e85c3d40f57d642d",
        "rust-toolchain.toml": "eb3ee94ff3678bbaaa956fe84327886a3e2a3588",
      },
      editable: [
        "wallet-pubkey",
        "programs/lamports-vault/src/**",
        "programs/lamports-vault/tests/**",
        "README.md",
        ".gitignore",
        ".gitattributes",
        "package.json",
        "tsconfig.json",
        "yarn.lock",
        "migrations/**",
      ],
    },

  // "escrow-timelock":  … add when that repo has a grading layer
  // "token22-identity": … same
};

export function getManifest(challengeId: string): Manifest | null {
  return MANIFESTS[challengeId] ?? null;
}

/**
 * Minimal glob match. Supports `**` (any depth, including `/`) and `*` (any
 * run of characters within one path segment).
 *
 * The `**` placeholder is \x00 rather than a space so a path containing a
 * space cannot be mistaken for a wildcard.
 */
export function matchesGlob(pathname: string, glob: string): boolean {
  const DOUBLE = "\x00";

  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, DOUBLE)
    .replace(/\*/g, "[^/]*")
    .split(DOUBLE)
    .join(".*");

  return new RegExp(`^${escaped}$`).test(pathname);
}