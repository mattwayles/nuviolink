"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_SORT,
  defaultDirFor,
  loadSort,
  saveSort,
  type SortKey,
  type SortState,
} from "@/lib/sort";

/** Sort state persisted in localStorage; loaded after mount so SSR and first render agree. */
export function useSort(storageKey: string): [SortState, (s: SortState) => void] {
  const [state, setState] = useState<SortState>(DEFAULT_SORT);
  useEffect(() => setState(loadSort(storageKey)), [storageKey]);
  return [
    state,
    (s) => {
      setState(s);
      saveSort(storageKey, s);
    },
  ];
}

export default function SortControl({
  value,
  onChange,
  defaultLabel,
}: {
  value: SortState;
  onChange: (s: SortState) => void;
  defaultLabel: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <label className="flex items-center gap-2 text-white/60">
        <span>Sort</span>
        <select
          aria-label="Sort by"
          value={value.key}
          onChange={(e) => {
            const key = e.target.value as SortKey;
            onChange({ key, dir: defaultDirFor(key) });
          }}
          className="rounded-full border border-white/10 bg-ink-800 px-3 py-2 text-white"
        >
          <option value="default">{defaultLabel}</option>
          <option value="title">Title</option>
          <option value="rating">Rating</option>
        </select>
      </label>
      <button
        type="button"
        aria-label={value.dir === "asc" ? "Ascending order, switch to descending" : "Descending order, switch to ascending"}
        onClick={() => onChange({ ...value, dir: value.dir === "asc" ? "desc" : "asc" })}
        className="btn-ghost px-3"
      >
        <span aria-hidden="true">{value.dir === "asc" ? "↑" : "↓"}</span>
      </button>
    </div>
  );
}
