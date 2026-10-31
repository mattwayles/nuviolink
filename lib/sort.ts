export type SortKey = "default" | "title" | "rating";
export type SortDir = "asc" | "desc";
export interface SortState {
  key: SortKey;
  dir: SortDir;
}

export const DEFAULT_SORT: SortState = { key: "default", dir: "desc" };

/** Natural direction when a key is first chosen. */
export function defaultDirFor(key: SortKey): SortDir {
  return key === "title" ? "asc" : "desc";
}

export interface SortAccessors<T> {
  title: (item: T) => string | null | undefined;
  /** null/undefined/0 all mean "not rated". */
  rating: (item: T) => number | null | undefined;
}

const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

/**
 * Returns a new array. "default" keeps the incoming order (desc) or reverses it (asc).
 * Items without a title / rating sort last in either direction.
 */
export function sortItems<T>(items: readonly T[], state: SortState, acc: SortAccessors<T>): T[] {
  const list = items.slice();
  if (state.key === "default") return state.dir === "asc" ? list.reverse() : list;
  const sign = state.dir === "asc" ? 1 : -1;
  const indexed = list.map((item, i) => ({ item, i }));
  indexed.sort((a, b) => {
    let c: number;
    if (state.key === "title") {
      const ta = acc.title(a.item)?.trim() || null;
      const tb = acc.title(b.item)?.trim() || null;
      if (ta === null || tb === null) return ta === tb ? a.i - b.i : ta === null ? 1 : -1;
      c = collator.compare(ta, tb) * sign;
    } else {
      const ra = acc.rating(a.item) || null;
      const rb = acc.rating(b.item) || null;
      if (ra === null || rb === null) return ra === rb ? a.i - b.i : ra === null ? 1 : -1;
      c = (ra - rb) * sign;
    }
    return c || a.i - b.i;
  });
  return indexed.map((x) => x.item);
}

function isSortState(v: unknown): v is SortState {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  return (
    (s.key === "default" || s.key === "title" || s.key === "rating") &&
    (s.dir === "asc" || s.dir === "desc")
  );
}

export function loadSort(storageKey: string): SortState {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isSortState(parsed)) return parsed;
    }
  } catch {
    // ignore
  }
  return DEFAULT_SORT;
}

export function saveSort(storageKey: string, state: SortState): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // ignore
  }
}
