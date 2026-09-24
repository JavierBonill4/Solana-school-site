#!/usr/bin/env python3
"""
Solana School grader — Pinocchio Escrow.

SEALED. Its blob SHA is pinned; editing it fails the submission.

No canonical suite and no mutant pack for this one: four gates, the same four
the other assignments report.

    build    `cargo build-sbf` produced target/deploy/escrow.so
    tests    your own suite is green, with more tests in it than the starter
    surface  the program dispatches instructions the starter did not
    errors   MakeV2 is rejected explicitly, with no `_ =>` arm swallowing it

Two of those are defined differently here, on purpose, because this is native
Rust on Pinocchio and there is no framework around it:

  * There is no IDL. Nothing emits one, so "the IDL grew" cannot be asked.
    What the IDL would have shown is the instruction set, and in a Pinocchio
    program the instruction set IS the dispatch `match` in lib.rs. So the
    surface gate reads that match: Take and Cancel must each have an arm that
    calls a handler, where the starter sends them to `_ => Err(..)`.

  * There is no `#[error_code]`. Pinocchio programs answer with ProgramError,
    and the guide's error requirement is concrete: checkpoint 05 says there
    must be no `_ =>` arm silently swallowing MakeV2 — return an explicit
    error for it. So the errors gate asks exactly that.

Both are read from source, the same way the transfer-hook grader counts
error wiring. That is honest about what it proves: that the dispatch is wired
the way the guide asks. Whether Take and Cancel actually move the right tokens
is what the learner's own tests are for, and they have to be green.
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASELINE = Path(__file__).resolve().parent / "baseline.json"
RESULT = ROOT / "result.json"

CHALLENGE_ID = "pinocchio-escrow"

SUMMARY = re.compile(
    r"test result:\s+(ok|FAILED)\.\s+(\d+)\s+passed;\s+(\d+)\s+failed"
)

notes: list[str] = []


# ── reading Rust source, just enough ─────────────────────────────────────


def strip_rust(text: str) -> str:
    """
    Remove comments and blank out string / char literals, keeping offsets
    roughly meaningful. A `// TODO: Take => ...` comment must not count as a
    dispatch arm, and a `"{"` inside a log! string must not unbalance braces.
    """
    out = []
    i, n = 0, len(text)
    while i < n:
        c = text[i]
        nxt = text[i + 1] if i + 1 < n else ""
        if c == "/" and nxt == "/":
            j = text.find("\n", i)
            i = n if j == -1 else j
            continue
        if c == "/" and nxt == "*":
            depth, i = 1, i + 2
            while i < n and depth:
                if text.startswith("/*", i):
                    depth, i = depth + 1, i + 2
                elif text.startswith("*/", i):
                    depth, i = depth - 1, i + 2
                else:
                    i += 1
            out.append(" ")
            continue
        if c == "b" and nxt == '"':  # byte string
            i += 1
            continue
        if c == '"':
            i += 1
            while i < n and text[i] != '"':
                i += 2 if text[i] == "\\" else 1
            i += 1
            out.append('""')
            continue
        # char literal: 'x' or '\x' — lifetimes ('a) are left alone
        if c == "'" and i + 2 < n and (
            text[i + 2] == "'" or (text[i + 1] == "\\" and "'" in text[i + 3 : i + 6])
        ):
            j = text.find("'", i + 2 if text[i + 1] != "\\" else i + 3)
            i = j + 1
            out.append("' '")
            continue
        out.append(c)
        i += 1
    return "".join(out)


OPEN, CLOSE = "{([", "})]"


def balanced_end(s: str, start: int) -> int:
    """Index just past the bracket group that opens at s[start]."""
    depth = 0
    for i in range(start, len(s)):
        if s[i] in OPEN:
            depth += 1
        elif s[i] in CLOSE:
            depth -= 1
            if depth == 0:
                return i + 1
    return len(s)


def match_blocks(src: str):
    """Yield the body (between the braces) of every `match <expr> { ... }`."""
    for m in re.finditer(r"\bmatch\b", src):
        # The scrutinee may itself contain parens/braces-free calls; the block
        # opens at the first `{` that is not inside parentheses.
        i, depth = m.end(), 0
        while i < len(src):
            if src[i] in "([":
                depth += 1
            elif src[i] in ")]":
                depth -= 1
            elif src[i] == "{" and depth == 0:
                break
            elif src[i] == ";" and depth == 0:
                i = -1
                break
            i += 1
        if i <= 0 or i >= len(src):
            continue
        end = balanced_end(src, i)
        yield src[i + 1 : end - 1]


def arms(block: str):
    """
    Split a match body into (pattern, body) pairs at depth 0.

    A body that opens with `{` runs to its closing brace; anything else runs
    to the next depth-0 comma. That is the Rust grammar for arms, and it is
    what keeps `Take => { a(); b() }` from being cut in half.
    """
    out = []
    i, n = 0, len(block)
    while i < n:
        # find the next depth-0 `=>`
        depth, j = 0, i
        while j < n - 1:
            ch = block[j]
            if ch in OPEN:
                depth += 1
            elif ch in CLOSE:
                depth -= 1
            elif depth == 0 and block.startswith("=>", j):
                break
            j += 1
        else:
            break
        pattern = block[i:j].strip().strip(",").strip()
        k = j + 2
        while k < n and block[k].isspace():
            k += 1
        if k < n and block[k] == "{":
            end = balanced_end(block, k)
            body = block[k:end]
            while end < n and (block[end].isspace() or block[end] == ","):
                end += 1
        else:
            depth, end = 0, k
            while end < n:
                ch = block[end]
                if ch in OPEN:
                    depth += 1
                elif ch in CLOSE:
                    depth -= 1
                elif ch == "," and depth == 0:
                    break
                end += 1
            body = block[k:end]
            end += 1
        out.append((pattern, body.strip()))
        i = end
    return out


REJECTS = re.compile(r"^\{?\s*(return\s+)?Err\s*\(")


def dispatch(src_dir: Path, enum: str, variants: list[str]):
    """
    Find the instruction dispatch and report how each variant is handled.

    Returns (found, {variant: "routed" | "rejected"}, has_wildcard, handlers)
    where handlers maps a routed variant to the call its arm makes, for the
    run's notes. The dispatch is whichever `match` has arms naming the
    instruction enum's variants — wherever the learner put it, not only in
    lib.rs. Test code is skipped: a test that matches on the enum is not the
    program's dispatch.
    """
    variant_pat = re.compile(
        r"^(?:[A-Za-z_][\w]*::)*(" + "|".join(map(re.escape, variants)) + r")\s*$"
    )
    best = None
    for f in sorted(src_dir.rglob("*.rs")):
        rel = f.relative_to(src_dir).as_posix()
        if rel.startswith("tests/") or rel.endswith("/tests.rs") or rel == "tests.rs":
            continue
        src = strip_rust(f.read_text(errors="ignore"))
        for block in match_blocks(src):
            parsed = arms(block)
            # `Make | MakeV2 => ...` is one arm for two variants.
            named = [
                (variant_pat.match(alt.strip()).group(1), alt, b)
                for p, b in parsed
                for alt in p.split("|")
                if variant_pat.match(alt.strip())
            ]
            if not named:
                continue
            # The enum has to be named in the arms or at least in the file
            # (a `use EscrowInstructions::*` allows bare `Take =>`), or an
            # unrelated match with a `Make` variant could be mistaken for it.
            if not any(enum in p for _, p, _ in named) and enum not in src:
                continue
            wildcard = any(p == "_" or re.fullmatch(r"[a-z_]\w*", p) for p, _ in parsed)
            if best is None or len(named) > len(best[0]):
                best = (named, wildcard)

    if best is None:
        return False, {}, False, {}

    named, wildcard = best
    handled: dict[str, str] = {}
    handlers: dict[str, str] = {}
    for v, _p, body in named:
        if REJECTS.match(body):
            handled[v] = "rejected"
        else:
            handled[v] = "routed"
            call = re.search(r"([A-Za-z_][\w:]*)\s*\(", body)
            if call:
                handlers[v] = call.group(1)
    return True, handled, wildcard, handlers


def run_tests(timeout: int = 1800):
    """
    Run every test in the crate. Returns (ok, passed, failed, compiled, out).

    Unit tests in src/ (where the starter keeps them), integration tests in a
    top-level tests/ if the learner makes one, and doc-tests all report their
    own `test result:` line and are summed. The gate asks whether the learner
    wrote more tests, not where they filed them.
    """
    cmd = ["cargo", "test", "--quiet", "--", "--test-threads=1"]
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


def main() -> int:
    base = json.loads(BASELINE.read_text())
    crate = base["crate"]

    program_so = ROOT / "target" / "deploy" / f"{crate}.so"
    src_dir = ROOT / "src"

    gates = {"build": False, "tests": False, "surface": False, "errors": False}
    new_surface: list[str] = []
    new_errors: list[str] = []
    passed = failed = 0

    # ── build ────────────────────────────────────────────────────────────
    gates["build"] = program_so.exists()
    if not gates["build"]:
        notes.append(
            "`cargo build-sbf` did not produce target/deploy/escrow.so, so "
            "nothing else could be checked."
        )
        return emit(gates, passed, failed, new_surface, new_errors, base)

    # ── tests: yours, on your program ────────────────────────────────────
    #
    # The tests load target/deploy/escrow.so from the build above into
    # LiteSVM, so this is the learner's suite against the learner's program.
    wanted = base["test_count"] + base["new_tests_required"]
    _ok, passed, failed, compiled, out = run_tests()
    if not compiled:
        notes.append("Your tests do not compile.")
        for line in out.splitlines():
            if line.startswith("error[") or line.startswith("error:"):
                notes.append(line.strip()[:200])
                break
    elif failed > 0:
        notes.append(f"{failed} test(s) failing. The suite has to be green.")
    elif passed < wanted:
        notes.append(
            f"{passed} tests passing. The starter reports {base['test_count']} "
            "(test_make_instruction, and the test_id that declare_id! "
            f"generates) and Challenge 3 asks for {base['new_tests_required']} "
            f"more, so {wanted} is the bar."
        )
    gates["tests"] = compiled and failed == 0 and passed >= wanted

    # ── surface and errors: the dispatch match ───────────────────────────
    found, handled, wildcard, handlers = dispatch(
        src_dir, base["instruction_enum"], base["variants"]
    )

    if not found:
        notes.append(
            f"Could not find the `match` on {base['instruction_enum']} that "
            "dispatches instructions. It lives in lib.rs in the starter."
        )
        return emit(gates, passed, failed, new_surface, new_errors, base)

    routed = {v for v, how in handled.items() if how == "routed"}
    new_surface = sorted(
        (v for v in routed if v not in base["routed"]),
        key=base["variants"].index,
    )
    missing = [v for v in base["must_route"] if v not in routed]
    gates["surface"] = not missing

    if new_surface:
        notes.append(
            "Newly dispatched — "
            + ", ".join(
                f"{v} → {handlers[v]}" if v in handlers else v for v in new_surface
            )
            + "."
        )
    if missing:
        notes.append(
            "Not dispatched yet: "
            + ", ".join(missing)
            + ". Each needs its own arm in the match in lib.rs that calls a "
            "handler (Challenges 1 and 2)."
        )

    # ── errors: MakeV2 answered explicitly, nothing swallowed ────────────
    rejected = {v for v, how in handled.items() if how == "rejected"}
    new_errors = [v for v in base["must_reject"] if v in rejected]
    unrejected = [v for v in base["must_reject"] if v not in rejected]
    gates["errors"] = not wildcard and not unrejected

    if gates["errors"]:
        notes.append(
            "MakeV2 is rejected with an explicit error, and no `_ =>` arm is "
            "left to swallow an instruction."
        )
    else:
        why = []
        if wildcard:
            why.append("the dispatch still has a catch-all `_ =>` arm")
        for v in unrejected:
            if handled.get(v) == "routed":
                why.append(f"{v} is routed to a handler instead of rejected")
            else:
                why.append(f"{v} has no arm of its own")
        notes.append(
            "Checkpoint 05: " + "; ".join(why) + ". Give MakeV2 its own arm "
            "that returns an error, and remove `_ =>`, so the compiler tells "
            "you the day someone adds a variant nobody handles."
        )

    return emit(gates, passed, failed, new_surface, new_errors, base)


def emit(gates, passed, failed, new_surface, new_errors, base) -> int:
    ordered = ["build", "tests", "surface", "errors"]
    met = sum(1 for g in ordered if gates[g])
    unmet = [g for g in ordered if not gates[g]]
    if unmet:
        notes.insert(0, "Gates not met: " + ", ".join(unmet) + ".")

    result = {
        "schema": 1,
        "challenge": CHALLENGE_ID,
        "commit_sha": os.environ.get("GITHUB_SHA", ""),
        "repo": os.environ.get("GITHUB_REPOSITORY", ""),
        "run_id": os.environ.get("GITHUB_RUN_ID", ""),
        # No canonical suite and no mutant pack here, but the shape stays the
        # same so the site reads one format for every challenge.
        "canonical": {"passed": 0, "total": 0},
        "reference_check": {"tests_pass_on_correct_program": gates["tests"]},
        "mutation": {"killed": 0, "total": 0, "killed_ids": []},
        "gates": {
            **gates,
            "met": met,
            "of": len(ordered),
            "passing": passed,
            "failing": failed,
            "required_passing": base["test_count"] + base["new_tests_required"],
            "new_surface": new_surface,
            "new_errors": new_errors,
        },
        "notes": [n for n in notes if n],
    }

    RESULT.write_text(json.dumps(result, indent=2))
    print(json.dumps(result, indent=2))
    return 0 if met == len(ordered) else 1


if __name__ == "__main__":
    sys.exit(main())
