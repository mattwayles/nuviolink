export type MediaType = "movie" | "tv";

export interface Title {
  id: number;
  mediaType: MediaType;
  title: string;
  year: string | null;
  rating: number | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  overview: string;
  popularity: number;
  imdbId?: string | null;
}

export interface Profile {
  id: string;
  profileIndex: number;
  name: string;
  avatarColorHex: string | null;
  avatarUrl: string | null;
  pinEnabled: boolean;
}

export interface LibraryKey {
  content_id: string;
  content_type: string;
}

export interface LibraryItem extends LibraryKey {
  name?: string | null;
  poster?: string | null;
  poster_shape?: string | null;
  background?: string | null;
  description?: string | null;
  release_info?: string | null;
  imdb_rating?: number | null;
  genres?: string[] | null;
  addon_base_url?: string | null;
  added_at?: number | null;
}

export interface Session {
  access_token: string;
  refresh_token: string;
  /** Epoch seconds. */
  expires_at: number;
  user: { id: string; email?: string | null };
}
