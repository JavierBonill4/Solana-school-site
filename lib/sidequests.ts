import type { SideQuest } from "./types";

/**
 * Side quests are points for things that happen outside this site.
 *
 * This file is PUBLIC METADATA ONLY — it is imported by the sidebar, so it
 * ends up in the browser bundle. Verification logic lives in
 * lib/sidequest-verifiers.server.ts, which the client never sees.
 */
export const SIDE_QUESTS: SideQuest[] = [
  {
    id: "solana-school",
    title: "Sign up for Solana School",
    blurb:
      "Seven weeks of live sessions run by Foundation DevRel, Mon/Wed/Fri. Free, and open to anyone this term.",
    points: 50,
    href: "https://x.com/solana_devs/status/2087931073397231752",
  },
  {
    id: "hackathon-entry",
    title: "Submit to a Solana hackathon",
    blurb:
      "Ship anything to a Colosseum hackathon. The next one runs Sep 28 – Nov 2.",
    points: 150,
    href: "https://colosseum.com/hackathon",
  },
  {
    id: "turbin3-cohort",
    title: "Finish a Turbin3 cohort",
    blurb:
      "Six weeks, project-based, free. Applications are closed right now — next program TBA.",
    points: 100,
    href: "https://turbin3.org/institute",
  },
  {
    id: "superteam-bounty",
    title: "Win a Superteam Earn bounty",
    blurb: "Paid work, judged by the people posting it. Start with a small one.",
    points: 100,
    href: "https://superteam.fun/earn",
  },
  {
    id: "devnet-deploy",
    title: "Deploy a program to devnet",
    blurb:
      "Any program, including one of the assignments above. A program ID on a public cluster is its own milestone.",
    points: 25,
  },
];

export function getSideQuest(id: string): SideQuest | undefined {
  return SIDE_QUESTS.find((q) => q.id === id);
}

export const MAX_SIDEQUEST_POINTS = SIDE_QUESTS.reduce(
  (sum, q) => sum + q.points,
  0
);
