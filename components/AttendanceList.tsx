"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "./Providers";

interface Record {
  heldOn: string;
  label: string | null;
  rawName: string;
}

interface Payload {
  records: Record[];
  totalSessions: number;
  meetName: string | null;
  justClaimed: number;
}

export function AttendanceList() {
  const { profile: session } = useSession();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void (async () => {
      try {
        const res = await fetch("/api/attendance", { cache: "no-store" });
        if (res.ok) setData((await res.json()) as Payload);
      } finally {
        setLoading(false);
      }
    })();
  }, [session?.pubkey]);

  if (!session) {
    return (
      <div className="empty">
        <span className="lbl">Not connected</span>
        <p>Connect a wallet to see which sessions you were in.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="empty">
        <span className="lbl">Loading</span>
        <p>Looking you up on the rosters.</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="empty">
        <span className="lbl">Could not load</span>
        <p>Your attendance could not be read just now. Try again in a moment.</p>
      </div>
    );
  }

  const { records, totalSessions, meetName, justClaimed } = data;
  const missed = totalSessions - records.length;

  return (
    <>
      <div className="pf-detail" style={{ marginBottom: 22 }}>
        <span>
          <span className="k">Attended</span>
          <span className="mono">
            {records.length} of {totalSessions}
          </span>
        </span>
        {totalSessions > 0 && (
          <span>
            <span className="k">Missed</span>
            <span className="mono">{missed}</span>
          </span>
        )}
        <span>
          <span className="k">Matched on</span>
          <span
            className="mono"
            style={meetName ? undefined : { color: "var(--ink-2)" }}
          >
            {meetName ?? "no Meet name set"}
          </span>
        </span>
      </div>

      {justClaimed > 0 && (
        <div className="callout" style={{ marginBottom: 22 }}>
          <span className="lbl">Found you</span>
          <p>
            {justClaimed} session{justClaimed === 1 ? "" : "s"} just matched to
            your name and {justClaimed === 1 ? "has" : "have"} been added below.
          </p>
        </div>
      )}

      {!meetName && (
        <div className="callout warn" style={{ marginBottom: 22 }}>
          <span className="lbl">No Google Meet name</span>
          <p>
            Rosters are exported from Google Meet, so without that name there is
            nothing to look you up by. Add it on your{" "}
            <Link href="/profile">profile</Link> — spelled exactly as Meet shows
            it — and past sessions will be matched straight away.
          </p>
        </div>
      )}

      {totalSessions === 0 ? (
        <div className="empty">
          <span className="lbl">Nothing recorded yet</span>
          <p>No rosters have been uploaded, so there is nothing to show.</p>
        </div>
      ) : records.length === 0 ? (
        <div className="empty">
          <span className="lbl">No sessions matched</span>
          <p>
            {meetName
              ? `Nothing on the ${totalSessions} roster${totalSessions === 1 ? "" : "s"} so far matches "${meetName}". If you were there, the spelling on the roster probably differs — check it against your profile, or ask to be linked by hand.`
              : "Add your Google Meet name above and this will fill in."}
          </p>
        </div>
      ) : (
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Session</th>
                <th>Listed as</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, i) => (
                <tr key={`${r.heldOn}-${i}`}>
                  <td className="figure">{r.heldOn}</td>
                  <td>{r.label ?? "—"}</td>
                  <td className="mono" style={{ fontSize: ".82rem" }}>
                    {r.rawName}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
