import { test as base, expect, type Page, type Request, type Route } from "@playwright/test";

/* eslint-disable @typescript-eslint/no-explicit-any */

const svg = (color: string, label: string) =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="#0b0d14"/></linearGradient></defs><rect width="300" height="450" fill="url(#g)"/><text x="150" y="235" font-size="34" font-family="Georgia" font-weight="bold" text-anchor="middle" fill="rgba(255,255,255,0.85)">${label}</text></svg>`,
  );

function title(id: number, mediaType: "movie" | "tv", name: string, year: string, rating: number | null, imdbId: string | null, color: string): any {
  return {
    id, mediaType, title: name, year, rating, imdbId,
    posterUrl: svg(color, name.slice(0, 14)), backdropUrl: null, overview: `${name} overview`, popularity: 100,
  };
}

export const T = {
  inception: title(27205, "movie", "Inception", "2010", 8.4, "tt1375666", "#1d4ed8"),
  breakingBad: title(1396, "tv", "Breaking Bad", "2008", 8.9, "tt0903747", "#15803d"),
  dune: title(438631, "movie", "Dune", "2021", 7.8, "tt1160419", "#b45309"),
  bear: title(136315, "tv", "The Bear", "2022", 8.3, "tt14452776", "#be123c"),
  barbie: title(346698, "movie", "Barbie", "2023", 7.0, "tt1517268", "#db2777"),
  obscure: title(9999, "movie", "Obscure Gem", "1999", null, null, "#475569"),
  oppenheimer: title(872585, "movie", "Oppenheimer", "2023", 8.1, "tt15398776", "#9a3412"),
  severance: title(95396, "tv", "Severance", "2022", 8.7, "tt11280740", "#0e7490"),
  dune2: title(693134, "movie", "Dune: Part Two", "2024", 8.2, "tt15239678", "#a16207"),
  amelie: title(194, "movie", "Amélie", "2001", 7.9, "tt0211915", "#65a30d"),
};

export const POPULAR = [T.inception, T.breakingBad, T.dune, T.bear, T.barbie, T.obscure, T.oppenheimer, T.severance];
const ALL = [...POPULAR, T.dune2, T.amelie];

export const PROFILES = [
  { id: "uuid-0", profile_index: 0, name: "Matt", avatar_color_hex: "#0ea5e9", avatar_url: null, pin_enabled: false },
  { id: "uuid-1", profile_index: 1, name: "Kids", avatar_color_hex: "#f59e0b", avatar_url: null, pin_enabled: false },
  { id: "uuid-2", profile_index: 2, name: "Sam", avatar_color_hex: "#a855f7", avatar_url: null, pin_enabled: true },
  { id: "uuid-3", profile_index: 3, name: "Guest", avatar_color_hex: "#10b981", avatar_url: null, pin_enabled: false },
];

export const libItem = (t: any, extra: any = {}) => ({
  content_id: t.imdbId ?? `tmdb:${t.id}`,
  content_type: t.mediaType === "tv" ? "series" : "movie",
  name: t.title, poster: t.posterUrl, poster_shape: "POSTER", release_info: t.year, ...extra,
  // server fields the app must strip before writing
  id: "row-1", user_id: "u", profile_id: "p",
});

export const initialLibrary = () => ({
  0: [
    libItem(T.inception, { imdb_rating: 8.8, added_at: 3000 }),
    libItem(T.breakingBad, { added_at: 2000 }),
    { ...libItem(T.amelie, { added_at: 1000 }), content_id: "tmdb:194" },
    { content_id: "kitsu:123", content_type: "series", name: "Odd Addon Show", poster: null, added_at: 500 },
  ] as any[],
  1: [] as any[],
  2: [] as any[],
  3: [] as any[],
});

export interface Mock {
  calls: { fn: string; body: any; auth: string | null }[];
  refreshes: number;
  logins: number;
  logouts: string[];
  tmdb: { search: string[]; popular: number; lookup: string[] };
  lib: Record<number, any[]>;
  profiles: any[];
  failAdd: boolean;
  failRemove: boolean;
  failLookup: boolean;
  validToken: string;
  popularDelayMs: number;
  /** Calls to one rpc function, in order. */
  rpc(fn: string): any[];
}

export function freshSession(over: Partial<{ access_token: string; expires_at: number }> = {}) {
  return {
    access_token: "access-1",
    refresh_token: "refresh-1",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: "user-1", email: "me@example.com" },
    ...over,
  };
}

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify(body) });

export async function setup(
  page: Page,
  opts: { session?: ReturnType<typeof freshSession> | null; profiles?: any[]; library?: Record<number, any[]> } = {},
): Promise<Mock> {
  const m: Mock = {
    calls: [], refreshes: 0, logins: 0, logouts: [],
    tmdb: { search: [], popular: 0, lookup: [] },
    lib: opts.library ?? initialLibrary(),
    profiles: opts.profiles ?? PROFILES,
    failAdd: false, failRemove: false, failLookup: false, validToken: "access-1", popularDelayMs: 0,
    rpc: (fn) => m.calls.filter((c) => c.fn === fn).map((c) => c.body),
  };

  const session = opts.session === undefined ? freshSession() : opts.session;
  if (session) {
    await page.addInitScript((s) => {
      if (!localStorage.getItem("__seeded")) {
        localStorage.setItem("__seeded", "1");
        localStorage.setItem("nuviolink.session", JSON.stringify(s));
      }
    }, session);
  }

  await page.route(/^https:\/\/api\.nuvio\.tv\//, async (route, request: Request) => {
    const url = new URL(request.url());
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const path = url.pathname;
    const body = request.postData() ? JSON.parse(request.postData()!) : null;

    if (path === "/auth/v1/token" && url.searchParams.get("grant_type") === "password") {
      m.logins++;
      if (body.password !== "correct-horse") return json(route, 400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
      return json(route, 200, { ...freshSession(), expires_in: 3600, user: { id: "user-1", email: body.email } });
    }
    if (path === "/auth/v1/token" && url.searchParams.get("grant_type") === "refresh_token") {
      m.refreshes++;
      m.validToken = "access-2";
      return json(route, 200, { access_token: "access-2", refresh_token: "refresh-2", expires_in: 3600, user: { id: "user-1" } });
    }
    if (path === "/auth/v1/logout") {
      m.logouts.push(url.search);
      return route.fulfill({ status: 204, headers: CORS });
    }
    if (path.startsWith("/rest/v1/rpc/")) {
      const fn = path.split("/").pop()!;
      const auth = request.headers()["authorization"] ?? null;
      if (auth !== `Bearer ${m.validToken}`) {
        return json(route, 401, { code: "PGRST301", message: "Expected 3 parts in JWT; got 1" });
      }
      m.calls.push({ fn, body, auth });
      switch (fn) {
        case "sync_pull_profiles":
          return json(route, 200, m.profiles);
        case "sync_pull_library":
          return json(route, 200, m.lib[body.p_profile_id] ?? []);
        case "sync_push_library_items":
          if (m.failAdd) return json(route, 500, { message: "Boom: could not save" });
          for (const it of body.p_items) {
            const l = (m.lib[body.p_profile_id] ??= []);
            const i = l.findIndex((x) => x.content_id === it.content_id && x.content_type === it.content_type);
            if (i >= 0) l.splice(i, 1);
            l.push(it);
          }
          return route.fulfill({ status: 204, headers: CORS });
        case "sync_delete_library_items":
          if (m.failRemove) return json(route, 500, { message: "Boom: could not delete" });
          for (const k of body.p_keys) {
            m.lib[body.p_profile_id] = (m.lib[body.p_profile_id] ?? []).filter(
              (x) => !(x.content_id === k.content_id && x.content_type === k.content_type),
            );
          }
          return route.fulfill({ status: 204, headers: CORS });
      }
    }
    return json(route, 404, { message: `unmocked ${path}` });
  });

  await page.route(/\/api\/tmdb\/(popular|search|lookup)/, async (route, request) => {
    const url = new URL(request.url());
    const kind = url.pathname.split("/").pop();
    if (kind === "popular") {
      m.tmdb.popular++;
      if (m.popularDelayMs) await new Promise((r) => setTimeout(r, m.popularDelayMs));
      return json(route, 200, { items: POPULAR, page: 1, hasMore: false });
    }
    if (kind === "search") {
      const q = url.searchParams.get("q") ?? "";
      m.tmdb.search.push(q);
      const items = ALL.filter((t) => t.title.toLowerCase().includes(q.toLowerCase()));
      return json(route, 200, { items, page: 1, hasMore: false });
    }
    m.tmdb.lookup.push(url.search);
    const id = url.searchParams.get("id");
    const imdb = url.searchParams.get("imdb");
    const found = ALL.find((t) => (id ? String(t.id) === id : t.imdbId === imdb));
    if (m.failLookup) return json(route, 502, { error: "x" });
    return found ? json(route, 200, found) : json(route, 404, { error: "Not found" });
  });

  return m;
}

export const test = base;
export { expect };
