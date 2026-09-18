import type { SubmissionStatus } from "@/lib/types";

const LABEL: Record<SubmissionStatus, string> = {
  passed: "Passed",
  attempted: "Attempted",
  failed: "Failed",
  pending: "Grading",
  none: "Not submitted",
};

/**
 * Green check when the submission passed, amber half-ring when the work is
 * real but does not grade yet, red cross when it failed outright, an empty
 * dashed ring when nothing has been submitted.
 *
 * "Attempted" is deliberately its own mark rather than a shade of failed:
 * someone who forked, changed the program and pushed has done something, and
 * a red cross tells them otherwise. The ring for "not submitted" is quiet for
 * the same reason — not started is not a negative state.
 */
export function StatusMark({
  status,
  title,
}: {
  status: SubmissionStatus;
  title?: string;
}) {
  return (
    <span
      className={`mark ${status}`}
      role="img"
      aria-label={title ? `${title}: ${LABEL[status]}` : LABEL[status]}
      title={LABEL[status]}
    >
      {status === "passed" && (
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M2.5 8.5l3.5 3.5 7.5-8"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {status === "attempted" && (
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
          {/* Half-filled: started, not finished. */}
          <path
            d="M8 2.5a5.5 5.5 0 000 11z"
            fill="currentColor"
          />
          <circle
            cx="8"
            cy="8"
            r="5.5"
            stroke="currentColor"
            strokeWidth="1.6"
          />
        </svg>
      )}
      {status === "pending" && (
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="3.5" fill="currentColor" />
        </svg>
      )}
      {status === "failed" && (
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M3.5 3.5l9 9M12.5 3.5l-9 9"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
      )}
    </span>
  );
}

export function statusOf(
  challengeId: string,
  submissions: { challengeId: string; status: SubmissionStatus }[] | undefined
): SubmissionStatus {
  return (
    submissions?.find((s) => s.challengeId === challengeId)?.status ?? "none"
  );
}
