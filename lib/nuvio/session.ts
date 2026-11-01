import type { Session } from "@/lib/types";

export const API_BASE = "https://api.nuvio.tv";
/** Publishable key: public by design, documented by Nuvio. */
export const PUBLISHABLE_KEY = "sb_publishable_1Clq8rlTVACkdcZuqr6_AD__xUUC_EN";
export const SESSION_KEY = "nuviolink.session";
export const REQUEST_TIMEOUT_MS = 10_000;
const REFRESH_MARGIN_S = 60;
const LOCK_NAME = "nuviolink.refresh";

/** Normalized error for every Nuvio request. Never contains tokens. */
export class NuvioError extends Error {
  status: number;
  /** True when the session was cleared because the server rejected the refresh token. */
  sessionExpired: boolean;
  /** True for network errors, timeouts, 429 and 5xx: safe to retry, session kept. */
  retryable: boolean;
  /** True when the error body came from the auth server rather than a gateway or proxy in front of it. */
  fromAuthServer: boolean;
  constructor(
    message: string,
    status: number,
    opts: { sessionExpired?: boolean; retryable?: boolean; fromAuthServer?: boolean } = {},
  ) {
    super(message);
    this.name = "NuvioError";
    this.status = status;
    this.sessionExpired = opts.sessionExpired ?? false;
    this.retryable = opts.retryable ?? false;
    this.fromAuthServer = opts.fromAuthServer ?? false;
  }
}

// ---------------------------------------------------------------------------
// Storage (browser only; every access is lazy so SSR import is safe)
// ---------------------------------------------------------------------------

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function isSession(v: unknown): v is Session {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.access_token === "string" &&
    typeof s.refresh_token === "string" &&
    typeof s.expires_at === "number" &&
    !!s.user &&
    typeof s.user === "object"
  );
}

/** Best effort: asks the browser not to evict localStorage, and with it the session. */
export function requestPersistentStorage(): void {
  navigator.storage?.persist?.().catch(() => undefined);
}

