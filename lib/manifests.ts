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
  /**
   * The upstream's own blob SHA for every file a learner is expected to WORK
   * in — program source and tests. Not an integrity check: these files are
   * meant to change. It is how the route answers "has this person actually
   * done anything", which is what attempt credit is paid for.
   *
   * Optional. A manifest generated before this existed simply awards no
   * attempt credit, rather than awarding it to everyone or erroring.
   */
  baseline?: Record<string, string>;
}

export const MANIFESTS: Record<string, Manifest> = {
    // JavierBonill4/solana-summer-vault @ main — generated 2026-09-17T21:10:57.104Z
    "vault-limit": {
      "version": 1,
      "locked": {
        ".github/workflows/verify.yml": "b7709a5a9f48858e67ff2b419ead975261752d4c",
        "grader/grade.py": "303497fa423405f15345b54bbff7a71834161c7c",
        "programs/lamports-vault/tests/canonical.rs": "203706e9128c47b2c1d106a93e167b59488e9695",
        "Anchor.toml": "1d2c558eae3966f1bca48608c34104b3dfe0433c",
        "Cargo.toml": "f397704811733aec712c2e03e7a6f671c81c2f6b",
        "Cargo.lock": "9514ef59e03ded1662c448c01170e55aaa28ca57",
        "programs/lamports-vault/Cargo.toml": "438b54b575136e168ee0b708e85c3d40f57d642d",
        "rust-toolchain.toml": "eb3ee94ff3678bbaaa956fe84327886a3e2a3588"
      },
      "editable": [
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
        "migrations/**"
      ],
      "baseline": {
        "programs/lamports-vault/src/constants.rs": "ba930a8fe68dec39e390f5b2ef42ab7ac180f4c1",
        "programs/lamports-vault/src/error.rs": "c37199a447fc3a94614d758409761a4de436f70d",
        "programs/lamports-vault/src/instructions.rs": "dde30ac8bf2b53666d111ea13169f0cafee01852",
        "programs/lamports-vault/src/instructions/close.rs": "ad9d6cd147d1ddc1b0f42692bf2f2ed9c3f5a165",
        "programs/lamports-vault/src/instructions/deposit.rs": "2592950a4dd719be824973104abc1499553e9dca",
        "programs/lamports-vault/src/instructions/initialize.rs": "711a8b71513ea44af57e8833d7c5616a72cd855c",
        "programs/lamports-vault/src/instructions/withdraw.rs": "e792c0f93fd0cb485021e0c8d2b1c748ffe72b24",
        "programs/lamports-vault/src/lib.rs": "71f6c2294395a7a85ae5c7e2a22ea74f7d3e6732",
        "programs/lamports-vault/src/state.rs": "57b6d4beb1c7702d0ff86cc4adf73fb9a0da3b21",
        "programs/lamports-vault/src/state/vault_state.rs": "88c5aefbb19812317984d3fb37bd04e7584e6091",
        "programs/lamports-vault/tests/common/mod.rs": "81fb5816b238dfdca21d886467f3cbd0854a97c8",
        "programs/lamports-vault/tests/test_deposit.rs": "a4d3d6e2ecc528f8f303bd9e5aef2faf02ffcb45",
        "programs/lamports-vault/tests/test_initialize.rs": "4738a030b8dae66cd32cff0cc9ff544ec45e42f2",
        "programs/lamports-vault/tests/test_withdraw.rs": "38d05ca5c71b283af463ad7343c2a97b4e64eac7"
      }
    },

  // JavierBonill4/solana-summer-escrow @ main — generated 2026-09-17T21:14:13.772Z
    "escrow-timelock": {
      "version": 1,
      "locked": {
        ".github/workflows/verify.yml": "f61bfe1b6bee67363559ad3f9a26b1514f8e6a78",
        "grader/grade.py": "3f11f59a4e199bc187f7a5d35db551a4b8d04704",
        "programs/escrow/tests/canonical.rs": "bdf3a6f2c79151c33d6763cc526cc5b408d1527b",
        "Anchor.toml": "bf37cefb0ff8c1c8b3e914d7430efd10576d77f7",
        "Cargo.toml": "f397704811733aec712c2e03e7a6f671c81c2f6b",
        "Cargo.lock": "0979ce7d5bc6923825c41c7c828f05a27cdc4bc5",
        "programs/escrow/Cargo.toml": "dc60bcdb9c15914cb331cfabb07726a1c5e897e6",
        "rust-toolchain.toml": "cb684c012375408adedaca62213299cfe861f723"
      },
      "editable": [
        "wallet-pubkey",
        "programs/escrow/src/**",
        "programs/escrow/tests/common/**",
        "programs/escrow/tests/test_*.rs",
        "README.md",
        ".gitignore",
        ".gitattributes",
        "package.json",
        "tsconfig.json",
        "yarn.lock",
        "migrations/**"
      ],
      "baseline": {
        "programs/escrow/src/constants.rs": "fae453594c03a00c9ad2b310edc7fc3fd5b7b06c",
        "programs/escrow/src/error.rs": "c37199a447fc3a94614d758409761a4de436f70d",
        "programs/escrow/src/instructions.rs": "8eed9f425785b45de56ba738553407d6b8cfff47",
        "programs/escrow/src/instructions/cancel.rs": "bf30652189cbf0536ccd59475321df531fedf782",
        "programs/escrow/src/instructions/make.rs": "e5a1cf98edb7590fab25852266403b6a3e2e1a06",
        "programs/escrow/src/instructions/take.rs": "972465e5e53b88ea70635da8ef43ce4c8a8b25d8",
        "programs/escrow/src/lib.rs": "a154963f1ca4d76598032f04d753a6d142920e9a",
        "programs/escrow/src/state.rs": "8078a315f53f5d9d32d96a42d9960ef106fd1c9b",
        "programs/escrow/src/state/escrow.rs": "46cea782d7fb892683873a072e9c4a52dacb95e7",
        "programs/escrow/tests/test_cancel.rs": "3ef4125e4cbd0b52e4e0bfa3eb6559192cf96884",
        "programs/escrow/tests/test_make.rs": "4f0f675806cc146870a1ee9c9ac3eeaea47bcce1"
      }
    },
  // "token22-identity": add when doing grading level
  // JavierBonill4/anchor-fundraiser @ main — generated 2026-09-19T15:39:13.895Z
    "fundraiser-feature": {
      "version": 1,
      "locked": {
        ".github/workflows/verify.yml": "e90982dabd852b9221177f1579d98a7a8abe8b88",
        "grader/grade.py": "ed95c6ddb7e5c526c103c8e9712a2621c864ebfe",
        "grader/baseline.json": "6f5aa12a958e3007989ed3a4b96d6890f78ebfab"
      },
      "editable": [
        "wallet-pubkey",
        "programs/fundraiser/**",
        "tests/**",
        "migrations/**",
        "Anchor.toml",
        "Cargo.toml",
        "Cargo.lock",
        "package.json",
        "yarn.lock",
        "tsconfig.json",
        "readme.MD",
        "README.md",
        ".gitignore",
        ".gitattributes",
        ".prettierignore"
      ],
      "baseline": {
        "programs/fundraiser/src/constants.rs": "01e8e1b998c69c894ea83725d4c5bb01afae2595",
        "programs/fundraiser/src/error.rs": "0c7ee948bb0881a84521d3c8eebc9ececeb91b7f",
        "programs/fundraiser/src/instructions/checker.rs": "e852c342860c46cf9d40b5ef882245709bf66b8e",
        "programs/fundraiser/src/instructions/contribute.rs": "75dc18f95a55f07d8004db3ce920ad4f6d3410b5",
        "programs/fundraiser/src/instructions/initialize.rs": "4d108dcbf1386fd5dbeeda82f3605b450da85643",
        "programs/fundraiser/src/instructions/mod.rs": "40bece332b8300e66fe7cd9f751ff849e017d00c",
        "programs/fundraiser/src/instructions/refund.rs": "70c109d4e7e1222d1120e9f17abf9eb66d51f3ea",
        "programs/fundraiser/src/lib.rs": "654378570f36cb208799291fe8f16251d3b34eba",
        "programs/fundraiser/src/state/contributor.rs": "31f7d3a767ba21b798bffe5d23b0643b297271dc",
        "programs/fundraiser/src/state/fundraiser.rs": "b43affaff1c8f86ceb267602d18fb818044f814e",
        "programs/fundraiser/src/state/mod.rs": "3e6b07fdba7a3bad05c36247dbf0c00f2ab3ce07",
        "tests/fundraiser.ts": "193c79326420474998cbf0ff3be6672c19b8f812",
        "tests/time-window-bankrun.ts": "a616baa2adc43934dc61bd4e85a0bf3d2ba10dfe",
        "tests/time-window.ts": "bb6331c245396dd1346e8f0b0a26ab384354639b"
      }
    },
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

/**
 * Has this fork's source diverged from the upstream it was forked from?
 *
 * True when any file under the baseline's own directories either has a
 * different blob SHA than the upstream's, or is new. Deletions do not count —
 * removing the starter code is not work.
 *
 * Returns null when the manifest carries no baseline, which is a different
 * answer from false: "we cannot tell" must not be reported to a learner as
 * "you have not started".
 */
export function sourceChanged(
  blobs: { path: string; sha: string }[],
  manifest: Manifest
): boolean | null {
  const baseline = manifest.baseline;
  if (!baseline || Object.keys(baseline).length === 0) return null;

  // Only judge files in the directories the baseline actually covers, so a
  // baseline that lists programs/x/src/** is not confused by a README edit.
  const roots = [
    ...new Set(
      Object.keys(baseline).map((p) => p.slice(0, p.lastIndexOf("/") + 1))
    ),
  ];

  for (const b of blobs) {
    if (!roots.some((r) => b.path.startsWith(r))) continue;
    const upstream = baseline[b.path];
    if (upstream === undefined) return true; // a file they added
    if (upstream !== b.sha) return true; // a file they changed
  }
  return false;
}
