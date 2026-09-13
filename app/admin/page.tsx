import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { readdir } from "fs/promises";
import path from "path";
import { isAdmin } from "@/lib/admin";
import { CHALLENGES } from "@/lib/challenges";
import { getPendingClaims } from "@/lib/db";
import { getSideQuest } from "@/lib/sidequests";
import { shortAddress } from "@/lib/points";
import { ClaimActions } from "@/components/ClaimActions";

export const metadata: Metadata = { title: "Admin · Solana Summer" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function solutionFiles(): Promise<Set<string>> {
  try {
    const names = await readdir(path.join(process.cwd(), "solutions"));
    return new Set(
      names.filter((n) => n.endsWith(".md")).map((n) => n.replace(/\.md$/, ""))
    );
  } catch {
    return new Set();
  }
}

export default async function AdminPage() {
  // 404 rather than 403: a 403 confirms the page exists and that there is
  // something behind it worth having.
  if (!(await isAdmin())) notFound();

  const [have, pending] = await Promise.all([solutionFiles(), getPendingClaims()]);

  return (
    <>
      <header className="page-head">
        <div className="eyebrow">
          <span className="rule" />
          <span className="lbl">Admin</span>
        </div>
        <h1>Reference solutions and the review queue.</h1>
        <p className="deck">
          Visible only to wallets in <code className="inl">ADMIN_PUBKEYS</code>.
          Solution text is read server-side and never enters the client bundle.
        </p>
      </header>

      <section className="block">
        <div className="head">
          <div className="eyebrow">
            <span className="rule" />
            <span className="lbl">Solutions</span>
          </div>
          <h2>One file per challenge.</h2>
          <p>
            Drop markdown into <code className="inl">solutions/&lt;challenge-id&gt;.md</code>{" "}
            and it appears here.
          </p>
        </div>

        <div className="eco-grid">
          {CHALLENGES.map((c) => {
            const exists = have.has(c.id);
            return (
              <div className="card eco" key={c.id}>
                <span className="n">
                  {exists ? (
                    <Link href={`/admin/${c.id}`}>{c.eyebrow}</Link>
                  ) : (
                    c.eyebrow
                  )}
                </span>
                <p className="b">{c.title}</p>
                <span className="note">
                  {exists ? "Solution on file" : `No solutions/${c.id}.md yet`}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="block">
        <div className="head">
          <div className="eyebrow">
            <span className="rule" />
            <span className="lbl">Review queue</span>
          </div>
          <h2>Side quest claims awaiting a human.</h2>
          <p>
            No side quest has an automated verifier yet, so every claim lands
            here. Approving one writes the points to the ledger.
          </p>
        </div>

        {pending.length === 0 ? (
          <p className="pf-empty">Nothing waiting.</p>
        ) : (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Wallet</th>
                  <th>Quest</th>
                  <th>Claimed</th>
                  <th className="right">Worth</th>
                  <th className="right">Action</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((c) => {
                  const quest = getSideQuest(c.questId);
                  return (
                    <tr key={c.id}>
                      <td className="mono">{shortAddress(c.userPubkey, 5, 4)}</td>
                      <td>{quest?.title ?? c.questId}</td>
                      <td className="figure">
                        {c.claimedAt.toISOString().slice(0, 10)}
                      </td>
                      <td className="figure right">{quest?.points ?? 0}</td>
                      <td className="right">
                        <ClaimActions
                          pubkey={c.userPubkey}
                          questId={c.questId}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
