"use client";

import { useEffect, useState } from "react";
import { addToLibrary, getCachedLibrary, getLibrary } from "@/lib/nuvio/client";
import type { LibraryItem, Profile } from "@/lib/types";
import Overlay from "./Overlay";
import { LockIcon, ProfileDot, useProfiles } from "./Profiles";
import { TitleDescription } from "./TitleCard";
import { useToast } from "./Toast";

function Spinner() {
  return <span aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/30 border-t-white" />;
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5 shrink-0 text-emerald-400" fill="currentColor">
      <path d="M8 14.4 3.6 10l1.4-1.4L8 11.6l7-7L16.4 6z" />
    </svg>
  );
}

function MenuRow({
  profile,
  label,
  done,
  busy,
  danger,
  onSelect,
}: {
  profile: Profile;
  label: string;
  done: boolean;
  busy: boolean;
  danger?: boolean;
  onSelect: () => void;
}) {
  const tone = done ? "text-white/50" : "text-white";
  const surface = danger && !done ? "bg-red-900 hover:bg-red-800 disabled:opacity-60" : "hover:bg-white/10 disabled:hover:bg-transparent";
  return (
    <li role="none">
      <button
        type="button"
        role="menuitem"
        disabled={done || busy}
        aria-busy={busy}
        onClick={onSelect}
        className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm disabled:cursor-default ${surface}`}
      >
        {!danger && <ProfileDot profile={profile} className="h-3.5 w-3.5" />}
        <span className={`min-w-0 flex-1 truncate ${tone}`}>{label}</span>
        {profile.pinEnabled && !done && !busy && <LockIcon />}
        {busy && <Spinner />}
        {done && !busy && <CheckIcon />}
      </button>
    </li>
  );
}

export interface MenuRemoval {
  profile: Profile;
  removed: boolean;
  run: () => Promise<void>;
}

/** The menu for a clicked title. Selecting a row keeps it open; only close, Esc or the backdrop dismiss it. */
export default function ActionMenu({
  name,
  meta,
  description,
  matches,
  buildItem,
  removal,
  anchor,
  onClose,
}: {
  name: string;
  meta: string;
  description: string | null | undefined;
  matches: (item: LibraryItem) => boolean;
  buildItem: () => Promise<LibraryItem>;
  removal?: MenuRemoval;
  anchor: DOMRect | null;
  onClose: () => void;
}) {
  const { profiles, error: profilesError, loading, reload } = useProfiles();
  const notify = useToast();
  const [libs, setLibs] = useState<Record<number, LibraryItem[]>>({});
  const [adding, setAdding] = useState<Set<number>>(new Set());
  const [added, setAdded] = useState<Set<number>>(new Set());
  const [removing, setRemoving] = useState(false);

  const addTargets = profiles?.filter((p) => p.profileIndex !== removal?.profile.profileIndex);

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

  function isAdded(profileIndex: number): boolean {
    return added.has(profileIndex) || !!libs[profileIndex]?.some(matches);
  }

  async function add(profile: Profile) {
    if (adding.has(profile.profileIndex) || isAdded(profile.profileIndex)) return;
    setAdding((s) => new Set(s).add(profile.profileIndex));
    try {
      await addToLibrary(profile.profileIndex, await buildItem());
      setAdded((s) => new Set(s).add(profile.profileIndex));
      notify(`Added "${name}" to ${profile.name} Watchlist`, "success");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not add title", "error");
    } finally {
      setAdding((s) => {
        const n = new Set(s);
        n.delete(profile.profileIndex);
        return n;
      });
    }
  }

  async function remove() {
    if (!removal || removing || removal.removed) return;
    setRemoving(true);
    try {
      await removal.run();
    } finally {
      setRemoving(false);
    }
  }

  return (
    <Overlay label={`${name} options`} onClose={onClose} anchor={anchor}>
      <div className="flex items-start justify-between gap-3 px-3 pb-2 pt-3">
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-bold leading-tight">{name}</p>
          <p className="text-xs text-white/50">{meta}</p>
        </div>
        <button type="button" aria-label="Close menu" onClick={onClose} className="rounded-full px-2 text-2xl leading-none text-white/50 hover:text-white">
          ×
        </button>
      </div>
      <div className="px-3 pb-3">
        <TitleDescription text={description} />
      </div>
      <ul role="menu" className="space-y-0.5">
        {addTargets?.map((p) => {
          const done = isAdded(p.profileIndex);
          return (
            <MenuRow
              key={p.profileIndex}
              profile={p}
              label={done ? `Already in ${p.name} Watchlist` : `Add to ${p.name} Watchlist`}
              done={done}
              busy={adding.has(p.profileIndex)}
              onSelect={() => add(p)}
            />
          );
        })}
        {removal && (
          <MenuRow
            profile={removal.profile}
            label={removal.removed ? `Removed from ${removal.profile.name} Watchlist` : `Remove from ${removal.profile.name} Watchlist`}
            done={removal.removed}
            busy={removing}
            danger
            onSelect={remove}
          />
        )}
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
