import type { MediaType, Title } from "@/lib/types";

export interface TitlePage {
  items: Title[];
  page: number;
  hasMore: boolean;
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<{ status: number; data: T | null }> {
  const res = await fetch(url, { signal });
  if (res.status === 404) return { status: 404, data: null };
  if (!res.ok) throw new Error("Could not load titles from TMDB. Please try again.");
  return { status: res.status, data: (await res.json()) as T };
}

export async function fetchPopular(page = 1, signal?: AbortSignal): Promise<TitlePage> {
  const { data } = await getJson<TitlePage>(`/api/tmdb/popular?page=${page}`, signal);
  return data as TitlePage;
}

export async function searchTitles(q: string, page = 1, signal?: AbortSignal): Promise<TitlePage> {
  const { data } = await getJson<TitlePage>(
    `/api/tmdb/search?q=${encodeURIComponent(q)}&page=${page}`,
    signal,
  );
  if (!data) throw new Error("Search failed. Please try again.");
  return data;
}

export type LookupArgs =
  | { type: MediaType; id: number }
  | { type?: MediaType; imdb: string };

/** Resolves to null when TMDB definitively does not know the title; throws on any failure. */
export async function lookupTitle(args: LookupArgs, signal?: AbortSignal): Promise<Title | null> {
  const p = new URLSearchParams();
  if (args.type) p.set("type", args.type);
  if ("id" in args) p.set("id", String(args.id));
  else p.set("imdb", args.imdb);
  const { data } = await getJson<Title>(`/api/tmdb/lookup?${p}`, signal);
  return data;
}
