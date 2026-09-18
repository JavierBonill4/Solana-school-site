"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Edit or remove one imported roster.
 *
 * Deleting takes the attendance credit with it — attendance_records cascades
 * — so it is behind a second click rather than a confirm dialog, which is
 * both quicker to use and impossible to dismiss by accident.
 */
export function AttendanceSessionEdit({
  sessionId,
  heldOn: initialHeldOn,
  label: initialLabel,
  unmatched,
}: {
  sessionId: string;
  heldOn: string;
  label: string | null;
  unmatched: number;
}) {
  const router = useRouter();
  const [heldOn, setHeldOn] = useState(initialHeldOn);
  const [label, setLabel] = useState(initialLabel ?? "");
  const [busy, setBusy] = useState<null | "save" | "rematch" | "delete">(null);
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Switching between sessions reuses this component, so the fields have to
  // follow the selection rather than keep the first one they were given.
  useEffect(() => {
    setHeldOn(initialHeldOn);
    setLabel(initialLabel ?? "");
    setConfirming(false);
    setNote(null);
    setError(null);
  }, [sessionId, initialHeldOn, initialLabel]);

  const dirty = heldOn !== initialHeldOn || label !== (initialLabel ?? "");

  async function call(
    kind: "save" | "rematch" | "delete",
    init: RequestInit
  ): Promise<unknown | null> {
    setBusy(kind);
    setError(null);
    setNote(null);
    try {
      const res = await fetch(`/api/admin/attendance/${sessionId}`, init);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          (body as { error?: string }).error ?? "That did not work."
        );
        return null;
      }
      return body;
    } catch {
      setError("Could not reach the server.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const ok = await call("save", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ heldOn, label }),
    });
    if (ok) {
      setNote("Saved.");
      router.refresh();
    }
  }

  async function rematch() {
    const body = (await call("rematch", { method: "POST" })) as {
      matched: number;
      remaining: number;
    } | null;
    if (!body) return;
    setNote(
      body.matched === 0
        ? `Nothing new matched — ${body.remaining} row${body.remaining === 1 ? "" : "s"} still need a wallet. They have probably not set a Google Meet name.`
        : `Matched ${body.matched} more. ${body.remaining} still unlinked.`
    );
    router.refresh();
  }

  async function remove() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    const ok = await call("delete", { method: "DELETE" });
    if (ok) {
      // Drop the ?session= param — it points at something that is gone.
      router.push("/admin/attendance");
      router.refresh();
    }
  }

  return (
    <form className="panel" onSubmit={save} style={{ marginBottom: 26 }}>
      <div className="lbl">This session</div>

      <div className="row">
        <div className="field" style={{ flex: "0 1 170px" }}>
          <label className="lbl" htmlFor={`heldOn-${sessionId}`}>
            Date held
          </label>
          <input
            id={`heldOn-${sessionId}`}
            type="date"
            value={heldOn}
            onChange={(e) => setHeldOn(e.target.value)}
            required
          />
        </div>

        <div className="field">
          <label className="lbl" htmlFor={`label-${sessionId}`}>
            Label
          </label>
          <input
            id={`label-${sessionId}`}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Optional — Week 3, Office hours…"
            maxLength={80}
          />
        </div>

        <button className="btn" disabled={busy !== null || !dirty}>
          {busy === "save" ? "Saving…" : "Save"}
        </button>
      </div>

      <div className="actions" style={{ marginTop: 16, flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn quiet"
          onClick={rematch}
          disabled={busy !== null || unmatched === 0}
          title={
            unmatched === 0
              ? "Every name on this roster is already linked"
              : undefined
          }
        >
          {busy === "rematch"
            ? "Matching…"
            : `Re-match ${unmatched} unlinked`}
        </button>

        <button
          type="button"
          className="btn quiet"
          onClick={remove}
          disabled={busy !== null}
          style={confirming ? { color: "var(--bad)" } : undefined}
        >
          {busy === "delete"
            ? "Deleting…"
            : confirming
              ? "Click again to delete"
              : "Delete session"}
        </button>

        {confirming && busy === null && (
          <button
            type="button"
            className="btn quiet"
            onClick={() => setConfirming(false)}
          >
            Cancel
          </button>
        )}
      </div>

      {confirming && (
        <p className="lbl" style={{ marginTop: 12, lineHeight: 1.5 }}>
          This removes the roster and every name on it, so anyone credited with
          attending this session loses that credit. Re-uploading the file
          restores it.
        </p>
      )}

      {error && (
        <div className="callout warn" style={{ marginTop: 16 }}>
          <span className="lbl">Not done</span>
          <p>{error}</p>
        </div>
      )}
      {note && !error && (
        <div className="callout" style={{ marginTop: 16 }}>
          <p>{note}</p>
        </div>
      )}
    </form>
  );
}
