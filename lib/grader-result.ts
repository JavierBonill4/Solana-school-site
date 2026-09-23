import "server-only";
import { unzipSync, strFromU8 } from "fflate";
import { downloadArtifactZip, getRunArtifacts } from "./github";

/** Must match `name:` on the upload-artifact step in verify.yml. */
export const RESULT_ARTIFACT = "solana-summer-result";
const RESULT_FILE = "result.json";

/** The shape grader/grade.py writes. */
export interface GraderResult {
  schema: number;
  challenge: string;
  commit_sha: string;
  repo?: string;
  run_id?: string | number;
  canonical: { passed: number; total: number };
  reference_check: { tests_pass_on_correct_program: boolean };
  mutation: { killed: number; total: number; killed_ids?: string[] };
  /**
   * The four coarse gates, when the grader reports them. Optional: a repo
   * still running an older grade.py has none, and that must not stop it
   * being scored the way it always was.
   */
  gates?: {
    build: boolean;
    tests: boolean;
    surface: boolean;
    errors: boolean;
    met?: number;
    of?: number;
    passing?: number;
    failing?: number;
    required_passing?: number;
    new_surface?: string[];
    new_errors?: string[];
  };
  notes?: string[];
}

type Outcome =
  | { ok: true; result: GraderResult }
  | { ok: false; error: string };

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Shape check. The artifact comes from a workflow we pinned by hash, so it
 * should always be well formed — but it arrives over the network from a
 * repository we do not control, so it gets validated like any other input.
 */
function parse(raw: string): Outcome {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: "The grader's result.json is not valid JSON." };
  }

  const r = data as Partial<GraderResult>;

  if (
    typeof r.challenge !== "string" ||
    typeof r.commit_sha !== "string" ||
    !r.canonical ||
    !isNum(r.canonical.passed) ||
    !isNum(r.canonical.total) ||
    !r.mutation ||
    !isNum(r.mutation.killed) ||
    !isNum(r.mutation.total) ||
    !r.reference_check ||
    typeof r.reference_check.tests_pass_on_correct_program !== "boolean"
  ) {
    return {
      ok: false,
      error: "The grader's result.json is missing fields we need.",
    };
  }

  return { ok: true, result: r as GraderResult };
}

/**
 * Fetch and unzip the result the grader published for a run.
 *
 * Returned messages are written for the learner, because they are what shows
 * up on the submit form.
 */
export async function readGraderResult(
  fullName: string,
  runId: number
): Promise<Outcome> {
  const artifacts = await getRunArtifacts(fullName, runId);
  const artifact = artifacts.find((a) => a.name === RESULT_ARTIFACT);

  if (!artifact) {
    return {
      ok: false,
      error: `That run published no "${RESULT_ARTIFACT}" artifact. Re-run the workflow on this commit.`,
    };
  }
  if (artifact.expired) {
    return {
      ok: false,
      error: "That run's result has expired on GitHub. Push again to get a fresh run.",
    };
  }

  const download = await downloadArtifactZip(fullName, artifact.id);
  if (!download.ok) {
    return {
      ok: false,
      error: `We could not download the grader's result from GitHub: ${download.detail}.`,
    };
  }

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(download.data);
  } catch {
    return { ok: false, error: "The grader's result artifact is not a readable zip." };
  }

  // upload-artifact with `path: result.json` puts it at the zip root, but
  // don't depend on that — take the first result.json at any depth.
  const key =
    Object.keys(files).find((k) => k === RESULT_FILE) ??
    Object.keys(files).find((k) => k.endsWith(`/${RESULT_FILE}`));

  if (!key) {
    return {
      ok: false,
      error: `The result artifact does not contain ${RESULT_FILE}.`,
    };
  }

  return parse(strFromU8(files[key]));
}