export function getSession(): Session | null {
  const raw = storage()?.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

type Listener = (session: Session | null) => void;
const listeners = new Set<Listener>();

function notify(): void {
  const s = getSession();
  for (const l of listeners) l(s);
}

export function saveSession(session: Session): void {
  storage()?.setItem(SESSION_KEY, JSON.stringify(session));
  notify();
}

export function clearSession(): void {
  storage()?.removeItem(SESSION_KEY);
  notify();
}

/**
 * Subscribe to session changes in this tab and (via the `storage` event) in other tabs.
 * Returns an unsubscribe function.
 */
export function onSessionChange(listener: Listener): () => void {
  listeners.add(listener);
  const handler = (e: StorageEvent) => {
    // key === null means storage.clear()
    if (e.key === null || e.key === SESSION_KEY) listener(getSession());
  };
  const hasWindow = typeof window !== "undefined";
  if (hasWindow) window.addEventListener("storage", handler);
  return () => {
    listeners.delete(listener);
    if (hasWindow) window.removeEventListener("storage", handler);
  };
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

function messageFrom(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    for (const k of ["msg", "error_description", "message", "error"]) {
      if (typeof b[k] === "string" && b[k]) return b[k] as string;
    }
  }
  return `Request failed (${status})`;
}

function isAuthServerBody(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return ["error_code", "error_description", "msg"].some((k) => typeof b[k] === "string");
}

export interface NuvioRequest {
  method?: string;
  body?: unknown;
  token?: string;
}

/**
 * Low-level request with the 10s timeout and error normalization.
 * Resolves with parsed JSON (or null for 204/empty); throws NuvioError otherwise.
 */
export async function nuvioFetch<T = unknown>(path: string, req: NuvioRequest = {}): Promise<T> {
  const headers: Record<string, string> = {
    apikey: PUBLISHABLE_KEY,
    "Content-Type": "application/json",
  };
  if (req.token) headers.Authorization = `Bearer ${req.token}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: req.method ?? "POST",
      headers,
      body: req.body === undefined ? undefined : JSON.stringify(req.body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new NuvioError(
      timedOut ? "Nuvio took too long to respond. Please try again." : "Could not reach Nuvio. Check your connection and try again.",
      0,
      { retryable: true },
    );
  }

  const text = await res.text().catch(() => "");
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }
  if (!res.ok) {
    throw new NuvioError(messageFrom(parsed, res.status), res.status, {
      retryable: res.status === 429 || res.status >= 500,
      fromAuthServer: isAuthServerBody(parsed),
    });
  }
  return parsed as T;
}

// ---------------------------------------------------------------------------
// Sessions from token responses
// ---------------------------------------------------------------------------

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  expires_in?: number;
  user?: { id?: string; email?: string | null };
}

export function sessionFromTokenResponse(data: TokenResponse, fallbackUser?: Session["user"]): Session {
  if (!data || typeof data.access_token !== "string" || typeof data.refresh_token !== "string") {
    throw new NuvioError("Unexpected response from Nuvio", 502);
  }
  const now = Math.floor(Date.now() / 1000);
  const expires_at =
    typeof data.expires_at === "number"
      ? data.expires_at
      : now + (typeof data.expires_in === "number" ? data.expires_in : 3600);
  const user = data.user?.id
    ? { id: data.user.id, email: data.user.email ?? null }
    : (fallbackUser ?? { id: "", email: null });
  return { access_token: data.access_token, refresh_token: data.refresh_token, expires_at, user };
}

function hasTimeLeft(s: Session): boolean {
  return s.expires_at - Date.now() / 1000 > REFRESH_MARGIN_S;
}

// ---------------------------------------------------------------------------
// Refresh (rotating refresh tokens)
// ---------------------------------------------------------------------------

let inflight: Promise<Session> | null = null;
let memoryLockTail: Promise<unknown> = Promise.resolve();

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (locks && typeof locks.request === "function") {
    return locks.request(LOCK_NAME, fn) as Promise<T>;
  }
  const run = memoryLockTail.then(fn, fn);
  memoryLockTail = run.catch(() => undefined);
  return run;
}

async function doRefresh(failedToken: string | undefined): Promise<Session> {
  return withLock(async () => {
    // Another tab may have rotated the token while we waited for the lock.
    const current = getSession();
    if (!current) throw new NuvioError("Not signed in", 401, { sessionExpired: true });
    const alreadyRotated = failedToken ? current.access_token !== failedToken : true;
    if (alreadyRotated && hasTimeLeft(current)) return current;

    let data: TokenResponse;
    try {
      data = await nuvioFetch<TokenResponse>("/auth/v1/token?grant_type=refresh_token", {
        body: { refresh_token: current.refresh_token },
      });
    } catch (e) {
      // Only the auth server can say a token is dead; a CDN block or bad API key says nothing about it.
      if (e instanceof NuvioError && e.fromAuthServer && (e.status === 400 || e.status === 401 || e.status === 403)) {
        clearSession();
        throw new NuvioError("Your session has expired. Please sign in again.", e.status, {
          sessionExpired: true,
        });
      }
      // Network error, timeout, 429, 5xx, gateway rejection: keep the session and the refresh token.
      throw e;
    }
    const next = sessionFromTokenResponse(data, current.user);
    saveSession(next);
    return next;
  });
}

function refresh(failedToken: string | undefined): Promise<Session> {
  if (!inflight) {
    inflight = doRefresh(failedToken).finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

/** Returns a valid access token, refreshing when fewer than 60s remain. */
export async function getAccessToken(): Promise<string> {
  const s = getSession();
  if (!s) throw new NuvioError("Not signed in", 401, { sessionExpired: true });
  if (hasTimeLeft(s)) return s.access_token;
  return (await refresh(undefined)).access_token;
}

/** Force a refresh after the server rejected `failedToken` (e.g. 401). */
export async function forceRefresh(failedToken: string): Promise<string> {
  return (await refresh(failedToken)).access_token;
}
