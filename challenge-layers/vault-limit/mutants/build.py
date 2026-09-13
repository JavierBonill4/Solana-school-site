#!/usr/bin/env python3
"""
Build the vault mutant pack.

RUN THIS IN A PRIVATE REPO. The output pack contains only stripped .so
binaries; the source of each bug never ships.

    python3 mutants/build.py --repo ../solana-fall-vault-reference --out dist/

`--repo` must point at a checkout with the REFERENCE SOLUTION applied — the
correct implementation. Each mutant is that solution with one bug introduced,
compiled, and stripped.

Produces:
    dist/vault-v1/reference.so     the correct build, for the reference check
    dist/vault-v1/m<id>.so         one per mutant (currently one), id shuffled
    dist/vault-v1.tar.gz           the pack the workflow downloads
    dist/vault-v1.sha256           paste into verify.yml
    dist/kill-matrix.json          PRIVATE. id -> which bug. Never publish.

Ids are reshuffled on every pack version so "mutant 3 dies to the boundary
test" cannot circulate as an answer key.

One mutant is active by default — the off-by-one. See the note under MUTANTS
for why, and for the eight others kept ready to switch on.
"""

import argparse
import hashlib
import json
import random
import shutil
import string
import subprocess
import sys
import tarfile
from pathlib import Path

WITHDRAW = "programs/lamports-vault/src/instructions/withdraw.rs"
INITIALIZE = "programs/lamports-vault/src/instructions/initialize.rs"
DEPOSIT = "programs/lamports-vault/src/instructions/deposit.rs"
STATE = "programs/lamports-vault/src/state/vault_state.rs"

CHECK = """    require!(
        amount <= ctx.accounts.vault_state.max_withdraw,
        ErrorCode::ExceedsMaxWithdraw
    );
"""


def sub(repo: Path, rel: str, old: str, new: str) -> None:
    p = repo / rel
    s = p.read_text()
    if old not in s:
        raise SystemExit(
            f"mutant patch did not apply: {rel!r} has no occurrence of:\n{old}\n"
            "The reference solution has drifted from what build.py expects."
        )
    p.write_text(s.replace(old, new, 1))


# Each entry: (slug, human description, patch function).
# The description is for YOUR eyes — it goes in the private kill matrix and
# powers the "what class of bug did you miss" feedback.
MUTANTS = [
    (
        "off-by-one-strict",
        "Uses `<` instead of `<=`, so a withdrawal of exactly the cap is refused.",
        lambda r: sub(r, WITHDRAW, "amount <= ctx.accounts", "amount < ctx.accounts"),
    ),
]

# ─────────────────────────────────────────────────────────────────────────
# Why only one.
#
# The off-by-one is the mutant the assignment is actually about. Checkpoint 7
# asks for a boundary pair — at the cap, and one lamport over — and this is
# the only bug those two tests can tell apart. A suite with just "works" and
# "obviously too much" passes against both a correct implementation and this
# one, and the whole point of the checkpoint is to catch that.
#
# It is also cheap: one `anchor build` instead of ten, and about two minutes
# of CI per submission instead of fifteen. Every mutant forces a rebuild of
# the test binaries, because swapping the .so invalidates `include_bytes!`,
# and learners pay that cost on every push.
#
# The eight below are written and working — move any of them back into
# MUTANTS when you want a harder bar. The machinery is already N-mutant, so
# growing the pack is a rebuild and a re-pin, not a rewrite.
#
#     ("no-check",
#      "The cap is stored but never enforced. Any amount goes through.",
#      lambda r: sub(r, WITHDRAW, CHECK, "")),
#
#     ("inverted",
#      "Comparison flipped: only withdrawals ABOVE the cap are allowed.",
#      lambda r: sub(r, WITHDRAW, "amount <= ctx.accounts", "amount >= ctx.accounts")),
#
#     ("cap-never-stored",
#      "initialize ignores its argument and stores 0.",
#      lambda r: sub(r, INITIALIZE, "max_withdraw,", "max_withdraw: 0,")),
#
#     ("cap-hardcoded",
#      "The cap is a constant 1 SOL rather than the per-vault argument.",
#      lambda r: sub(r, INITIALIZE, "max_withdraw,", "max_withdraw: 1_000_000_000,")),
#
#     ("compares-balance",
#      "Checks the vault balance against the cap instead of the amount.",
#      lambda r: sub(r, WITHDRAW,
#                    "amount <= ctx.accounts.vault_state.max_withdraw",
#                    "ctx.accounts.vault.lamports() <= ctx.accounts.vault_state.max_withdraw")),
#
#     ("u32-truncation",
#      "Truncates both sides to u32, so amounts above 4.29 SOL wrap past.",
#      lambda r: sub(r, WITHDRAW,
#                    "amount <= ctx.accounts.vault_state.max_withdraw",
#                    "(amount as u32) <= (ctx.accounts.vault_state.max_withdraw as u32)")),
#
#     ("deposit-also-capped",
#      "Applies the withdrawal cap to deposits too, which it should not.",
#      ...)  # see git history for the two-part patch
#
#     ("field-order",
#      "max_withdraw declared before the bumps, shifting every byte offset.",
#      lambda r: sub(r, STATE, "    pub vault_bump: u8,",
#                    "    pub max_withdraw: u64,\n    pub vault_bump: u8,")),
# ─────────────────────────────────────────────────────────────────────────


