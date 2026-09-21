import type { EcosystemGroup } from "./types";

/**
 * Everything here was checked in September 2026. Dates go stale — the `note`
 * field is where they live so there is one obvious place to update.
 */
export const ECOSYSTEM: EcosystemGroup[] = [
  {
    heading: "Keep learning",
    intro:
      "Four assignments is not a curriculum. These are the programs people move on to, and all of them are free.",
    links: [
      {
        name: "Solana School",
        href: "https://x.com/solana_devs/status/2087931073397231752",
        blurb:
          "Seven weeks of live building run by Foundation DevRel, with guest lectures and open office hours. Ends at Colosseum.",
        note: "Aug 31 – Oct 16 · free · apply on Luma",
      },
      {
        name: "Turbin3 Institute",
        href: "https://turbin3.org/institute",
        blurb:
          "Six weeks, beginner to intermediate, project-based. Architecture, Anchor, token programs, RWAs, capstone.",
        note: "Applications opened for Q4",
      },
      {
        name: "Blueshift",
        href: "https://learn.blueshift.gg",
        blurb: "Self-paced Solana development courses you can start today.",
        note: "Self-paced",
      },
      {
        name: "Cyfrin Updraft — Solana",
        href: "https://updraft.cyfrin.io/courses/solana",
        blurb:
          "Anchor and native Rust side by side, which is the fastest way to understand what Anchor is doing for you.",
        note: "31 lessons · 16 projects",
      },
      {
        name: "bri (@brimigs) on YouTube",
        href: "https://www.youtube.com/@brimigs",
        blurb:
          "Solana and Rust development from a working blockchain developer — tutorials, walkthroughs and developer Q&As.",
        note: "Video · free",
      },
      {
        name: "Solana Foundation Bootcamp",
        href: "https://solana.com/developers/bootcamp",
        blurb: "The official long-form video bootcamp.",
        note: "Video · self-paced",
      },
    ],
  },
  {
    heading: "Go compete",
    intro:
      "The point of finishing the track is having something to enter. Two of these pay.",
    links: [
      {
        name: "Colosseum Hackathon",
        href: "https://colosseum.com/hackathon",
        blurb:
          "The main Solana hackathon, twice a year. Winners go into Colosseum's accelerator.",
        note: "Sep 28 – Nov 2 · then Apr 6 – May 11",
      },
      {
        name: "Colosseum Eternal",
        href: "https://colosseum.com/",
        blurb:
          "Ongoing sprints between hackathons, for pre-seed consideration. No need to wait for a start date.",
        note: "Always open",
      },
      {
        name: "Superteam Earn",
        href: "https://superteam.fun/earn",
        blurb:
          "Bounties and gigs from real Solana teams. The realistic first place to get paid for this.",
        note: "Paid work",
      },
    ],
  },
  {
    heading: "Keep open in a tab",
    intro: "The references worth knowing by heart.",
    links: [
      {
        name: "Anchor",
        href: "https://www.anchor-lang.com/",
        blurb: "The framework docs. The account constraints page especially.",
      },
      {
        name: "Solana Docs",
        href: "https://solana.com/docs",
        blurb: "Runtime, accounts, transactions, and the CLI reference.",
      },
      {
        name: "Developer templates",
        href: "https://solana.com/developers/templates",
        blurb: "Starting points that already compile.",
      },
    ],
  },
];
