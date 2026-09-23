/**
 * Assignment 01 — proving a machine is set up, from pasted terminal output.
 *
 * There is no repository to inspect and no CI to read, so the learner runs one
 * command and pastes what it prints, and we take them at their word. Faking
 * it only cheats the person who needs these tools for the next eight
 * assignments.
 *
 * What this does instead is read their own output back to them: a tool the
 * shell could not find, a version behind the guide's, an empty devnet wallet.
 * Those are worth naming, with the fix, because each one stops the next
 * assignment dead.
 */

/**
 * The versions the guide targets. Reported, NOT enforced: this whole check
 * runs on output the learner pasted, so a version gate would only ever stop
 * an honest person on a slightly different build. Anything the shell could
 * not find at all is still called out — that is their own output saying so.
 */
export const EXPECTED = {
  rustc: [1, 91, 0],
  solana: [3, 0, 0],
  anchor: [0, 32, 1],
  node: [22, 0, 0],
} as const;

export type ToolKey = keyof typeof EXPECTED;

export const TOOL_LABEL: Record<ToolKey, string> = {
  rustc: "Rust",
  solana: "Solana CLI",
  anchor: "Anchor",
  node: "Node",
};

/**
 * The command the learner runs.
 *
 * One line, so it survives being copied into any shell.
 *
 * `2>&1` means a missing tool prints "command not found" into the output
 * instead of silently producing an empty line — the difference between
 * telling someone "Anchor is missing" and "we could not read your Anchor
 * version".
 *
 * `</dev/null` is what stops it hanging. `anchor --version` asks avm to
 * install a version it does not have and then waits on a yes/no answer that
 * is never coming, so the whole line sits there forever. With stdin closed
 * the prompt gets EOF and the command gives up immediately.
 */
export const SETUP_COMMAND = [
  `printf 'rustc: %s\\n' "$(rustc --version 2>&1 </dev/null)";`,
  `printf 'solana: %s\\n' "$(solana --version 2>&1 </dev/null)";`,
  `printf 'anchor: %s\\n' "$(anchor --version 2>&1 </dev/null)";`,
  `printf 'node: %s\\n' "$(node --version 2>&1 </dev/null)";`,
  `printf 'address: %s\\n' "$(solana address 2>&1 </dev/null)";`,
  `printf 'balance: %s\\n' "$(solana balance --url devnet 2>&1 </dev/null)"`,
].join(" ");

export interface ToolFinding {
  tool: ToolKey;
  found: string | null;
  ok: boolean;
  note: string;
}

export interface ParsedSetup {
  tools: ToolFinding[];
  address: string | null;
  /** Devnet balance as printed, e.g. "2 SOL". */
  balance: string | null;
  /** The same, as a number, or null when it could not be read. */
  balanceSol: number | null;
  /** Tools whose version reads as older than the guide's. */
  behind: ToolFinding[];
  allToolsOk: boolean;
}

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function cmp(a: number[], b: readonly number[]): number {
  for (let i = 0; i < 3; i += 1) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0);
  }
  return 0;
}

export function formatVersion(v: readonly number[]): string {
  return v.join(".");
}

/**
 * Pull a version out of whatever the tool printed.
 *
 * Deliberately loose: `rustc --version` prints "rustc 1.91.0 (…)", anchor
 * prints "anchor-cli 0.32.1", node prints "v22.12.0", and a learner may well
 * paste the whole terminal including their prompt. Find the first version-like
 * number on the tool's own line and move on.
 */
function versionIn(line: string): number[] | null {
  const m = line.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)];
}

function lineFor(text: string, key: string): string | null {
  const labelled = text
    .split("\n")
    .find((l) => new RegExp(`^\\s*${key}\\s*:`, "i").test(l));
  if (labelled) return labelled.split(":").slice(1).join(":").trim();

  // No prefix — they pasted raw output. Fall back to the tool's own banner.
  // Match to the end of the line: stopping at the first digit would hand back
  // "rustc 1" and lose the version we came for.
  const banner: Record<string, RegExp> = {
    rustc: /^\s*rustc\s+\d[^\n]*/im,
    solana: /^\s*solana-cli\s+\d[^\n]*/im,
    anchor: /^\s*anchor-cli\s+\d[^\n]*/im,
    node: /^\s*v\d+\.\d+\.\d+\s*$/im,
  };
  const re = banner[key];
  if (!re) return null;
  const m = text.match(re);
  return m ? m[0].trim() : null;
}

export function parseSetupOutput(raw: string): ParsedSetup {
  const text = (raw ?? "").replace(/\r/g, "");

  const tools: ToolFinding[] = (Object.keys(EXPECTED) as ToolKey[]).map(
    (tool) => {
      const line = lineFor(text, tool);
      if (!line) {
        return {
          tool,
          found: null,
          ok: false,
          note: `No ${TOOL_LABEL[tool]} version in what you pasted.`,
        };
      }
      if (/not found|no such file|command not found/i.test(line)) {
        return {
          tool,
          found: null,
          ok: false,
          note: `${TOOL_LABEL[tool]} is not installed — the shell could not find it.`,
        };
      }
      const v = versionIn(line);
      if (!v) {
        return {
          tool,
          found: line.slice(0, 80),
          ok: false,
          note: `Could not read a ${TOOL_LABEL[tool]} version out of "${line.slice(0, 40)}".`,
        };
      }
      const want = EXPECTED[tool];
      const behind = cmp(v, want) < 0;
      return {
        tool,
        found: formatVersion(v),
        // Installed is enough. An older build is worth mentioning, not
        // worth blocking on.
        ok: true,
        note: behind
          ? `${TOOL_LABEL[tool]} ${formatVersion(v)} — the guide uses ${formatVersion(want)}, so expect small differences.`
          : `${TOOL_LABEL[tool]} ${formatVersion(v)}`,
      };
    }
  );

  // The address, from its own line or from anywhere in the paste.
  let address: string | null = null;
  const addrLine = lineFor(text, "address");
  const candidate = addrLine?.trim();
  if (candidate && BASE58.test(candidate)) {
    address = candidate;
  } else {
    // A base58 address can start with a digit, so "does it start with a
    // number" would throw away half of them. Version strings have dots;
    // base58 never does.
    const loose = text.split(/\s+/).find((w) => BASE58.test(w) && !w.includes("."));
    address = loose ?? null;
  }

  const balance = lineFor(text, "balance")?.trim() || null;
  // "2.5 SOL" -> 2.5. An error message from the CLI has no leading number, so
  // it reads as null rather than as zero.
  const balanceMatch = balance?.match(/^\s*([\d.]+)\s*SOL\b/i);
  const balanceSol = balanceMatch ? Number(balanceMatch[1]) : null;

  return {
    tools,
    address,
    balance,
    balanceSol: Number.isFinite(balanceSol as number) ? balanceSol : null,
    behind: tools.filter((t) => /the guide uses/.test(t.note)),
    allToolsOk: tools.every((t) => t.ok),
  };
}