def build_so(repo: Path) -> bytes:
    subprocess.run(["anchor", "build"], cwd=repo, check=True)
    so = repo / "target" / "deploy" / "lamports_vault.so"
    stripped = repo / "target" / "deploy" / "stripped.so"
    try:
        subprocess.run(
            ["llvm-strip", "--strip-all", "-o", str(stripped), str(so)], check=True
        )
        data = stripped.read_bytes()
    except (FileNotFoundError, subprocess.CalledProcessError):
        print("  llvm-strip unavailable, shipping unstripped", file=sys.stderr)
        data = so.read_bytes()
    return data


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True, type=Path, help="reference solution checkout")
    ap.add_argument("--out", default=Path("dist"), type=Path)
    ap.add_argument("--version", default="vault-v1")
    ap.add_argument("--seed", type=int, default=None, help="shuffle seed (omit for random)")
    args = ap.parse_args()

    rng = random.Random(args.seed)
    pack = args.out / args.version
    pack.mkdir(parents=True, exist_ok=True)

    work = args.out / ".work"

    print("building reference…")
    if work.exists():
        shutil.rmtree(work)
    shutil.copytree(args.repo, work, ignore=shutil.ignore_patterns(".git", "target"))
    (pack / "reference.so").write_bytes(build_so(work))

    matrix = {}
    alphabet = string.ascii_lowercase + string.digits
    used: set[str] = set()

    for slug, description, patch in MUTANTS:
        while True:
            mid = "m" + "".join(rng.choice(alphabet) for _ in range(6))
            if mid not in used:
                used.add(mid)
                break

        print(f"building {slug} -> {mid}…")
        if work.exists():
            shutil.rmtree(work)
        shutil.copytree(args.repo, work, ignore=shutil.ignore_patterns(".git", "target"))
        patch(work)
        (pack / f"{mid}.so").write_bytes(build_so(work))
        matrix[mid] = {"slug": slug, "description": description}

    shutil.rmtree(work, ignore_errors=True)

    tarball = args.out / f"{args.version}.tar.gz"
    with tarfile.open(tarball, "w:gz") as tf:
        for f in sorted(pack.iterdir()):
            tf.add(f, arcname=f.name)

    digest = hashlib.sha256(tarball.read_bytes()).hexdigest()
    (args.out / f"{args.version}.sha256").write_text(digest + "\n")
    (args.out / "kill-matrix.json").write_text(json.dumps(matrix, indent=2))

    print()
    print(f"pack:   {tarball}")
    print(f"sha256: {digest}")
    print()
    print("Paste that sha256 into MUTANT_PACK_SHA256 in .github/workflows/verify.yml,")
    print("upload the tarball as a release asset, and keep kill-matrix.json private.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
