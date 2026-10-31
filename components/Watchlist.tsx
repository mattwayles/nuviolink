"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { addToLibrary, getCachedLibrary, getLibrary, removeFromLibrary } from "@/lib/nuvio/client";
import { fromNuvioType, libraryItemToRef, matchesTitle } from "@/lib/nuvio/mapping";
import { sortItems } from "@/lib/sort";
import { lookupTitle } from "@/lib/tmdb/client";
import type { LibraryItem, Profile, Title } from "@/lib/types";
import ActionMenu from "./ActionMenu";
import { useProfiles } from "./Profiles";
import SearchBar from "./SearchBar";
import SortControl, { useSort } from "./SortControl";
import TitleCard, { SkeletonGrid } from "./TitleCard";
import { useToast } from "./Toast";

const keyOf = (i: LibraryItem) => `${i.content_type}:${i.content_id}`;

const enrichCache = new Map<string, Title | null>();
const enrichPending = new Map<string, Promise<Title | null>>();

function enrich(item: LibraryItem): Promise<Title | null> {
  const key = keyOf(item);
  const pending = enrichPending.get(key);
  if (pending) return pending;
  const ref = libraryItemToRef(item);
  const p = (ref
    ? lookupTitle(typeof ref.imdb === "string" ? { type: ref.mediaType, imdb: ref.imdb } : { type: ref.mediaType, id: ref.tmdb as number })
    : Promise.resolve(null)
  )
    .catch(() => null)
    .then((t) => {
      enrichCache.set(key, t);
      return t;
    });
  enrichPending.set(key, p);
  return p;
}

const needsEnrichment = (i: LibraryItem) => (!(i.imdb_rating && i.imdb_rating > 0) || !i.poster) && !!libraryItemToRef(i);

/** Lazily fills missing ratings/posters via TMDB lookup, 6 at a time. Failures quietly stay NR. */
function useEnrichment(items: LibraryItem[]): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const todo = items.filter((i) => needsEnrichment(i) && !enrichCache.has(keyOf(i)));
    let next = 0;
    const worker = async () => {
      while (!cancelled && next < todo.length) {
        await enrich(todo[next++]);
        if (!cancelled) setVersion((v) => v + 1);
      }
    };
    for (let n = 0; n < 6; n++) void worker();
    return () => {
      cancelled = true;
    };
  }, [items]);
  return version;
}

function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function BackHome() {
  return (
    <Link href="/" className="btn-ghost inline-flex items-center gap-2 py-1.5">
      <span aria-hidden="true">←</span> Back to home
    </Link>
  );
}

function ItemMenu({
  item,
  profile,
  removed,
  onRemove,
  anchor,
  onClose,
}: {
  item: LibraryItem;
  profile: Profile;
  removed: boolean;
  onRemove: () => Promise<void>;
  anchor: DOMRect | null;
  onClose: () => void;
}) {
  const [resolved, setResolved] = useState<Title | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    enrich(item).then((t) => !cancelled && setResolved(t));
    return () => {
      cancelled = true;
    };
  }, [item]);

  const type = fromNuvioType(item.content_type);
  return (
    <ActionMenu
      name={item.name || item.content_id}
      meta={[item.release_info, type === "tv" ? "TV" : type === "movie" ? "Movie" : null].filter(Boolean).join(" · ")}
      description={item.description || (resolved === undefined ? undefined : resolved?.overview || null)}
      matches={(i) => keyOf(i) === keyOf(item) || (!!resolved && matchesTitle(i, resolved))}
      // Copy the exact content id so the title stays one identity across profiles.
      buildItem={async () => ({ ...item, added_at: Date.now() })}
      removal={{ profile, removed, run: onRemove }}
      anchor={anchor}
      onClose={onClose}
    />
  );
}

