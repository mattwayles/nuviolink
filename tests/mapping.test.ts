import { describe, expect, it } from "vitest";
import { libraryItemToRef, matchesTitle, titleToLibraryItem } from "@/lib/nuvio/mapping";
import type { Title } from "@/lib/types";

const fightClub: Title = {
  id: 550,
  mediaType: "movie",
  title: "Fight Club",
  year: "1999",
  rating: 8.4,
  posterUrl: "https://image.tmdb.org/t/p/w500/p.jpg",
  backdropUrl: "https://image.tmdb.org/t/p/w1280/b.jpg",
  overview: "An insomniac...",
  popularity: 10,
  imdbId: "tt0137523",
};

describe("titleToLibraryItem", () => {
  it("writes the IMDb id, type mapping and expected fields", () => {
    expect(titleToLibraryItem(fightClub, 123)).toEqual({
      content_id: "tt0137523",
      content_type: "movie",
      name: "Fight Club",
      poster: "https://image.tmdb.org/t/p/w500/p.jpg",
      background: "https://image.tmdb.org/t/p/w1280/b.jpg",
      description: "An insomniac...",
      release_info: "1999",
      poster_shape: "POSTER",
      added_at: 123,
    });
  });

  it("maps tv to series and omits imdb_rating and undefined fields", () => {
    const item = titleToLibraryItem(
      { ...fightClub, mediaType: "tv", posterUrl: null, backdropUrl: null, overview: "", year: null },
      1,
    );
    expect(item.content_type).toBe("series");
    expect(Object.keys(item).sort()).toEqual(["added_at", "content_id", "content_type", "name", "poster_shape"]);
    expect("imdb_rating" in item).toBe(false);
  });

  it("normalizes poster/backdrop sizes to w500/w1280", () => {
    const item = titleToLibraryItem(
      { ...fightClub, posterUrl: "https://image.tmdb.org/t/p/original/p.jpg", backdropUrl: "https://image.tmdb.org/t/p/w300/b.jpg" },
      1,
    );
    expect(item.poster).toBe("https://image.tmdb.org/t/p/w500/p.jpg");
    expect(item.background).toBe("https://image.tmdb.org/t/p/w1280/b.jpg");
  });

  it("falls back to tmdb:<id> only when TMDB definitively has no IMDb id (null)", () => {
    expect(titleToLibraryItem({ ...fightClub, imdbId: null }, 1).content_id).toBe("tmdb:550");
  });

  it("throws when the IMDb id was never resolved (undefined), so nothing is written", () => {
    const { imdbId: _omit, ...unresolved } = fightClub;
    expect(() => titleToLibraryItem(unresolved as Title)).toThrow();
  });
});

describe("libraryItemToRef", () => {
  it("parses tt, imdb: and tmdb: ids with the right media type", () => {
    expect(libraryItemToRef({ content_id: "tt0137523", content_type: "movie" })).toEqual({ mediaType: "movie", imdb: "tt0137523" });
    expect(libraryItemToRef({ content_id: "imdb:tt0944947", content_type: "series" })).toEqual({ mediaType: "tv", imdb: "tt0944947" });
    expect(libraryItemToRef({ content_id: "tmdb:550", content_type: "movie" })).toEqual({ mediaType: "movie", tmdb: 550 });
  });

  it("tolerates unknown schemes and types by returning null", () => {
    expect(libraryItemToRef({ content_id: "kitsu:123", content_type: "series" })).toBeNull();
    expect(libraryItemToRef({ content_id: "yt:abc", content_type: "movie" })).toBeNull();
    expect(libraryItemToRef({ content_id: "tt123", content_type: "channel" })).toBeNull();
    expect(libraryItemToRef({ content_id: "tmdb:abc", content_type: "movie" })).toBeNull();
    expect(libraryItemToRef({ content_id: "", content_type: "movie" })).toBeNull();
  });
});

describe("matchesTitle", () => {
  it("matches tt, imdb: and tmdb: ids of the same type", () => {
    expect(matchesTitle({ content_id: "tt0137523", content_type: "movie" }, fightClub)).toBe(true);
    expect(matchesTitle({ content_id: "imdb:tt0137523", content_type: "movie" }, fightClub)).toBe(true);
    expect(matchesTitle({ content_id: "tmdb:550", content_type: "movie" }, fightClub)).toBe(true);
  });

  it("requires the content type to match", () => {
    expect(matchesTitle({ content_id: "tt0137523", content_type: "series" }, fightClub)).toBe(false);
    expect(matchesTitle({ content_id: "tmdb:550", content_type: "series" }, fightClub)).toBe(false);
  });

  it("rejects other ids and unknown schemes", () => {
    expect(matchesTitle({ content_id: "tt1", content_type: "movie" }, fightClub)).toBe(false);
    expect(matchesTitle({ content_id: "tmdb:551", content_type: "movie" }, fightClub)).toBe(false);
    expect(matchesTitle({ content_id: "kitsu:550", content_type: "movie" }, fightClub)).toBe(false);
  });

  it("matches only tmdb ids when the title has no imdb id", () => {
    const t = { ...fightClub, imdbId: null };
    expect(matchesTitle({ content_id: "tmdb:550", content_type: "movie" }, t)).toBe(true);
    expect(matchesTitle({ content_id: "tt0137523", content_type: "movie" }, t)).toBe(false);
  });
});
