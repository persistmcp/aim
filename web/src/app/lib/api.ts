import { demoGet, isDemo } from "./demo";
import { getToken } from "./token";

// Same-origin in prod (single Vercel project). In dev, point at the deployed API via VITE_API_ORIGIN.
const ORIGIN = (import.meta as any).env?.VITE_API_ORIGIN ?? "";

type Params = Record<string, string | number | undefined>;

/** Carries the HTTP status so callers can treat expected statuses (e.g. 404) as data, not errors. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    path: string,
  ) {
    super(`API ${path} → ${status}`);
    this.name = "ApiError";
  }
}

/** The request never reached us: offline, DNS, a dropped mobile connection, a blocked origin.
 *
 * `fetch` rejects with a bare TypeError in that case, and the message is browser-specific —
 * Chrome says "Failed to fetch", Safari says "Load failed". Both landed in our exception feed
 * looking like app crashes (a real user's iPhone produced "Load failed" on 2026-08-12), which is
 * why this is wrapped where it happens instead of sniffed for by message downstream: a phone
 * losing signal is not a defect and must not be counted as one. An ApiError, by contrast, means
 * the backend answered and answered badly — that one stays an exception. */
export class NetworkError extends Error {
  constructor(
    public readonly path: string,
    override readonly cause: unknown,
  ) {
    super(`Network request to ${path} failed`);
    this.name = "NetworkError";
  }
}

async function request(url: string, init: RequestInit, path: string): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (cause) {
    throw new NetworkError(path, cause);
  }
}

export async function apiGet<T>(path: string, params?: Params): Promise<T> {
  // /demo* tokens serve generated data so the app is fully explorable without a backend.
  if (isDemo()) return demoGet<T>(path, params);
  const token = getToken();
  let qs = "";
  if (params) {
    const entries = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => [k, String(v)] as [string, string]);
    if (entries.length) qs = "?" + new URLSearchParams(entries).toString();
  }
  const res = await request(
    `${ORIGIN}/${token}/api${path}${qs}`,
    { headers: { accept: "application/json" } },
    path,
  );
  if (!res.ok) throw new ApiError(res.status, path);
  return res.json() as Promise<T>;
}

async function apiWrite<T>(method: "POST" | "PATCH", path: string, body?: unknown): Promise<T> {
  // Demo mode has no real backend to write to; there is nothing sensible to do with a save here.
  if (isDemo()) throw new ApiError(404, path);
  const token = getToken();
  const res = await request(
    `${ORIGIN}/${token}/api${path}`,
    {
      method,
      headers: { accept: "application/json", "content-type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    },
    path,
  );
  if (!res.ok) throw new ApiError(res.status, path);
  return res.json() as Promise<T>;
}

export const apiPost = <T>(path: string, body?: unknown): Promise<T> =>
  apiWrite<T>("POST", path, body);
export const apiPatch = <T>(path: string, body?: unknown): Promise<T> =>
  apiWrite<T>("PATCH", path, body);