export default function Watchlist() {
  const params = useParams<{ index: string }>();
  const raw = params.index;
  const index = /^\d+$/.test(raw ?? "") ? Number(raw) : NaN;
  const { profiles, loading: profilesLoading, error: profilesError } = useProfiles();
  const profile = profiles?.find((p) => p.profileIndex === index);
  const notify = useToast();

  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useSort("nuviolink.sort.watchlist");
  const [menu, setMenu] = useState<{ item: LibraryItem; anchor: DOMRect } | null>(null);

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    setItems(getCachedLibrary(index) ?? null);
    setError(null);
    getLibrary(index)
      .then((l) => !cancelled && setItems(l))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Could not load watchlist"));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.profileIndex, attempt]);

  useEffect(() => {
    document.title = profile ? `${profile.name} Watchlist | NuvioLink` : "Watchlist | NuvioLink";
  }, [profile]);

  const version = useEnrichment(items ?? []);

  const view = useMemo(() => {
    void version;
    const rows = (items ?? []).map((item) => {
      const e = enrichCache.get(keyOf(item));
      return {
        item,
        name: item.name || item.content_id,
        poster: item.poster || e?.posterUrl || null,
        rating: item.imdb_rating && item.imdb_rating > 0 ? item.imdb_rating : (e?.rating ?? null),
      };
    });
    const byAdded = rows.sort((a, b) => (b.item.added_at ?? 0) - (a.item.added_at ?? 0));
    const q = norm(filter.trim());
    const filtered = q ? byAdded.filter((r) => norm(r.name).includes(q)) : byAdded;
    return sortItems(filtered, sort, { title: (r) => r.name, rating: (r) => r.rating });
  }, [items, filter, sort, version]);

  async function remove(original: LibraryItem) {
    if (!profile) return;
    try {
      await removeFromLibrary(profile.profileIndex, { content_id: original.content_id, content_type: original.content_type });
      setItems((l) => l && l.filter((i) => keyOf(i) !== keyOf(original)));
      const name = original.name || original.content_id;
      notify(`Removed "${name}" from ${profile.name} Watchlist`, "success", {
        durationMs: 8000,
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              await addToLibrary(profile.profileIndex, original);
              setItems((l) => (l ? [original, ...l.filter((i) => keyOf(i) !== keyOf(original))] : l));
              notify(`Restored "${name}" to ${profile.name} Watchlist`, "success");
            } catch (e) {
              notify(e instanceof Error ? e.message : "Could not undo", "error");
            }
          },
        },
      });
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not remove title", "error");
    }
  }

  if (!profile) {
    if (profilesLoading) {
      return (
        <div className="pt-10">
          <SkeletonGrid />
        </div>
      );
    }
    return (
      <div className="pt-6">
        <BackHome />
        <div role="alert" className="mx-auto mt-10 max-w-md rounded-2xl border border-red-400/30 bg-red-950/60 p-6 text-center text-red-200">
          <h1 className="font-display text-xl font-bold">Profile not found</h1>
          <p className="mt-2 text-sm">
            {profilesError ? "Your profiles could not be loaded." : `There is no profile with index “${raw}” on this account.`} Pick one from the
            Watchlists menu.
          </p>
        </div>
      </div>
    );
  }

  const total = items?.length ?? 0;

  return (
    <div>
      <section className="pb-6 pt-6">
        <div className="mb-5">
          <BackHome />
        </div>
        <div className="mb-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="font-display text-3xl font-bold text-glow">{profile.name} Watchlist</h1>
          {items && (
            <span className="text-sm text-white/50" data-testid="count">
              {filter.trim() ? `${view.length} of ${total}` : total} {total === 1 ? "title" : "titles"}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full sm:max-w-xl">
            <SearchBar value={filter} onChange={setFilter} label="Filter this watchlist" placeholder={`Filter ${profile.name}'s watchlist`} />
          </div>
          <SortControl value={sort} onChange={setSort} defaultLabel="Recently added" />
        </div>
      </section>

      {error ? (
        <div role="alert" className="flex items-center gap-3 rounded-2xl border border-red-400/30 bg-red-950/60 px-4 py-3 text-sm text-red-200">
          <span className="flex-1">{error}</span>
          <button type="button" className="btn-ghost py-1" onClick={() => setAttempt((a) => a + 1)}>
            Retry
          </button>
        </div>
      ) : items === null ? (
        <SkeletonGrid />
      ) : view.length === 0 ? (
        <p className="py-16 text-center text-white/60">
          {filter.trim() ? `No titles match “${filter.trim()}”.` : "This watchlist is empty. Find something on the home page."}
        </p>
      ) : (
        <div className="grid-titles">
          {view.map((r) => (
            <TitleCard
              key={keyOf(r.item)}
              title={r.name}
              year={r.item.release_info}
              posterUrl={r.poster}
              rating={r.rating}
              badge={fromNuvioType(r.item.content_type) === "tv" ? "TV" : fromNuvioType(r.item.content_type) === "movie" ? "Movie" : null}
              onActivate={(anchor) => setMenu({ item: r.item, anchor })}
            />
          ))}
        </div>
      )}

      {menu && (
        <ItemMenu
          item={menu.item}
          profile={profile}
          removed={!items?.some((i) => keyOf(i) === keyOf(menu.item))}
          onRemove={() => remove(menu.item)}
          anchor={menu.anchor}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
