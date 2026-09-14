"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AttendanceUpload() {
  const router = useRouter();
  const [heldOn, setHeldOn] = useState(new Date().toISOString().slice(0, 10));
  const [label, setLabel] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);

    try {
      // The file is a few kilobytes of text, so read it here and post JSON
      // rather than dealing with multipart on the server.
      const content = await file.text();
      const res = await fetch("/api/admin/attendance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ heldOn, label, filename: file.name, content }),
      });
      const body = await res.json();

      if (!res.ok) {
        setError(body.error ?? "Could not import that file.");
        return;
      }

      const { total, matched } = body as { total: number; matched: number };
      setResult(
        `${total} name${total === 1 ? "" : "s"} imported, ${matched} matched to a student.` +
          (matched < total
            ? ` ${total - matched} still need a wallet — resolve them below.`
            : "")
      );
      setFile(null);
      router.refresh();
    } catch {
      setError("Could not read that file.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={upload} style={{ maxWidth: "42rem" }}>
      <div className="lbl">Import a roster</div>

      <div className="row">
        <div className="field" style={{ flex: "0 1 170px" }}>
          <label className="lbl" htmlFor="heldOn">
            Date held
          </label>
          <input
            id="heldOn"
            type="date"
            value={heldOn}
            onChange={(e) => setHeldOn(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label className="lbl" htmlFor="label">
            Label (optional)
          </label>
          <input
            id="label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Week 3 — escrow walkthrough"
          />
        </div>
      </div>

      <div className="row">
        <div className="field">
          <label className="lbl" htmlFor="roster">
            Markdown file
          </label>
          <input
            id="roster"
            type="file"
            accept=".md,.markdown,.txt,text/markdown,text/plain"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            required
          />
        </div>
        <button className="btn" disabled={busy || !file}>
          {busy ? "Importing…" : "Import"}
        </button>
      </div>

      <p className="lbl" style={{ marginTop: 12, lineHeight: 1.5 }}>
        A bulleted list, a numbered list, a table, or one name per line.
        Headings, code blocks and quotes are ignored.
      </p>

      {error && (
        <div className="callout warn" style={{ marginTop: 18 }}>
          <span className="lbl">Not imported</span>
          <p>{error}</p>
        </div>
      )}
      {result && (
        <div className="callout" style={{ marginTop: 18 }}>
          <span className="lbl">Imported</span>
          <p>{result}</p>
        </div>
      )}
    </form>
  );
}
