/**
 * People have more than one name.
 *
 * A Google Meet roster says "Javier B.", Discord says "javi_bv", Luma has
 * whatever they typed when they registered, and none of those is necessarily
 * what they want on a leaderboard. Storing one `display_name` and hoping it
 * matches the roster is how attendance ends up being reconciled by hand every
 * week.
 *
 * So: four names, and a choice of which one is public.
 */

export const NAME_SOURCES = ["preferred", "discord", "luma", "meet"] as const;
export type NameSource = (typeof NAME_SOURCES)[number];

export const NAME_LABELS: Record<NameSource, string> = {
  preferred: "Preferred name",
  luma: "*Luma name",
  meet: "*Google Meet name",
  discord: "Discord name",
};

export const NAME_HINTS: Record<NameSource, string> = {
  preferred: "What you would like to be called.",
  luma: "The name you registered with. Required for Solana School students",
  meet: "Exactly as it appears in the Meet participant list. Required for Solana School students.",
  discord: "Your handle in the course server.",
};

export interface Names {
  preferredName: string | null;
  lumaName: string | null;
  meetName: string | null;
  discordName: string | null;
  displayNameSource: NameSource;
}

export const EMPTY_NAMES: Names = {
  preferredName: null,
  lumaName: null,
  meetName: null,
  discordName: null,
  displayNameSource: "preferred",
};

export function isNameSource(v: unknown): v is NameSource {
  return typeof v === "string" && (NAME_SOURCES as readonly string[]).includes(v);
}

export function nameFor(names: Names, source: NameSource): string | null {
  switch (source) {
    case "preferred":
      return names.preferredName;
    case "luma":
      return names.lumaName;
    case "meet":
      return names.meetName;
    case "discord":
      return names.discordName;
  }
}

/**
 * The name to show, given the one they picked.
 *
 * Falls through the other sources when the chosen one is blank, and finally
 * to `fallback` — the old single `display_name` column, which is what every
 * account created before this existed still has. Nobody's name disappears
 * because a column was added underneath them.
 */
export function resolveDisplayName(
  names: Names,
  fallback: string | null = null
): string | null {
  const chosen = nameFor(names, names.displayNameSource);
  if (chosen && chosen.trim()) return chosen.trim();

  for (const source of NAME_SOURCES) {
    const v = nameFor(names, source);
    if (v && v.trim()) return v.trim();
  }
  return fallback && fallback.trim() ? fallback.trim() : null;
}

/**
 * Every name a roster row could plausibly be, weakest first.
 *
 * Order is precedence: later entries win when two people collide, so the Meet
 * name — the one that actually appears in the roster being imported — is last
 * and beats a coincidental match on somebody's Discord handle.
 */
export function matchableNames(
  names: Names,
  extra: (string | null)[] = []
): { value: string; source: string }[] {
  const out: { value: string; source: string }[] = [];
  const push = (v: string | null, source: string) => {
    if (v && v.trim()) out.push({ value: v, source });
  };

  for (const v of extra) push(v, "other");
  push(names.discordName, "discord");
  push(names.lumaName, "luma");
  push(names.preferredName, "preferred");
  push(names.meetName, "meet");
  return out;
}

export const MAX_NAME_LENGTH = 60;
