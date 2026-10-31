import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { json } from "./helpers";

const KEY = "SECRETKEY1234567890abcdef";
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  process.env.TMDB_API_KEY = KEY;
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("search title filter", () => {
  it("normalizes diacritics, case and punctuation", async () => {
    const { matchesQuery, normalizeText } = await import("@/lib/tmdb/server");
    expect(normalizeText("Amélie: The Movie!")).toBe("amelie the movie");
    expect(matchesQuery("amelie", ["Amélie"])).toBe(true);
    expect(matchesQuery("spider-man", ["Spider Man: Homecoming"])).toBe(true);
  });

  it("keeps a result containing the whole query or at least one significant word", async () => {
    const { matchesQuery } = await import("@/lib/tmdb/server");
    expect(matchesQuery("matrix", ["The Matrix Reloaded"])).toBe(true);
    expect(matchesQuery("matrix revolutions", ["The Matrix"])).toBe(true);
    expect(matchesQuery("matrix", ["Inception", null])).toBe(false);
  });

  it("matches on original titles too", async () => {
    const { matchesQuery } = await import("@/lib/tmdb/server");
    expect(matchesQuery("parasite", ["Gisaengchung", "기생충", "Parasite"])).toBe(true);
  });

  it("ignores stopwords and 1-char words unless they are the whole query", async () => {
    const { matchesQuery } = await import("@/lib/tmdb/server");
    expect(matchesQuery("the office", ["The Godfather"])).toBe(false);
    expect(matchesQuery("a of", ["Of Mice And Men"])).toBe(false);
    expect(matchesQuery("the", ["The Godfather"])).toBe(true);
    expect(matchesQuery("x men", ["Oxford"])).toBe(false);
  });

  it("search() keeps only movie/tv results that match", async () => {
    fetchMock.mockResolvedValueOnce(
      json(200, {
        total_pages: 3,
        results: [
          { id: 1, media_type: "movie", title: "The Matrix", release_date: "1999-03-30", vote_average: 8.2 },
          { id: 2, media_type: "person", name: "Matrix Person" },
          { id: 3, media_type: "tv", name: "Unrelated Show", original_name: "Other" },
          { id: 4, media_type: "tv", name: "Matrix", first_air_date: "1993-01-01" },
        ],
      }),
    );
    const { search } = await import("@/lib/tmdb/server");
    const page = await search("matrix", 1);
    expect(page.items.map((i) => [i.id, i.mediaType])).toEqual([[1, "movie"], [4, "tv"]]);
    expect(page.hasMore).toBe(true);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname).toBe("/3/search/multi");
    expect(url.searchParams.get("include_adult")).toBe("false");
  });
});

describe("lookup", () => {
  it("returns imdbId from external_ids", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { id: 550, title: "Fight Club", external_ids: { imdb_id: "tt0137523" } }));
    const { lookup } = await import("@/lib/tmdb/server");
    const t = await lookup({ type: "movie", id: 550 });
    expect(t?.imdbId).toBe("tt0137523");
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get("append_to_response")).toBe("external_ids");
  });

  it("imdbId is null (definitive) when TMDB has none", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { id: 1, title: "X", external_ids: { imdb_id: null } }));
    const { lookup } = await import("@/lib/tmdb/server");
    expect((await lookup({ type: "movie", id: 1 }))?.imdbId).toBeNull();
  });

  it("returns null on 404 and prefers the requested type for imdb lookups", async () => {
    const { lookup } = await import("@/lib/tmdb/server");
    fetchMock.mockResolvedValueOnce(json(404, {}));
    expect(await lookup({ type: "tv", id: 9 })).toBeNull();

    fetchMock
      .mockResolvedValueOnce(json(200, { movie_results: [{ id: 10 }], tv_results: [{ id: 20 }] }))
      .mockResolvedValueOnce(json(200, { id: 20, name: "Show", external_ids: { imdb_id: "tt5" } }));
    const t = await lookup({ type: "tv", imdb: "tt5" });
    expect(t?.mediaType).toBe("tv");
    expect(new URL(String(fetchMock.mock.calls[2][0])).pathname).toBe("/3/find/tt5".replace("find/tt5", "tv/20"));
  });
});

