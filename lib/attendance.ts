/**
 * Turning a markdown roster into names.
 *
 * The file is whatever you actually keep — a bulleted list, a numbered one, a
 * table, or one name per line. This handles all of those rather than making
 * you reformat before every upload.
 */

/** Extract names, in file order, without duplicates. */
export function parseNames(markdown: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  let inFence = false;

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    if (/^(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (/^#{1,6}\s/.test(line)) continue; // heading
    if (/^([-*_])\1{2,}$/.test(line)) continue; // horizontal rule
    if (/^>/.test(line)) continue; // block quote

    let text = line;

    if (text.startsWith("|")) {
      // Table row — take the first cell, skip the |---|---| separator.
      const cells = text
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean);
      if (!cells.length) continue;
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
      text = cells[0];
    } else {
      text = text
        .replace(/^[-*+]\s+/, "") // bullet
        .replace(/^\d+[.)]\s+/, "") // numbered
        .replace(/^\[[ xX]\]\s+/, ""); // task checkbox
    }

    text = text
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/`(.+?)`/g, "$1")
      .replace(/\[(.+?)\]\([^)]*\)/g, "$1") // [name](link) -> name
      .replace(/<[^>]+>/g, "")
      .trim()
      .replace(/[,;]$/, "")
      .trim();

    if (!text) continue;
    // A column header, not a person.
    if (/^(name|student|attendee|attendance|present)s?$/i.test(text)) continue;
    // Prose, not a name.
    if (text.length > 80) continue;

    const key = normalizeName(text);
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(text);
  }

  return names;
}

/**
 * The form names are compared in. Case, spacing and trailing punctuation
 * differ constantly between one week's roster and the next; none of that
 * should make "Ada Lovelace" a different person.
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip accents for comparison only
    .replace(/[^a-z0-9@._\s-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
