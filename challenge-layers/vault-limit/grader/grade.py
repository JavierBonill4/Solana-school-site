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

On top of those two, four coarser gates are measured and reported, the same
four the fundraiser uses:

    build    the program compiled and produced an IDL
    tests    your own suite is green, with more tests in it than the starter
    surface  the IDL gained an instruction, account or field
    errors   at least one new #[error_code] variant

They are reported, not enforced here: the site decides which of the two
pictures a pass requires, so switching between them is a redeploy rather than
a push to this repository. The exit code is green when EITHER the canonical
suite passes or all four gates are met, so whichever the site is set to can
read the result.
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
IDL = ROOT / "target" / "idl" / "lamports_vault.json"
BASELINE = Path(__file__).resolve().parent / "baseline.json"
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

def norm(name: str) -> str:
    """snake_case, camelCase and PascalCase collapse to the same key."""
    return name.replace("_", "").replace("-", "").lower()


def idl_surface(idl: dict) -> tuple[dict, dict, dict]:
    """
    (instructions, {account: fields}, errors), each a {normalized: as-written}
    map.

    Anchor 1.x puts account FIELDS in `types`, leaving `accounts` as name plus
    discriminator; older layouts inline them. Read both. Values keep the
    original spelling so feedback can name what it found.
    """
    instructions = {norm(i["name"]): i["name"] for i in idl.get("instructions", [])}

    fields: dict[str, dict] = {}
    for entry in idl.get("types", []) + idl.get("accounts", []):
        shape = entry.get("type")
        if not isinstance(shape, dict) or shape.get("kind") != "struct":
            continue
        got = {norm(f["name"]): f["name"] for f in shape.get("fields", []) or []}
        fields.setdefault(norm(entry["name"]), {}).update(got)

    accounts = {
        norm(a["name"]): (a["name"], fields.get(norm(a["name"]), {}))
        for a in idl.get("accounts", [])
    }
    errors = {norm(e["name"]): e["name"] for e in idl.get("errors", [])}
    return instructions, accounts, errors


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

    # ── gate: your tests, on YOUR program ────────────────────────────────
    #
    # Distinct from the mutation half below, which runs the same tests against
    # OUR builds. This one asks the plainer question: is your own suite green,
    # and did you add tests to it?
    own_ok, own_passed, own_failed, own_compiled, own_out = (
        run_tests(learner) if learner else (False, 0, 0, True, "")
    )
    if learner and not own_compiled:
        notes.append("Your own tests do not compile against your program.")
        for line in own_out.splitlines():
            if line.startswith("error[") or line.startswith("error:"):
                notes.append(line.strip()[:200])
                break

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

    # ── the four gates ───────────────────────────────────────────────────
    base = json.loads(BASELINE.read_text())
    wanted_tests = base["test_count"] + base["new_tests_required"]

    gates = {"build": False, "tests": False, "surface": False, "errors": False}
    new_surface: list[str] = []
    new_errors: list[str] = []

    gates["build"] = IDL.exists()
    if not gates["build"]:
        notes.append(
            "anchor build produced no IDL at target/idl/lamports_vault.json, "
            "so the surface could not be checked."
        )
    else:
        idl = json.loads(IDL.read_text())
        instructions, accounts, errors = idl_surface(idl)

        base_ix = {norm(n) for n in base["instructions"]}
        base_accounts = {
            norm(k): {norm(f) for f in v} for k, v in base["accounts"].items()
        }
        base_errors = {norm(n) for n in base["errors"]}

        new_surface = sorted(
            [v for k, v in instructions.items() if k not in base_ix]
            + [label for k, (label, _) in accounts.items() if k not in base_accounts]
            + [
                f"{label}.{written}"
                for k, (label, fs) in accounts.items()
                if k in base_accounts
                for fk, written in fs.items()
                if fk not in base_accounts[k]
            ]
        )
        new_errors = sorted(v for k, v in errors.items() if k not in base_errors)

        gates["surface"] = len(new_surface) > 0
        gates["errors"] = len(new_errors) > 0

        if gates["surface"]:
            notes.append("New on-chain surface — " + ", ".join(new_surface) + ".")
        else:
            notes.append(
                "The IDL is identical to the starter's: no new instruction, "
                "account or field. `max_withdraw` on VaultState is the one "
                "this assignment asks for."
            )
        if gates["errors"]:
            notes.append("New declared error(s): " + ", ".join(new_errors) + ".")
        else:
            notes.append(
                "No new #[error_code] variant. A withdrawal over the cap has "
                "to fail with an error you declared."
            )

    if own_failed > 0:
        notes.append(f"{own_failed} of your own test(s) failing.")
    elif own_passed < wanted_tests:
        notes.append(
            f"{own_passed} of your tests passing. The starter ships "
            f"{base['test_count']} and the assignment asks for "
            f"{base['new_tests_required']} more, so {wanted_tests} is the bar."
        )
    gates["tests"] = own_failed == 0 and own_passed >= wanted_tests

    gates_met = sum(1 for g in gates.values() if g)
    if gates_met < len(gates):
        notes.append(
            "Gates not met: "
            + ", ".join(g for g, v in gates.items() if not v)
            + "."
        )

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
        "gates": {
            **gates,
            "met": gates_met,
            "of": len(gates),
            "passing": own_passed,
            "failing": own_failed,
            "required_passing": wanted_tests,
            "new_surface": new_surface,
            "new_errors": new_errors,
        },
        "notes": notes,
    }

    RESULT.write_text(json.dumps(result, indent=2))
    print(json.dumps(result, indent=2))

    # Green when EITHER the canonical suite passes or all four gates are met.
    #
    # The site, not this file, decides which of the two a pass requires — but
    # it only ever reads SUCCESSFUL runs, so a red run here would hide the
    # result from whichever policy is in force. Being green for both leaves
    # that choice where it belongs.
    canonical_ok = canonical["total"] > 0 and c_failed == 0
    return 0 if canonical_ok or gates_met == len(gates) else 1


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
                "gates": {
                    "build": False,
                    "tests": False,
                    "surface": False,
                    "errors": False,
                    "met": 0,
                    "of": 4,
                },
                "notes": notes,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    sys.exit(main())
