import type { LibraryItem, LibraryKey, Profile } from "@/lib/types";
import {
  NuvioError,
  clearSession,
  forceRefresh,
  getAccessToken,
  getSession,
  nuvioFetch,
  saveSession,
  sessionFromTokenResponse,
} from "./session";

const PAGE_SIZE = 500;
const MAX_PAGES = 1000;
const CLIENT_ID_KEY = "nuviolink.client-id";
const SERVER_FIELDS = ["id", "user_id", "profile_id", "created_at", "updated_at"] as const;

/** POST /rest/v1/rpc/<fn> with bearer auth; on 401 force one refresh and retry once. */
export async function rpc<T = unknown>(fn: string, body?: unknown): Promise<T> {
  const path = `/rest/v1/rpc/${fn}`;
  const token = await getAccessToken();
  try {
    return await nuvioFetch<T>(path, { body: body ?? {}, token });
  } catch (e) {
    if (e instanceof NuvioError && e.status === 401) {
      const fresh = await forceRefresh(token);
      return nuvioFetch<T>(path, { body: body ?? {}, token: fresh });
    }
    throw e;
  }
}

export async function signIn(email: string, password: string): Promise<void> {
  const data = await nuvioFetch("/auth/v1/token?grant_type=password", {
    body: { email, password },
  });
  saveSession(sessionFromTokenResponse(data as Parameters<typeof sessionFromTokenResponse>[0]));
  void offerToSavePassword(email, password);
}

/** Asks the browser to show its save prompt directly (Chromium only); others rely on form detection. */
async function offerToSavePassword(id: string, password: string): Promise<void> {
  const { PasswordCredential } = globalThis as unknown as {
    PasswordCredential?: new (data: { id: string; password: string }) => Credential;
  };
  if (!PasswordCredential) return;
  try {
    await navigator.credentials.store(new PasswordCredential({ id, password }));
  } catch {
    // best effort
  }
}

/** scope=local is essential: the default (global) would sign the user out of every Nuvio app. */
export async function signOut(): Promise<void> {
  const token = getSession()?.access_token;
  try {
    if (token) await nuvioFetch("/auth/v1/logout?scope=local", { token });
  } catch {
    // best effort
  } finally {
    clearSession();
    libraryCache.clear();
  }
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

interface RawProfile {
  id?: string;
  profile_index?: unknown;
  name?: string;
  avatar_color_hex?: string | null;
  avatar_url?: string | null;
  pin_enabled?: boolean;
}

export async function listProfiles(): Promise<Profile[]> {
  const rows = (await rpc<RawProfile[] | null>("sync_pull_profiles")) ?? [];
  return rows
    .filter((r) => Number.isInteger(r.profile_index))
    .map((r) => ({
      id: String(r.id ?? ""),
      profileIndex: r.profile_index as number,
      name: r.name || `Profile ${r.profile_index}`,
      avatarColorHex: r.avatar_color_hex ?? null,
      avatarUrl: r.avatar_url ?? null,
      pinEnabled: !!r.pin_enabled,
    }))
    .sort((a, b) => a.profileIndex - b.profileIndex);
}

// ---------------------------------------------------------------------------
// Library
// ---------------------------------------------------------------------------

const libraryCache = new Map<number, LibraryItem[]>();

export function getCachedLibrary(profileIndex: number): LibraryItem[] | undefined {
  return libraryCache.get(profileIndex);
}

export async function getLibrary(profileIndex: number): Promise<LibraryItem[]> {
  const all: LibraryItem[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const rows =
      (await rpc<LibraryItem[] | null>("sync_pull_library", {
        p_profile_id: profileIndex,
        p_limit: PAGE_SIZE,
        p_offset: page * PAGE_SIZE,
      })) ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) {
      libraryCache.set(profileIndex, all);
      return all;
    }
  }
  throw new Error("Library is too large to load");
}

export function getClientId(): string {
  try {
    const existing = localStorage.getItem(CLIENT_ID_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(CLIENT_ID_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

function sameKey(a: LibraryKey, b: LibraryKey): boolean {
  return a.content_id === b.content_id && a.content_type === b.content_type;
}

export async function addToLibrary(profileIndex: number, item: LibraryItem): Promise<void> {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(item)) {
    if (v === undefined || (SERVER_FIELDS as readonly string[]).includes(k)) continue;
    clean[k] = v;
  }
  await rpc("sync_push_library_items", {
    p_profile_id: profileIndex,
    p_origin_client_id: getClientId(),
    p_items: [clean],
  });
  const cached = libraryCache.get(profileIndex);
  if (cached) {
    libraryCache.set(profileIndex, [clean as unknown as LibraryItem, ...cached.filter((c) => !sameKey(c, item))]);
  }
}

export async function removeFromLibrary(profileIndex: number, key: LibraryKey): Promise<void> {
  await rpc("sync_delete_library_items", {
    p_profile_id: profileIndex,
    p_origin_client_id: getClientId(),
    p_keys: [{ content_id: key.content_id, content_type: key.content_type }],
  });
  const cached = libraryCache.get(profileIndex);
  if (cached) libraryCache.set(profileIndex, cached.filter((c) => !sameKey(c, key)));
}
