#!/usr/bin/env python3
"""
Solana Summer grader — Assignment 01, Vault.

SEALED. Its blob SHA is pinned; editing it fails the submission.

Two halves, run in one job:

  1. Our tests against your program.
     `cargo test --test canonical` — the canonical suite, which does not use
     tests/common/mod.rs, because you edit that file.

  2. Your tests against our programs.
     Your suite runs first against reference.so (the correct implementation)
     and must pass. Then against each mutant .so, where it must FAIL to count
     as a kill.

The .so swap is the whole trick: tests/common/mod.rs does

    include_bytes!("../../../../target/deploy/lamports_vault.so")

so dropping a different binary at that path and re-running `cargo test`
points your unmodified tests at a different program. Cargo tracks
include_bytes! inputs, so it rebuilds the test binaries automatically.

A kill requires BOTH:
  - your tests pass on reference.so, and
  - your tests fail on the mutant

which is why `assert!(false)` scores zero: it fails the reference check, so
nothing is killed.
"""

import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PROGRAM_SO = ROOT / "target" / "deploy" / "lamports_vault.so"
MUTANT_DIR = ROOT / ".mutants"
RESULT = ROOT / "result.json"

CHALLENGE_ID = "vault-limit"
CANONICAL_TEST = "canonical"
TESTS_DIR = ROOT / "programs" / "lamports-vault" / "tests"


def learner_tests() -> list[str]:
    """
    Every integration test target except ours.

    Discovered, not hardcoded. Cargo treats each top-level `tests/*.rs` as its
    own target, so this picks up a file a learner adds without being told to.
    A hardcoded list silently ignores new files: they compile and pass under a
    plain `cargo test` locally, kill nothing here, and nothing anywhere says
    why. `tests/common/mod.rs` is a module rather than a target, so it is not
    matched by the glob.
    """
    return sorted(
        f.stem for f in TESTS_DIR.glob("*.rs") if f.stem != CANONICAL_TEST
    )

SUMMARY = re.compile(
    r"test result:\s+(ok|FAILED)\.\s+(\d+)\s+passed;\s+(\d+)\s+failed"
)

notes: list[str] = []


def run_tests(targets: list[str], timeout: int = 900):
    """Returns (ok, passed, failed, compiled, output)."""
    cmd = ["cargo", "test", "--quiet"]
    for t in targets:
        cmd += ["--test", t]
    cmd += ["--", "--test-threads=1"]

    try:
        proc = subprocess.run(
            cmd, cwd=ROOT, capture_output=True, text=True, timeout=timeout
        )
    except subprocess.TimeoutExpired:
        return False, 0, 0, True, "timed out"

    out = proc.stdout + proc.stderr

    # A compile failure is not a test failure, and the difference matters when
    # we report back to the learner.
    compiled = "error[E" not in out and "could not compile" not in out

    passed = failed = 0
    for m in SUMMARY.finditer(out):
        passed += int(m.group(2))
        failed += int(m.group(3))

    return proc.returncode == 0, passed, failed, compiled, out


def swap_program(path: Path) -> None:
    shutil.copyfile(path, PROGRAM_SO)


def main() -> int:
    if not PROGRAM_SO.exists():
        emit_failure("anchor build did not produce target/deploy/lamports_vault.so")
        return 1

    learner = learner_tests()
    if not learner:
        notes.append("No test files found in programs/lamports-vault/tests/.")

    learner_so = PROGRAM_SO.with_suffix(".so.learner")
    shutil.copyfile(PROGRAM_SO, learner_so)

    # ── half 1: canonical suite against the learner's program ────────────
    ok, c_passed, c_failed, compiled, out = run_tests([CANONICAL_TEST])

    if not compiled:
        notes.append(
            "The canonical suite could not compile against your program. The "
            "usual cause is that `initialize` does not take a `max_withdraw: "
            "u64` argument yet, or `max_withdraw` is missing from VaultState. "
            "Checkpoints 2 and 3."
        )
        for line in out.splitlines():
            if line.startswith("error[") or line.startswith("error:"):
                notes.append(line.strip()[:200])
                break

    canonical = {"passed": c_passed, "total": c_passed + c_failed}

    # ── half 2: the learner's tests against our programs ─────────────────
    reference = MUTANT_DIR / "reference.so"
    mutants = sorted(p for p in MUTANT_DIR.glob("m*.so"))

    reference_pass = False
    killed: list[str] = []

    if not reference.exists():
        notes.append("Mutant pack is missing reference.so — mutation was skipped.")
    else:
        swap_program(reference)
        reference_pass, r_passed, r_failed, r_compiled, _ = run_tests(learner)

        if not r_compiled:
            notes.append(
                "Your tests do not compile. Check the call sites you updated "
                "in Checkpoint 6."
            )
        elif not reference_pass:
            notes.append(
                f"Your tests fail against the correct implementation "
                f"({r_failed} failing). Mutation scores zero until they pass — "
                f"a test that fails on correct code cannot prove anything "
                f"about broken code."
            )

        if reference_pass:
            for mutant in mutants:
                swap_program(mutant)
                m_ok, _, _, m_compiled, _ = run_tests(learner)
                if not m_compiled:
                    notes.append(f"{mutant.stem}: skipped, did not compile.")
                    continue
                if not m_ok:
                    killed.append(mutant.stem)

    shutil.copyfile(learner_so, PROGRAM_SO)
    learner_so.unlink(missing_ok=True)

    result = {
        "schema": 1,
        "challenge": CHALLENGE_ID,
        "commit_sha": os.environ.get("GITHUB_SHA", ""),
        "repo": os.environ.get("GITHUB_REPOSITORY", ""),
        "run_id": os.environ.get("GITHUB_RUN_ID", ""),
        "canonical": canonical,
        "reference_check": {"tests_pass_on_correct_program": reference_pass},
        "mutation": {
            "killed": len(killed),
            "total": len(mutants),
            "killed_ids": killed,
        },
        "notes": notes,
    }

    RESULT.write_text(json.dumps(result, indent=2))
    print(json.dumps(result, indent=2))

    # Exit non-zero only when the canonical suite fails, so a low mutation
    # score still produces a green run the site can read and score.
    return 0 if canonical["total"] > 0 and c_failed == 0 else 1


def emit_failure(reason: str) -> None:
    notes.append(reason)
    RESULT.write_text(
        json.dumps(
            {
                "schema": 1,
                "challenge": CHALLENGE_ID,
                "commit_sha": os.environ.get("GITHUB_SHA", ""),
                "canonical": {"passed": 0, "total": 0},
                "reference_check": {"tests_pass_on_correct_program": False},
                "mutation": {"killed": 0, "total": 0, "killed_ids": []},
                "notes": notes,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    sys.exit(main())
