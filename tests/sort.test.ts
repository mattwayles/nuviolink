import { describe, expect, it } from "vitest";
import { sortItems } from "@/lib/sort";

interface I { t: string | null; r: number | null }
const acc = { title: (i: I) => i.t, rating: (i: I) => i.r };
const items: I[] = [
  { t: "Banana", r: 5 },
  { t: "apple", r: null },
  { t: "Cherry", r: 9 },
  { t: null, r: 7 },
  { t: "Éclair", r: 0 },
];
const titles = (l: I[]) => l.map((i) => i.t);

describe("sortItems", () => {
  it("default keeps order desc and reverses asc", () => {
    expect(sortItems(items, { key: "default", dir: "desc" }, acc)).toEqual(items);
    expect(sortItems(items, { key: "default", dir: "asc" }, acc)).toEqual([...items].reverse());
  });

  it("does not mutate the input", () => {
    const copy = [...items];
    sortItems(items, { key: "title", dir: "asc" }, acc);
    expect(items).toEqual(copy);
  });

  it("sorts by title case/diacritic-insensitively with missing titles last in both directions", () => {
    expect(titles(sortItems(items, { key: "title", dir: "asc" }, acc))).toEqual(["apple", "Banana", "Cherry", "Éclair", null]);
    expect(titles(sortItems(items, { key: "title", dir: "desc" }, acc))).toEqual(["Éclair", "Cherry", "Banana", "apple", null]);
  });

  it("sorts by rating with null and 0 last in both directions", () => {
    const d = sortItems(items, { key: "rating", dir: "desc" }, acc);
    expect(d.map((i) => i.r).slice(0, 3)).toEqual([9, 7, 5]);
    expect(titles(d).slice(3)).toEqual(["apple", "Éclair"]);
    const a = sortItems(items, { key: "rating", dir: "asc" }, acc);
    expect(a.map((i) => i.r).slice(0, 3)).toEqual([5, 7, 9]);
    expect(titles(a).slice(3)).toEqual(["apple", "Éclair"]);
  });

  it("is stable for ties", () => {
    const tied: I[] = [{ t: "a", r: 5 }, { t: "b", r: 5 }, { t: "c", r: 5 }];
    expect(titles(sortItems(tied, { key: "rating", dir: "desc" }, acc))).toEqual(["a", "b", "c"]);
  });
});
