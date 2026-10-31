"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { matchesTitle, titleToLibraryItem } from "@/lib/nuvio/mapping";
import { lookupTitle } from "@/lib/tmdb/client";
import type { Title } from "@/lib/types";
import ActionMenu from "./ActionMenu";

export default function TitleMenu({ title, anchor, onClose }: { title: Title; anchor: DOMRect | null; onClose: () => void }) {
  const [resolved, setResolved] = useState<Title | null | undefined>(undefined);
  const lookupRef = useRef<Promise<Title | null> | null>(null);

  function startLookup(): Promise<Title | null> {
    const p = lookupTitle({ type: title.mediaType, id: title.id });
    lookupRef.current = p;
    p.then((t) => setResolved(t)).catch(() => {
      if (lookupRef.current === p) lookupRef.current = null;
      setResolved(null);
    });
    return p;
  }

  // Resolve the IMDb id once on open; reused by the "already added" check and by add.
  useEffect(() => {
    startLookup().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const matchTitle = useMemo<Title>(() => (resolved ? { ...title, imdbId: resolved.imdbId ?? null } : title), [resolved, title]);

  async function buildItem() {
    let t: Title | null;
    try {
      t = await (lookupRef.current ?? startLookup());
    } catch {
      // The earlier lookup failed: try once more before giving up. Never write under a guessed key.
      t = await startLookup();
    }
    return titleToLibraryItem({ ...title, imdbId: t?.imdbId ?? null });
  }

  return (
    <ActionMenu
      name={title.title}
      meta={[title.year, title.mediaType === "tv" ? "TV" : "Movie"].filter(Boolean).join(" · ")}
      description={title.overview || (resolved === undefined ? undefined : resolved?.overview || null)}
      matches={(item) => matchesTitle(item, matchTitle)}
      buildItem={buildItem}
      anchor={anchor}
      onClose={onClose}
    />
  );
}
