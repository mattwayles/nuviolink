import { vi } from "vitest";

export const NOW_S = 1_800_000_000;

export function installBrowser(opts: { locks?: boolean } = {}) {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
  const handlers = new Map<string, Set<(e: unknown) => void>>();
  const win = {
    addEventListener: (t: string, h: (e: unknown) => void) => {
      if (!handlers.has(t)) handlers.set(t, new Set());
      handlers.get(t)!.add(h);
    },
    removeEventListener: (t: string, h: (e: unknown) => void) => void handlers.get(t)?.delete(h),
  };
  vi.stubGlobal("localStorage", localStorage);
  vi.stubGlobal("window", win);
  if (opts.locks !== false) {
    // Minimal Web Locks: serialize callbacks per name.
    let tail: Promise<unknown> = Promise.resolve();
    vi.stubGlobal("navigator", {
      locks: {
        request: (_name: string, fn: () => Promise<unknown>) => {
          const run = tail.then(fn, fn);
          tail = run.catch(() => undefined);
          return run;
        },
      },
    });
  } else {
    vi.stubGlobal("navigator", {});
  }
  return {
    store,
    emit: (type: string, e: unknown) => handlers.get(type)?.forEach((h) => h(e)),
  };
}

export function session(over: Record<string, unknown> = {}) {
  return {
    access_token: "acc-1",
    refresh_token: "ref-1",
    expires_at: NOW_S + 3600,
    user: { id: "u1", email: "a@b.c" },
    ...over,
  };
}

export function json(status: number, body: unknown = {}): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), { status });
}

export function tokenBody(n: number) {
  return {
    access_token: `acc-${n}`,
    refresh_token: `ref-${n}`,
    expires_in: 3600,
    user: { id: "u1", email: "a@b.c" },
  };
}
