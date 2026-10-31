"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { signOut } from "@/lib/nuvio/client";
import { LockIcon, ProfileDot, useProfiles } from "./Profiles";
import Wordmark from "./Wordmark";

function WatchlistsMenu() {
  const { profiles, loading, error } = useProfiles();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        ref.current?.querySelector<HTMLElement>("button")?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="btn-ghost flex items-center gap-1.5"
      >
        Watchlists
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 opacity-70" fill="currentColor">
          <path d="M5.5 7.5 10 12l4.5-4.5z" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Watchlists"
          className="absolute right-0 z-40 mt-2 w-64 max-w-[calc(100vw-2rem)] animate-fade-up rounded-2xl border border-white/10 bg-ink-800/95 p-1.5 shadow-card backdrop-blur-xl sm:left-0 sm:right-auto"
        >
          {profiles?.length ? (
            profiles.map((p) => (
              <Link
                key={p.profileIndex}
                role="menuitem"
                href={`/watchlist/${p.profileIndex}`}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/90 hover:bg-white/10"
              >
                <ProfileDot profile={p} className="h-3.5 w-3.5" />
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                {p.pinEnabled && <LockIcon />}
              </Link>
            ))
          ) : (
            <p className="px-3 py-2.5 text-sm text-white/50">
              {loading ? "Loading profiles…" : error ? "Profiles unavailable" : "No profiles found"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function Navbar() {
  const [busy, setBusy] = useState(false);
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-ink-950/80 backdrop-blur-xl">
      <nav aria-label="Main" className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/" aria-label="NuvioLink home">
          <Wordmark />
        </Link>
        <div className="flex items-center gap-2">
          <WatchlistsMenu />
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await signOut();
            }}
            className="btn-ghost"
          >
            Sign out
          </button>
        </div>
      </nav>
    </header>
  );
}
