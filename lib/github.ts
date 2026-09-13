import "server-only";

const API = "https://api.github.com";

function headers(): HeadersInit {
  const h: Record<string, string> = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) h.authorization = `Bearer ${token}`;
  return h;
}
async function gh<T>(pathname: string): Promise<T | null> {
  let res: Response;
  try {
    res = await fetch(`${API}${pathname}`, {
      headers: headers(),
      cache: "no-store",
    });
  } catch (e) {
    console.error(`[github] network error on ${pathname}:`, e);
    return null;
  }

  if (!res.ok) {
    // A 403 with no remaining quota is rate limiting, not "not found".
    // Without this line the two are indistinguishable in the UI and you
    // chase a data problem that is really a quota problem.
    const remaining = res.headers.get("x-ratelimit-remaining");
    if (res.status === 403 && remaining === "0") {
      const reset = res.headers.get("x-ratelimit-reset");
      console.error(
        `[github] RATE LIMITED on ${pathname}. Resets at ${
          reset ? new Date(Number(reset) * 1000).toISOString() : "unknown"
        }. Set GITHUB_TOKEN if you have not.`
      );
    } else {
      console.error(`[github] ${res.status} on ${pathname}`);
    }
    return null;
  }

  return (await res.json()) as T;
}

/**
 * Expand a short SHA to the full 40 characters.
 *
 * This matters more than it looks. `/git/trees/{ref}` and `/contents?ref=`
 * both resolve a 7-character prefix happily, but
 * `/actions/runs?head_sha=` does an EXACT match and silently returns zero
 * runs for a short SHA — so a submission passes every file check and then
 * reports "no grader run exists" for a commit whose run is right there.
 */
export async function resolveCommitSha(
  fullName: string,
  ref: string
): Promise<string | null> {
  const data = await gh<{ sha?: string }>(`/repos/${fullName}/commits/${ref}`);
  return data?.sha ?? null;
}

export interface Repo {
  full_name: string;
  private: boolean;
  fork: boolean;
  parent?: { full_name: string };
  owner: { login: string };
}

export interface WorkflowRun {
  id: number;
  html_url: string;
  head_sha: string;
  status: string;
  conclusion: string | null;
  path: string;
  event: string;
}

export interface Job {
  id: number;
  runner_name: string | null;
  runner_group_name: string | null;
  labels: string[];
}

export interface TreeEntry {
  path: string;
  type: "blob" | "tree" | "commit";
  sha: string;
}

export function getRepo(fullName: string) {
  return gh<Repo>(`/repos/${fullName}`);
}

export async function getRunsForSha(fullName: string, sha: string) {
  const data = await gh<{ workflow_runs: WorkflowRun[] }>(
    `/repos/${fullName}/actions/runs?head_sha=${sha}&per_page=20`
  );
  return data?.workflow_runs ?? [];
}

export async function getJobs(fullName: string, runId: number) {
  const data = await gh<{ jobs: Job[] }>(
    `/repos/${fullName}/actions/runs/${runId}/jobs`
  );
  return data?.jobs ?? [];
}

/** One call returns every path and blob SHA at a commit. */
export async function getTree(fullName: string, sha: string) {
  const data = await gh<{ tree: TreeEntry[]; truncated: boolean }>(
    `/repos/${fullName}/git/trees/${sha}?recursive=1`
  );
  return data;
}

/**
 * GitHub-hosted runners report a runner_group_name of "GitHub Actions" and a
 * runner_name like "GitHub Actions 12". A self-hosted runner the learner
 * controls would not. Defence in depth, not a proof — GitHub reserves the
 * hosted labels, which makes this awkward to forge rather than impossible.
 */
export function ranOnHostedRunner(jobs: Job[]): boolean {
  if (jobs.length === 0) return false;
  return jobs.every(
    (j) =>
      j.runner_group_name === "GitHub Actions" &&
      !j.labels.includes("self-hosted")
  );
}

/** File contents at a specific commit. Pinned to `ref`, never HEAD. */
export async function getFileAtRef(
  fullName: string,
  filePath: string,
  ref: string
): Promise<string | null> {
  const data = await gh<{ content?: string; encoding?: string }>(
    `/repos/${fullName}/contents/${filePath}?ref=${ref}`
  );
  if (!data?.content || data.encoding !== "base64") return null;
  return Buffer.from(data.content, "base64").toString("utf8");
}
export interface Artifact {
  id: number;
  name: string;
  expired: boolean;
  size_in_bytes: number;
}

export async function getRunArtifacts(
  fullName: string,
  runId: number
): Promise<Artifact[]> {
  const data = await gh<{ artifacts: Artifact[] }>(
    `/repos/${fullName}/actions/runs/${runId}/artifacts`
  );
  return data?.artifacts ?? [];
}

/**
 * Download an artifact as a zip.
 *
 * Two things about this endpoint.
 *
 * It needs a token with the FULL `repo` scope. `public_repo` is not enough,
 * even for a public repository — GitHub gates artifact downloads behind
 * actions:read, which classic tokens only get from `repo`.
 *
 * And it answers 302 to a signed storage URL. We follow that hop MANUALLY
 * and send no headers on it: the storage host rejects any request carrying
 * an Authorization header, and relying on the fetch implementation to strip
 * it for us is the kind of assumption that works until it doesn't.
 */
export type ArtifactDownload =
  | { ok: true; data: Uint8Array }
  | { ok: false; status: number; detail: string };

export async function downloadArtifactZip(
  fullName: string,
  artifactId: number
): Promise<ArtifactDownload> {
  const url = `${API}/repos/${fullName}/actions/artifacts/${artifactId}/zip`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: headers(),
      cache: "no-store",
      redirect: "manual",
    });
  } catch (e) {
    console.error("[github] artifact request failed:", e);
    return { ok: false, status: 0, detail: "network error" };
  }

  // 302 to signed storage. Re-request with a clean set of headers.
  if (res.status === 301 || res.status === 302 || res.status === 307) {
    const location = res.headers.get("location");
    if (!location) {
      return { ok: false, status: res.status, detail: "redirect without a location" };
    }
    try {
      const signed = await fetch(location, { cache: "no-store" });
      if (!signed.ok) {
        console.error(`[github] signed storage URL returned ${signed.status}`);
        return {
          ok: false,
          status: signed.status,
          detail: "the storage host refused the download",
        };
      }
      return { ok: true, data: new Uint8Array(await signed.arrayBuffer()) };
    } catch (e) {
      console.error("[github] signed download failed:", e);
      return { ok: false, status: 0, detail: "network error on the signed URL" };
    }
  }

  if (res.ok) {
    return { ok: true, data: new Uint8Array(await res.arrayBuffer()) };
  }

  const body = await res.text().catch(() => "");
  console.error(
    `[github] ${res.status} downloading artifact ${artifactId}: ${body.slice(0, 300)}`
  );

  if (res.status === 403) {
    return {
      ok: false,
      status: 403,
      detail: process.env.GITHUB_TOKEN
        ? "GITHUB_TOKEN is missing the `repo` scope (artifact downloads need it, `public_repo` is not enough)"
        : "GITHUB_TOKEN is not set, and artifact downloads are never anonymous",
    };
  }
  if (res.status === 404) {
    return { ok: false, status: 404, detail: "artifact not found or already expired" };
  }
  if (res.status === 410) {
    return { ok: false, status: 410, detail: "artifact has expired" };
  }

  return { ok: false, status: res.status, detail: `GitHub returned ${res.status}` };
}
