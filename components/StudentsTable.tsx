"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { shortAddress } from "@/lib/points";

export interface StudentRow {
  pubkey: string;
  displayName: string | null;
  githubLogin: string | null;
  started: number;
  passed: number;
  attended: number;
  sessionCount: number;
  points: number;
}

type Key = "name" | "wallet" | "github" | "started" | "passed" | "attended" | "points";

const COLUMNS: { key: Key; label: string; numeric: boolean }[] = [
  { key: "name", label: "Name", numeric: false },
  { key: "wallet", label: "Wallet", numeric: false },
  { key: "github", label: "GitHub", numeric: false },
  { key: "started", label: "Attempted", numeric: true },
  { key: "passed", label: "Passed", numeric: true },
  { key: "attended", label: "Attended", numeric: true },
  { key: "points", label: "Points", numeric: true },
];

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function textOf(r: StudentRow, key: Key): string | null {
  if (key === "name") return r.displayName?.trim() || null;
  if (key === "github") return r.githubLogin?.trim() || null;
  return r.pubkey;
}

/**
 * First click on a column sorts it the useful way round — numbers most to
 * least, text A→Z. Clicking the same column again flips it.
 *
 * Blank names and blank GitHub logins stay at the bottom in BOTH directions:
 * "no name set" is not a value that belongs between Z and A, and flipping the
 * sort should not bury everyone who did set one under a pile of blanks.
 */
export function StudentsTable({
  rows,
  challengeCount,
}: {
  rows: StudentRow[];
  challengeCount: number;
}) {
  const [key, setKey] = useState<Key>("name");
  const [desc, setDesc] = useState(false);

  const sorted = useMemo(() => {
    const col = COLUMNS.find((c) => c.key === key)!;
    const dir = desc ? -1 : 1;

    return [...rows].sort((a, b) => {
      if (col.numeric) {
        const d = (a[key as "points"] - b[key as "points"]) * dir;
        if (d !== 0) return d;
      } else {
        const x = textOf(a, key);
        const y = textOf(b, key);
        if (!x && y) return 1;
        if (x && !y) return -1;
        if (x && y) {
          const d = collator.compare(x, y) * dir;
          if (d !== 0) return d;
        }
      }
      // Ties fall back to name, blanks last, so the order is stable and
      // readable instead of whatever the database returned.
      const x = a.displayName?.trim();
      const y = b.displayName?.trim();
      if (!x && y) return 1;
      if (x && !y) return -1;
      if (x && y) return collator.compare(x, y);
      return a.pubkey.localeCompare(b.pubkey);
    });
  }, [rows, key, desc]);

  function click(next: Key) {
    if (next === key) {
      setDesc((d) => !d);
      return;
    }
    const col = COLUMNS.find((c) => c.key === next)!;
    setKey(next);
    setDesc(col.numeric); // numbers: most first. text: A first.
  }

  return (
    <div className="tbl-wrap">
      <table>
        <thead>
          <tr>
            {COLUMNS.map((c) => {
              const active = c.key === key;
              const arrow = active ? (desc ? " ↓" : " ↑") : "";
              return (
                <th
                  key={c.key}
                  className={c.numeric ? "right" : undefined}
                  aria-sort={active ? (desc ? "descending" : "ascending") : "none"}
                >
                  <button
                    type="button"
                    onClick={() => click(c.key)}
                    style={{
                      all: "unset",
                      cursor: "pointer",
                      font: "inherit",
                      color: active ? "var(--ink)" : "inherit",
                    }}
                    title={
                      active
                        ? "Click to reverse"
                        : c.numeric
                          ? "Sort most to least"
                          : "Sort A to Z"
                    }
                  >
                    {c.label}
                    {arrow}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => (
            <tr key={s.pubkey}>
              <td>
                <Link href={`/admin/students/${s.pubkey}`}>
                  {s.displayName ?? <span className="lbl">No name set</span>}
                </Link>
              </td>
              <td className="mono" style={{ fontSize: ".8rem" }}>
                {shortAddress(s.pubkey, 5, 4)}
              </td>
              <td className="mono" style={{ fontSize: ".8rem" }}>
                {s.githubLogin ?? "—"}
              </td>
              <td className="figure right">
                {s.started} of {challengeCount}
              </td>
              <td className="figure right">
                {s.passed} of {challengeCount}
              </td>
              <td className="figure right">
                {s.attended} of {s.sessionCount}
              </td>
              <td className="figure right">{s.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
