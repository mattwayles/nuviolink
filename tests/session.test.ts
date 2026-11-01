import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NOW_S, installBrowser, json, session, tokenBody } from "./helpers";

type Fetch = ReturnType<typeof vi.fn>;
let fetchMock: Fetch;
let env: ReturnType<typeof installBrowser>;

async function load(opts?: { locks?: boolean }) {
  vi.resetModules();
  env = installBrowser(opts);
  return import("@/lib/nuvio/session");
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW_S * 1000);
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const stored = (env0: typeof env) => JSON.parse(env0.store.get("nuviolink.session")!);

describe("getAccessToken", () => {
  it("returns the stored token without a request when >60s remain", async () => {
    const s = await load();
    s.saveSession(session());
    expect(await s.getAccessToken()).toBe("acc-1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes and persists the rotated refresh token when <60s remain", async () => {
    const s = await load();
    s.saveSession(session({ expires_at: NOW_S + 30 }));
    fetchMock.mockResolvedValueOnce(json(200, tokenBody(2)));
    expect(await s.getAccessToken()).toBe("acc-2");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.nuvio.tv/auth/v1/token?grant_type=refresh_token");
    expect(JSON.parse(init.body)).toEqual({ refresh_token: "ref-1" });
    expect(init.headers.apikey).toMatch(/^sb_publishable_/);
    const saved = stored(env);
    expect(saved.refresh_token).toBe("ref-2");
    expect(saved.expires_at).toBe(NOW_S + 3600);
  });

  it("re-reads storage inside the lock: uses a session another tab already rotated", async () => {
    const s = await load();
    s.saveSession(session({ expires_at: NOW_S + 30 }));
    // Hold the lock so our refresh has to wait, and rotate "in another tab" meanwhile.
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    const locks = (globalThis.navigator as unknown as { locks: { request: Function } }).locks;
    const other = locks.request("x", () => held);
    const p = s.getAccessToken();
    env.store.set("nuviolink.session", JSON.stringify(session({ access_token: "acc-9", refresh_token: "ref-9" })));
    release();
    await other;
    expect(await p).toBe("acc-9");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("dedupes concurrent refreshes in one tab into a single request", async () => {
    const s = await load();
    s.saveSession(session({ expires_at: NOW_S + 10 }));
    fetchMock.mockResolvedValue(json(200, tokenBody(2)));
    const tokens = await Promise.all([s.getAccessToken(), s.getAccessToken(), s.getAccessToken()]);
    expect(tokens).toEqual(["acc-2", "acc-2", "acc-2"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("works with the in-memory fallback when navigator.locks is missing", async () => {
    const s = await load({ locks: false });
    s.saveSession(session({ expires_at: NOW_S + 10 }));
    fetchMock.mockResolvedValue(json(200, tokenBody(2)));
    expect(await s.getAccessToken()).toBe("acc-2");
  });

  it.each([
    ["network error", () => Promise.reject(new TypeError("fetch failed")), 0],
    ["429", () => Promise.resolve(json(429, { msg: "slow down" })), 429],
    ["500", () => Promise.resolve(json(500, {})), 500],
    ["503", () => Promise.resolve(json(503, {})), 503],
  ])("keeps the session on %s and marks the error retryable", async (_n, impl, status) => {
    const s = await load();
    s.saveSession(session({ expires_at: NOW_S + 10 }));
    fetchMock.mockImplementationOnce(impl);
    const err = await s.getAccessToken().then(() => null, (e) => e);
    expect(err).toBeInstanceOf(s.NuvioError);
    expect(err.retryable).toBe(true);
    expect(err.sessionExpired).toBe(false);
    expect(err.status).toBe(status);
    expect(stored(env).refresh_token).toBe("ref-1");
  });

  it.each([400, 401, 403])("clears the session when the token endpoint answers %i", async (status) => {
    const s = await load();
    s.saveSession(session({ expires_at: NOW_S + 10 }));
    fetchMock.mockResolvedValueOnce(
      json(status, { code: status, error_code: "validation_failed", msg: "Refresh token is not valid" }),
    );
    const err = await s.getAccessToken().then(() => null, (e) => e);
    expect(err.sessionExpired).toBe(true);
    expect(env.store.has("nuviolink.session")).toBe(false);
    expect(s.getSession()).toBeNull();
  });

  it.each([
    ["a CDN block page", 403, "<html>Forbidden</html>"],
    ["a gateway API key rejection", 401, JSON.stringify({ message: "Invalid API key" })],
  ])("keeps the session on %s", async (_n, status, body) => {
    const s = await load();
    s.saveSession(session({ expires_at: NOW_S + 10 }));
    fetchMock.mockResolvedValueOnce(new Response(body, { status }));
    const err = await s.getAccessToken().then(() => null, (e) => e);
    expect(err.status).toBe(status);
    expect(err.sessionExpired).toBe(false);
    expect(stored(env).refresh_token).toBe("ref-1");
  });

  it("never puts tokens in error messages", async () => {
    const s = await load();
    s.saveSession(session({ expires_at: NOW_S + 10 }));
    fetchMock.mockResolvedValueOnce(json(500, {}));
    const err = await s.getAccessToken().then(() => null, (e) => e);
    expect(err.message).not.toContain("ref-1");
    expect(err.message).not.toContain("acc-1");
  });
});

describe("requestPersistentStorage", () => {
  it("asks the browser to keep storage and ignores a failure", async () => {
    const s = await load();
    const persist = vi.fn().mockRejectedValue(new Error("nope"));
    vi.stubGlobal("navigator", { storage: { persist } });
    s.requestPersistentStorage();
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("does nothing where the Storage API is missing", async () => {
    const s = await load();
    expect(() => s.requestPersistentStorage()).not.toThrow();
  });
});

describe("nuvioFetch error normalization", () => {
  it("uses msg / error_description / message", async () => {
    const s = await load();
    fetchMock.mockResolvedValueOnce(json(400, { msg: "bad msg" }));
    await expect(s.nuvioFetch("/x")).rejects.toMatchObject({ message: "bad msg", status: 400 });
    fetchMock.mockResolvedValueOnce(json(400, { error_description: "bad desc" }));
    await expect(s.nuvioFetch("/x")).rejects.toMatchObject({ message: "bad desc" });
    fetchMock.mockResolvedValueOnce(json(401, { code: "PGRST301", message: "Expected 3 parts in JWT; got 1" }));
    await expect(s.nuvioFetch("/x")).rejects.toMatchObject({ message: "Expected 3 parts in JWT; got 1", status: 401 });
  });

  it("applies a 10s timeout signal", async () => {
    const s = await load();
    fetchMock.mockResolvedValueOnce(json(200, {}));
    await s.nuvioFetch("/x");
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});

describe("cross-tab propagation", () => {
  it("notifies listeners on storage events for the session key", async () => {
    const s = await load();
    const seen: unknown[] = [];
    const off = s.onSessionChange((x) => seen.push(x));
    env.store.set("nuviolink.session", JSON.stringify(session()));
    env.emit("storage", { key: "nuviolink.session" });
    env.emit("storage", { key: "other" });
    expect(seen).toHaveLength(1);
    off();
    env.emit("storage", { key: "nuviolink.session" });
    expect(seen).toHaveLength(1);
  });
});
