"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sortItems } from "@/lib/sort";
import { fetchPopular, searchTitles } from "@/lib/tmdb/client";
import type { Title } from "@/lib/types";
import SearchBar from "./SearchBar";
import SortControl, { useSort } from "./SortControl";
import TitleCard, { SkeletonGrid } from "./TitleCard";
import TitleMenu from "./TitleMenu";

interface ListState {
  items: Title[];
  page: number;
  hasMore: boolean;
  loading: boolean;
  error: string | null;
}

const EMPTY: ListState = { items: [], page: 0, hasMore: false, loading: true, error: null };

function merge(a: Title[], b: Title[]): Title[] {
  const seen = new Set(a.map((t) => `${t.mediaType}:${t.id}`));
  return [...a, ...b.filter((t) => !seen.has(`${t.mediaType}:${t.id}`))];
}

export default function Browse() {
  const router = useRouter();
  const params = useSearchParams();
  const initial = params.get("q") ?? "";
  const [input, setInput] = useState(initial);
  const [q, setQ] = useState(initial.trim());
  const [list, setList] = useState<ListState>(EMPTY);
  const [sort, setSort] = useSort("nuviolink.sort.tmdb");
  const [menu, setMenu] = useState<{ title: Title; anchor: DOMRect } | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  // Debounce typing by 300ms.
  useEffect(() => {
    if (input.trim() === q) return;
    const t = setTimeout(() => setQ(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input, q]);

  // Keep the URL in sync (replace, so back button leaves the page).
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    router.replace(q ? `/?q=${encodeURIComponent(q)}` : "/", { scroll: false });
  }, [q, router]);

  const load = useCallback(async (query: string, page: number, reset: boolean) => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setList((s) => (reset ? { ...EMPTY } : { ...s, loading: true, error: null }));
    try {
      const r = query ? await searchTitles(query, page, c.signal) : await fetchPopular(page, c.signal);
      if (c.signal.aborted) return;
      setList((s) => ({
        items: reset ? r.items : merge(s.items, r.items),
        page: r.page,
        hasMore: r.hasMore,
        loading: false,
        error: null,
      }));
    } catch (e) {
      if (c.signal.aborted) return;
      setList((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : "Something went wrong" }));
    }
  }, []);

  useEffect(() => {
    load(q, 1, true);
    return () => ctrl.current?.abort();
  }, [q, load]);

  // Infinite scroll.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !list.hasMore || list.loading || list.error) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) load(q, list.page + 1, false);
      },
      { rootMargin: "400px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [list.hasMore, list.loading, list.error, list.page, q, load]);

  const shown = useMemo(
    () => sortItems(list.items, sort, { title: (t) => t.title, rating: (t) => t.rating }),
    [list.items, sort],
  );

  return (
    <div>
      <section className="mx-auto max-w-2xl pb-8 pt-10 text-center sm:pt-16">
        <h1 className="font-display text-3xl font-bold text-glow sm:text-5xl">What should go on the list?</h1>
        <p className="mb-6 mt-3 text-sm text-white/60 sm:text-base">
          Search any movie or show and add it to a Nuvio profile.
        </p>
        <SearchBar
          large
          autoFocus
          value={input}
          onChange={(v) => {
            setInput(v);
            if (!v.trim()) setQ("");
          }}
          label="Search movies and TV shows"
          placeholder="Search movies and TV shows"
        />
      </section>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold">{q ? `Results for “${q}”` : "Popular right now"}</h2>
        <SortControl value={sort} onChange={setSort} defaultLabel={q ? "Relevance" : "Popular"} />
      </div>

      {list.error && (
        <div role="alert" className="mb-4 flex items-center gap-3 rounded-2xl border border-red-400/30 bg-red-950/60 px-4 py-3 text-sm text-red-200">
          <span className="flex-1">{list.error}</span>
          <button type="button" className="btn-ghost py-1" onClick={() => load(q, list.items.length ? list.page + 1 : 1, list.items.length === 0)}>
            Retry
          </button>
        </div>
      )}

      {list.loading && list.items.length === 0 ? (
        <SkeletonGrid />
      ) : shown.length === 0 && !list.error ? (
        <p className="py-16 text-center text-white/60">{q ? `No results for “${q}”.` : "Nothing to show."}</p>
      ) : (
        <div className="grid-titles">
          {shown.map((t) => (
            <TitleCard
              key={`${t.mediaType}-${t.id}`}
              title={t.title}
              year={t.year}
              posterUrl={t.posterUrl}
              rating={t.rating}
              badge={t.mediaType === "tv" ? "TV" : "Movie"}
              onActivate={(anchor) => setMenu({ title: t, anchor })}
            />
          ))}
        </div>
      )}

      <div ref={sentinel} className="h-px" />
      {list.loading && list.items.length > 0 && <p className="py-6 text-center text-sm text-white/50">Loading…</p>}
      {list.hasMore && !list.loading && !list.error && (
        <div className="py-8 text-center">
          <button type="button" className="btn-ghost" onClick={() => load(q, list.page + 1, false)}>
            Load more
          </button>
        </div>
      )}

      {menu && <TitleMenu title={menu.title} anchor={menu.anchor} onClose={() => setMenu(null)} />}
    </div>
  );
}
