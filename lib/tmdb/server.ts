import type { MediaType, Title } from "@/lib/types";

const TMDB_BASE = "https://api.themoviedb.org/3";
const IMG_BASE = "https://image.tmdb.org/t/p";
const MAX_PAGE = 500;

/** Thrown for any upstream failure. The message is generic and never contains the key or URL. */
export class TmdbError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "TmdbError";
    this.status = status;
  }
}

function apiKey(): string {
  const key = process.env.TMDB_API_KEY;
  if (!key) throw new TmdbError("TMDB is not configured", 500);
  return key;
}

function redact(text: string, key: string | undefined): string {
  let out = text.replace(/api_key=[^&\s"']*/gi, "api_key=REDACTED");
  if (key) out = out.split(key).join("REDACTED");
  return out;
}

export async function tmdb<T = Record<string, unknown>>(
  path: string,
  params: Record<string, string | number | undefined> = {},
  retries = 2,
): Promise<T> {
  const key = apiKey();
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("api_key", key);
  url.searchParams.set("language", "en-US");
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }

  let status = 502;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 400 * attempt));
    let res: Response;
    try {
      res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
    } catch (e) {
      console.error(`TMDB ${path} network error:`, redact(e instanceof Error ? e.message : String(e), key));
      status = 502;
      continue;
    }
    if (res.ok) return (await res.json()) as T;
    status = res.status;
    console.error(`TMDB ${path} failed with ${res.status}`);
    if (res.status < 500) break;
  }
  // Normalize: 404 stays 404, everything else is a 502 (500 is reserved for our own misconfiguration).
  throw new TmdbError(status === 404 ? "Not found" : "TMDB request failed", status === 404 ? 404 : 502);
}

export function imageUrl(path: string | null | undefined, size: string): string | null {
  return path ? `${IMG_BASE}/${size}${path}` : null;
}

interface RawTitle {
  id: number;
  media_type?: string;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  popularity?: number;
  poster_path?: string | null;
  backdrop_path?: string | null;
  imdb_id?: string | null;
  external_ids?: { imdb_id?: string | null };
}

function toTitle(raw: RawTitle, mediaType: MediaType): Title {
  const date = mediaType === "movie" ? raw.release_date : raw.first_air_date;
  return {
    id: raw.id,
    mediaType,
    title: (mediaType === "movie" ? raw.title : raw.name) || raw.title || raw.name || "Untitled",
    year: date && /^\d{4}/.test(date) ? date.slice(0, 4) : null,
    rating: raw.vote_average ? Math.round(raw.vote_average * 10) / 10 : null,
    posterUrl: imageUrl(raw.poster_path, "w500"),
    backdropUrl: imageUrl(raw.backdrop_path, "w1280"),
    overview: raw.overview ?? "",
    popularity: raw.popularity ?? 0,
  };
}

interface Paged {
  results?: RawTitle[];
  total_pages?: number;
}

export interface TitlePage {
  items: Title[];
  page: number;
  hasMore: boolean;
}

export async function popular(page: number): Promise<TitlePage> {
  const [m, t] = await Promise.all([
    tmdb<Paged>("/movie/popular", { page }),
    tmdb<Paged>("/tv/popular", { page }),
  ]);
  const items = [
    ...(m.results ?? []).map((r) => toTitle(r, "movie")),
    ...(t.results ?? []).map((r) => toTitle(r, "tv")),
  ].sort((a, b) => b.popularity - a.popularity);
  const total = Math.min(Math.max(m.total_pages ?? 0, t.total_pages ?? 0), MAX_PAGE);
  return { items, page, hasMore: page < total };
}

// --- search filtering -------------------------------------------------------

const STOPWORDS = new Set(["the", "a", "an", "of", "and", "in", "on", "to", "for", "is", "at", "by"]);

export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when any candidate contains the whole query or at least one significant query word. */
export function matchesQuery(query: string, candidates: Array<string | undefined | null>): boolean {
  const q = normalizeText(query);
  if (!q) return false;
  const haystacks = candidates.filter((c): c is string => !!c).map(normalizeText);
  if (haystacks.some((h) => h.includes(q))) return true;
  const words = q.split(" ");
  const significant = words.filter((w) => w.length >= 2 && !STOPWORDS.has(w));
  if (significant.length === 0) return false; // stopword-only query already failed the whole-query check
  return haystacks.some((h) => {
    const hw = new Set(h.split(" "));
    return significant.some((w) => hw.has(w) || h.includes(w));
  });
}

export async function search(q: string, page: number): Promise<TitlePage> {
  const data = await tmdb<Paged>("/search/multi", { query: q, page, include_adult: "false" });
  const items: Title[] = [];
  for (const r of data.results ?? []) {
    if (r.media_type !== "movie" && r.media_type !== "tv") continue;
    const type = r.media_type as MediaType;
    if (!matchesQuery(q, [r.title, r.name, r.original_title, r.original_name])) continue;
    items.push(toTitle(r, type));
  }
  return { items, page, hasMore: page < Math.min(data.total_pages ?? 0, MAX_PAGE) };
}

export type LookupQuery =
  | { type: MediaType; id: number }
  | { type?: MediaType; imdb: string };

async function details(type: MediaType, id: number): Promise<Title | null> {
  try {
    const raw = await tmdb<RawTitle>(`/${type}/${id}`, { append_to_response: "external_ids" });
    const title = toTitle(raw, type);
    title.imdbId = raw.external_ids?.imdb_id || raw.imdb_id || null;
    return title;
  } catch (e) {
    if (e instanceof TmdbError && e.status === 404) return null;
    throw e;
  }
}

export async function lookup(q: LookupQuery): Promise<Title | null> {
  if ("id" in q) return details(q.type, q.id);
  const found = await tmdb<{ movie_results?: RawTitle[]; tv_results?: RawTitle[] }>(
    `/find/${encodeURIComponent(q.imdb)}`,
    { external_source: "imdb_id" },
  );
  const movie = found.movie_results?.[0];
  const tv = found.tv_results?.[0];
  const order: Array<[MediaType, RawTitle | undefined]> =
    q.type === "tv" ? [["tv", tv], ["movie", movie]] : [["movie", movie], ["tv", tv]];
  const hit = (q.type ? order.find(([t, r]) => t === q.type && r) : undefined) ?? order.find(([, r]) => r);
  if (!hit || !hit[1]) return null;
  const title = await details(hit[0], hit[1].id);
  if (title && !title.imdbId) title.imdbId = q.imdb;
  return title;
}
