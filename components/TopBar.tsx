"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "./Providers";
import { WalletMenu } from "./WalletMenu";
import { MAX_CHALLENGE_POINTS } from "@/lib/challenges";
import { MAX_SIDEQUEST_POINTS } from "@/lib/sidequests";

const NAV = [
  { href: "/challenges", label: "Challenges" },
  { href: "/attendance", label: "Attendance" },
  { href: "/resources", label: "Resources" },
  { href: "/profile", label: "Profile" },
];

/** Points so far against everything available — shown once signed in. */
function ProgressMeter() {
  const { profile } = useSession();
  if (!profile) return null;

  const ceiling = MAX_CHALLENGE_POINTS + MAX_SIDEQUEST_POINTS;
  const fromChallenges = profile.challengePoints ?? 0;
  const fromQuests = profile.questPoints ?? 0;
  const pct = (n: number) => (ceiling ? Math.min(100, (n / ceiling) * 100) : 0);

  return (
    <Link
      href="/challenges"
      className="meter"
      title={`${fromChallenges} from challenges · ${fromQuests} from side quests · ${ceiling} available`}
      aria-label={`${profile.points} of ${ceiling} points. ${fromChallenges} from challenges, ${fromQuests} from side quests.`}
    >
      <span className="meter-n">
        {profile.points}
        <span className="meter-of">/{ceiling}</span>
      </span>
      <span className="meter-bar" aria-hidden="true">
        <span className="from-challenges" style={{ width: `${pct(fromChallenges)}%` }} />
        <span className="from-quests" style={{ width: `${pct(fromQuests)}%` }} />
      </span>
    </Link>
  );
}

export function TopBar() {
  const pathname = usePathname();
  const { profile } = useSession();

  const items = NAV.filter(
    // Attendance only appears once there is something in it. Matching runs
    // at roster upload and on profile save, so the tab arrives promptly.
    (item) => item.href !== "/attendance" || (profile?.attended ?? 0) >= 1
  );
  if (profile?.isAdmin) items.push({ href: "/admin", label: "Admin" });

  return (
    <header className="topbar">
      <div className="topbar-in">
        <Link href="/" className="brand" aria-label="Solana School — home">
          <span className="dot" />
          <span className="name">Solana School</span>
        </Link>

        <nav className="topnav" aria-label="Main">
          {items.map((item) => {
            const current =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={current ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="topbar-right">
          <ProgressMeter />
          <WalletMenu />
        </div>
      </div>
    </header>
  );
}
