import type { LibraryItem, MediaType, Title } from "@/lib/types";

const IMG = "https://image.tmdb.org/t/p";

export function toNuvioType(t: MediaType): "movie" | "series" {
  return t === "tv" ? "series" : "movie";
}

export function fromNuvioType(t: string | null | undefined): MediaType | null {
  if (t === "movie") return "movie";
  if (t === "series") return "tv";
  return null;
}

/** What we can learn about a library item from its content_id. null for unknown id schemes or types. */
export type LibraryRef =
  | { mediaType: MediaType; imdb: string; tmdb?: undefined }
  | { mediaType: MediaType; tmdb: number; imdb?: undefined };

export function libraryItemToRef(item: { content_id: string; content_type: string }): LibraryRef | null {
  const mediaType = fromNuvioType(item.content_type);
  if (!mediaType || typeof item.content_id !== "string") return null;
  const imdb = /^(?:imdb:)?(tt\d+)$/.exec(item.content_id);
  if (imdb) return { mediaType, imdb: imdb[1] };
  const tmdb = /^tmdb:(\d+)$/.exec(item.content_id);
  if (tmdb) return { mediaType, tmdb: Number(tmdb[1]) };
  return null;
}

/**
 * Build the item to write. `title.imdbId` must have been resolved via lookup:
 * a string writes `tt...`, null (TMDB definitively has none) writes `tmdb:<id>`,
 * and undefined (never looked up) throws so we never write under a second key.
 */
export function titleToLibraryItem(title: Title, now: number = Date.now()): LibraryItem {
  if (title.imdbId === undefined) {
    throw new Error("IMDb id has not been resolved for this title");
  }
  const poster = title.posterUrl ? title.posterUrl.replace(/\/t\/p\/[^/]+\//, "/t/p/w500/") : null;
  const background = title.backdropUrl ? title.backdropUrl.replace(/\/t\/p\/[^/]+\//, "/t/p/w1280/") : null;
  const item: LibraryItem = {
    content_id: title.imdbId ? title.imdbId : `tmdb:${title.id}`,
    content_type: toNuvioType(title.mediaType),
    name: title.title,
    poster_shape: "POSTER",
    added_at: now,
  };
  if (poster) item.poster = poster;
  if (background) item.background = background;
  if (title.overview) item.description = title.overview;
  if (title.year) item.release_info = title.year;
  return item;
}

export { IMG as TMDB_IMAGE_BASE };

export function matchesTitle(item: { content_id: string; content_type: string }, title: Title): boolean {
  if (item.content_type !== toNuvioType(title.mediaType)) return false;
  const id = item.content_id;
  if (id === `tmdb:${title.id}`) return true;
  if (title.imdbId) return id === title.imdbId || id === `imdb:${title.imdbId}`;
  return false;
}