describe("route error handling never leaks the API key", () => {
  const routes = async () => ({
    popular: (await import("@/app/api/tmdb/popular/route")).GET,
    search: (await import("@/app/api/tmdb/search/route")).GET,
    lookup: (await import("@/app/api/tmdb/lookup/route")).GET,
  });
  const req = (p: string) => new Request(`http://localhost${p}`);

  it.each([
    ["popular", "/api/tmdb/popular?page=1"],
    ["search", "/api/tmdb/search?q=matrix"],
    ["lookup", "/api/tmdb/lookup?type=movie&id=550"],
  ] as const)("%s returns a generic 502 on upstream failure", async (name, url) => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(new Response(`error for https://api.themoviedb.org/3/x?api_key=${KEY}`, { status: 500 })),
    );
    vi.useFakeTimers();
    const r = await routes();
    const p = r[name](req(url));
    await vi.runAllTimersAsync();
    const res = await p;
    vi.useRealTimers();
    const text = await res.text();
    expect(res.status).toBe(502);
    expect(JSON.parse(text)).toEqual({ error: "Upstream error" });
    expect(text).not.toContain(KEY);
    expect(text).not.toContain("themoviedb");
    for (const call of (console.error as unknown as ReturnType<typeof vi.fn>).mock.calls) {
      expect(JSON.stringify(call)).not.toContain(KEY);
    }
  });

  it("does not leak the key when fetch itself throws with the URL in the message", async () => {
    fetchMock.mockRejectedValue(new Error(`connect failed https://api.themoviedb.org/3/x?api_key=${KEY}`));
    vi.useFakeTimers();
    const r = await routes();
    const p = r.popular(req("/api/tmdb/popular"));
    await vi.runAllTimersAsync();
    const res = await p;
    vi.useRealTimers();
    expect(await res.text()).not.toContain(KEY);
    for (const call of (console.error as unknown as ReturnType<typeof vi.fn>).mock.calls) {
      expect(JSON.stringify(call)).not.toContain(KEY);
    }
  });

  it("reports a missing key generically", async () => {
    delete process.env.TMDB_API_KEY;
    const r = await routes();
    const res = await r.popular(req("/api/tmdb/popular"));
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("TMDB_API_KEY");
  });

  it("validates params with 400s", async () => {
    const r = await routes();
    expect((await r.search(req("/api/tmdb/search"))).status).toBe(400);
    expect((await r.search(req("/api/tmdb/search?q="))).status).toBe(400);
    expect((await r.search(req(`/api/tmdb/search?q=${"a".repeat(101)}`))).status).toBe(400);
    expect((await r.popular(req("/api/tmdb/popular?page=0"))).status).toBe(400);
    expect((await r.popular(req("/api/tmdb/popular?page=abc"))).status).toBe(400);
    expect((await r.lookup(req("/api/tmdb/lookup?type=book&id=1"))).status).toBe(400);
    expect((await r.lookup(req("/api/tmdb/lookup?id=1"))).status).toBe(400);
    expect((await r.lookup(req("/api/tmdb/lookup?type=movie&id=../x"))).status).toBe(400);
    expect((await r.lookup(req("/api/tmdb/lookup?imdb=nope"))).status).toBe(400);
    expect((await r.lookup(req("/api/tmdb/lookup?type=movie&id=1&imdb=tt1"))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lookup 404 and success caching headers", async () => {
    const r = await routes();
    fetchMock.mockResolvedValueOnce(json(404, {}));
    expect((await r.lookup(req("/api/tmdb/lookup?type=movie&id=1"))).status).toBe(404);
    fetchMock.mockResolvedValueOnce(json(200, { id: 1, title: "X", external_ids: { imdb_id: "tt1" } }));
    const ok = await r.lookup(req("/api/tmdb/lookup?type=movie&id=1"));
    expect(ok.headers.get("cache-control")).toBe("public, s-maxage=86400, stale-while-revalidate=86400");
    fetchMock.mockResolvedValueOnce(json(200, { results: [], total_pages: 1 })).mockResolvedValueOnce(json(200, { results: [], total_pages: 1 }));
    const pop = await r.popular(req("/api/tmdb/popular"));
    expect(pop.headers.get("cache-control")).toBe("public, s-maxage=3600, stale-while-revalidate=86400");
  });

  it("popular merges movie and tv by popularity", async () => {
    const r = await routes();
    fetchMock
      .mockResolvedValueOnce(json(200, { total_pages: 5, results: [{ id: 1, title: "M", popularity: 5 }] }))
      .mockResolvedValueOnce(json(200, { total_pages: 5, results: [{ id: 2, name: "T", popularity: 9 }] }));
    const body = await (await r.popular(req("/api/tmdb/popular?page=2"))).json();
    expect(body.items.map((i: { id: number }) => i.id)).toEqual([2, 1]);
    expect(body).toMatchObject({ page: 2, hasMore: true });
  });
});
