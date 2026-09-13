import Link from "next/link";
import { notFound } from "next/navigation";
import { readFile } from "fs/promises";
import path from "path";
import { marked } from "marked";
import { isAdmin } from "@/lib/admin";
import { getChallenge } from "@/lib/challenges";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * The solution itself.
 *
 * Read inside this server component and rendered to HTML here, so the
 * markdown source never becomes part of a client bundle. The admin check runs
 * before the file is opened — if it throws, nothing is read at all.
 *
 * The content is yours, from your own repo, so it is rendered without
 * sanitising. Do not point this at anything a learner can write to.
 */
export default async function SolutionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await isAdmin())) notFound();

  const { id } = await params;

  // Never interpolate a URL segment into a filesystem path — resolve it
  // through the known challenge list instead.
  const challenge = getChallenge(id);
  if (!challenge) notFound();

  let source: string;
  try {
    source = await readFile(
      path.join(process.cwd(), "solutions", `${challenge.id}.md`),
      "utf8"
    );
  } catch {
    notFound();
  }

  const html = await marked.parse(source);

  return (
    <>
      <header className="page-head">
        <div className="eyebrow">
          <span className="rule" />
          <span className="lbl">Admin · {challenge.eyebrow}</span>
        </div>
        <h1>{challenge.title}</h1>
        <p className="inline-note" style={{ marginTop: 18 }}>
          <Link href="/admin">← Back to admin</Link>
        </p>
      </header>

      <section className="block">
        <article className="prose" dangerouslySetInnerHTML={{ __html: html }} />
      </section>
    </>
  );
}
