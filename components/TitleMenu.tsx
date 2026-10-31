"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addToLibrary, getCachedLibrary, getLibrary } from "@/lib/nuvio/client";
import { matchesTitle, titleToLibraryItem } from "@/lib/nuvio/mapping";
import { lookupTitle } from "@/lib/tmdb/client";
import type { LibraryItem, Title } from "@/lib/types";
import Overlay from "./Overlay";
import { LockIcon, ProfileDot, useProfiles } from "./Profiles";
import { useToast } from "./Toast";

function Spinner() {
  return <span aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/30 border-t-white" />;
}

export default function TitleMenu({ title, anchor, onClose }: { title: Title; anchor: DOMRect | null; onClose: () => void }) {
  const { profiles, error: profilesError, loading, reload } = useProfiles();
  const notify = useToast();
  const [libs, setLibs] = useState<Record<number, LibraryItem[]>>({});
  const [resolved, setResolved] = useState<Title | null | undefined>(undefined);
  const [adding, setAdding] = useState<Set<number>>(new Set());
  const [added, setAdded] = useState<Set<number>>(new Set());
  const lookupRef = useRef<Promise<Title | null> | null>(null);

  function startLookup(): Promise<Title | null> {
    const p = lookupTitle({ type: title.mediaType, id: title.id });
    lookupRef.current = p;
    p.then((t) => setResolved(t)).catch(() => {
      if (lookupRef.current === p) lookupRef.current = null;
    });
    return p;
  }

  // Resolve the IMDb id once on open; reused by the "already added" check and by add.
  useEffect(() => {
    startLookup().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lazily check every profile's library. Failures are ignored: they never block adding.
  useEffect(() => {
    if (!profiles) return;
    let cancelled = false;
    for (const p of profiles) {
      const cached = getCachedLibrary(p.profileIndex);
      if (cached) {
        setLibs((l) => ({ ...l, [p.profileIndex]: cached }));
        continue;
      }
      getLibrary(p.profileIndex)
        .then((items) => !cancelled && setLibs((l) => ({ ...l, [p.profileIndex]: items })))
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [profiles]);

  const matchTitle = useMemo<Title>(() => (resolved ? { ...title, imdbId: resolved.imdbId ?? null } : title), [resolved, title]);

  function isAdded(profileIndex: number): boolean {
    return added.has(profileIndex) || !!libs[profileIndex]?.some((i) => matchesTitle(i, matchTitle));
  }

  async function add(profileIndex: number, profileName: string) {
    if (adding.has(profileIndex) || isAdded(profileIndex)) return;
    setAdding((s) => new Set(s).add(profileIndex));
    try {
      let t: Title | null;
      try {
        t = await (lookupRef.current ?? startLookup());
      } catch {
        // The earlier lookup failed: try once more before giving up. Never write under a guessed key.
        t = await startLookup();
      }
      const item = titleToLibraryItem({ ...title, imdbId: t?.imdbId ?? null });
      await addToLibrary(profileIndex, item);
      setAdded((s) => new Set(s).add(profileIndex));
      notify(`Added "${title.title}" to ${profileName} Watchlist`, "success");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not add title", "error");
    } finally {
      setAdding((s) => {
        const n = new Set(s);
        n.delete(profileIndex);
        return n;
      });
    }
  }

  return (
    <Overlay label={`Add ${title.title} to a watchlist`} onClose={onClose} anchor={anchor}>
      <div className="flex items-start justify-between gap-3 px-3 pb-2 pt-3">
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-bold leading-tight">{title.title}</p>
          <p className="text-xs text-white/50">
            {[title.year, title.mediaType === "tv" ? "TV" : "Movie"].filter(Boolean).join(" · ")}
          </p>
        </div>
        <button type="button" aria-label="Close menu" onClick={onClose} className="rounded-full px-2 text-2xl leading-none text-white/50 hover:text-white">
          ×
        </button>
      </div>
      <ul role="menu" className="space-y-0.5">
        {profiles?.map((p) => {
          const done = isAdded(p.profileIndex);
          const busy = adding.has(p.profileIndex);
          return (
            <li key={p.profileIndex} role="none">
              <button
                type="button"
                role="menuitem"
                disabled={done || busy}
                aria-busy={busy}
                onClick={() => add(p.profileIndex, p.name)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm hover:bg-white/10 disabled:cursor-default disabled:hover:bg-transparent"
              >
                <ProfileDot profile={p} className="h-3.5 w-3.5" />
                <span className={`min-w-0 flex-1 truncate ${done ? "text-white/50" : "text-white"}`}>
                  {done ? `Already in ${p.name} Watchlist` : `Add to ${p.name} Watchlist`}
                </span>
                {p.pinEnabled && !done && !busy && <LockIcon />}
                {busy && <Spinner />}
                {done && !busy && (
                  <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5 shrink-0 text-emerald-400" fill="currentColor">
                    <path d="M8 14.4 3.6 10l1.4-1.4L8 11.6l7-7L16.4 6z" />
                  </svg>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {!profiles && (
        <p className="px-3 py-3 text-sm text-white/60">
          {loading ? "Loading profiles…" : (profilesError ?? "No profiles found")}
          {!loading && (
            <button type="button" onClick={reload} className="ml-2 underline">
              Retry
            </button>
          )}
        </p>
      )}
    </Overlay>
  );
}
