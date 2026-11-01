import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { NOW_S, installBrowser, json, session, tokenBody } from "./helpers";

let fetchMock: ReturnType<typeof vi.fn>;
let env: ReturnType<typeof installBrowser>;
let client: typeof import("@/lib/nuvio/client");
let sess: typeof import("@/lib/nuvio/session");

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW_S * 1000);
  env = installBrowser();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("crypto", { randomUUID: () => "00000000-0000-4000-8000-000000000000" });
  client = await import("@/lib/nuvio/client");
  sess = await import("@/lib/nuvio/session");
  sess.saveSession(session());
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const call = (i: number) => {
  const [url, init] = fetchMock.mock.calls[i];
  return { url: String(url), init, body: init.body ? JSON.parse(init.body) : undefined };
};

describe("rpc", () => {
  it("sends bearer, apikey and content-type to the rpc path", async () => {
    fetchMock.mockResolvedValueOnce(json(200, []));
    await client.rpc("sync_pull_profiles");
    const c = call(0);
    expect(c.url).toBe("https://api.nuvio.tv/rest/v1/rpc/sync_pull_profiles");
    expect(c.init.method).toBe("POST");
    expect(c.init.headers.Authorization).toBe("Bearer acc-1");
    expect(c.init.headers["Content-Type"]).toBe("application/json");
    expect(c.init.headers.apikey).toMatch(/^sb_publishable_/);
  });

  it("on 401 forces one refresh and retries once with the new token", async () => {
    fetchMock
      .mockResolvedValueOnce(json(401, { code: "PGRST301", message: "Expected 3 parts in JWT; got 1" }))
      .mockResolvedValueOnce(json(200, tokenBody(2)))
      .mockResolvedValueOnce(json(200, [{ ok: 1 }]));
    expect(await client.rpc("sync_pull_profiles")).toEqual([{ ok: 1 }]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(call(1).url).toContain("grant_type=refresh_token");
    expect(call(2).init.headers.Authorization).toBe("Bearer acc-2");
  });

  it("does not retry more than once", async () => {
    fetchMock
      .mockResolvedValueOnce(json(401, { message: "jwt" }))
      .mockResolvedValueOnce(json(200, tokenBody(2)))
      .mockResolvedValueOnce(json(401, { message: "still bad" }));
    await expect(client.rpc("x")).rejects.toMatchObject({ status: 401, message: "still bad" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not refresh on non-401 errors", async () => {
    fetchMock.mockResolvedValueOnce(json(500, { message: "boom" }));
    await expect(client.rpc("x")).rejects.toMatchObject({ status: 500 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("signIn / signOut", () => {
  it("signIn persists tokens but never the password", async () => {
    sess.clearSession();
    fetchMock.mockResolvedValueOnce(json(200, tokenBody(5)));
    await client.signIn("a@b.c", "hunter2");
    expect(call(0).url).toBe("https://api.nuvio.tv/auth/v1/token?grant_type=password");
    expect(call(0).body).toEqual({ email: "a@b.c", password: "hunter2" });
    expect(env.store.get("nuviolink.session")).not.toContain("hunter2");
    expect(sess.getSession()?.refresh_token).toBe("ref-5");
  });

  it("signIn offers the password to the browser's credential store", async () => {
    sess.clearSession();
    class PasswordCredential {
      constructor(public data: { id: string; password: string }) {}
    }
    const store = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("PasswordCredential", PasswordCredential);
    vi.stubGlobal("navigator", { credentials: { store } });
    fetchMock.mockResolvedValueOnce(json(200, tokenBody(5)));
    await client.signIn("a@b.c", "hunter2");
    expect(store.mock.calls[0][0].data).toEqual({ id: "a@b.c", password: "hunter2" });
  });

  it("signIn succeeds when the browser refuses to store the credential", async () => {
    sess.clearSession();
    vi.stubGlobal("PasswordCredential", class {});
    vi.stubGlobal("navigator", { credentials: { store: vi.fn().mockRejectedValue(new Error("denied")) } });
    fetchMock.mockResolvedValueOnce(json(200, tokenBody(5)));
    await expect(client.signIn("a@b.c", "hunter2")).resolves.toBeUndefined();
    expect(sess.getSession()?.refresh_token).toBe("ref-5");
  });

  it("signIn does not offer the password when sign in fails", async () => {
    sess.clearSession();
    const store = vi.fn();
    vi.stubGlobal("PasswordCredential", class {});
    vi.stubGlobal("navigator", { credentials: { store } });
    fetchMock.mockResolvedValueOnce(json(400, { msg: "Invalid login credentials" }));
    await expect(client.signIn("a@b.c", "nope")).rejects.toThrow("Invalid login credentials");
    expect(store).not.toHaveBeenCalled();
  });

  it("signOut uses scope=local and clears local state", async () => {
    fetchMock.mockResolvedValueOnce(json(204));
    await client.signOut();
    expect(call(0).url).toBe("https://api.nuvio.tv/auth/v1/logout?scope=local");
    expect(call(0).init.headers.Authorization).toBe("Bearer acc-1");
    expect(sess.getSession()).toBeNull();
  });

  it("signOut clears local state even when the request fails", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    await client.signOut();
    expect(sess.getSession()).toBeNull();
  });
});

describe("listProfiles", () => {
  it("maps profile_index (not the UUID), drops rows without integer index, sorts", async () => {
    fetchMock.mockResolvedValueOnce(
      json(200, [
        { id: "uuid-b", profile_index: 2, name: "Kids", avatar_color_hex: "#fff", pin_enabled: true },
        { id: "uuid-x", profile_index: null, name: "Broken" },
        { id: "uuid-y", profile_index: "3", name: "StringIdx" },
        { id: "uuid-a", profile_index: 1, name: "Main", avatar_url: "http://a/b.png" },
      ]),
    );
    const profiles = await client.listProfiles();
    expect(profiles).toEqual([
      { id: "uuid-a", profileIndex: 1, name: "Main", avatarColorHex: null, avatarUrl: "http://a/b.png", pinEnabled: false },
      { id: "uuid-b", profileIndex: 2, name: "Kids", avatarColorHex: "#fff", avatarUrl: null, pinEnabled: true },
    ]);
    expect(call(0).body).toEqual({});
  });
});

describe("library", () => {
  const rows = (n: number, start = 0) =>
    Array.from({ length: n }, (_, i) => ({ content_id: `tt${start + i}`, content_type: "movie" }));

  it("paginates until a page has fewer than 500 rows, using the profile index", async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, rows(500)))
      .mockResolvedValueOnce(json(200, rows(500, 500)))
      .mockResolvedValueOnce(json(200, rows(7, 1000)));
    const lib = await client.getLibrary(3);
    expect(lib).toHaveLength(1007);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(call(0).body).toEqual({ p_profile_id: 3, p_limit: 500, p_offset: 0 });
    expect(call(1).body.p_offset).toBe(500);
    expect(call(2).body.p_offset).toBe(1000);
    expect(client.getCachedLibrary(3)).toHaveLength(1007);
  });

  it("stops after an exactly-empty final page", async () => {
    fetchMock.mockResolvedValueOnce(json(200, rows(500))).mockResolvedValueOnce(json(200, []));
    expect(await client.getLibrary(1)).toHaveLength(500);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws after 1000 pages", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json(200, rows(500))));
    await expect(client.getLibrary(1)).rejects.toThrow(/too large/);
    expect(fetchMock).toHaveBeenCalledTimes(1000);
  });

  it("addToLibrary sends exact keys, strips server fields and undefined, uses a stable client id", async () => {
    fetchMock.mockResolvedValue(json(204));
    await client.addToLibrary(2, {
      content_id: "tt1",
      content_type: "movie",
      name: "X",
      added_at: 5,
      description: undefined,
      id: "srv",
      user_id: "u",
      profile_id: 2,
      created_at: "c",
      updated_at: "u",
    } as never);
    const c = call(0);
    expect(c.url).toBe("https://api.nuvio.tv/rest/v1/rpc/sync_push_library_items");
    expect(c.body).toEqual({
      p_profile_id: 2,
      p_origin_client_id: "00000000-0000-4000-8000-000000000000",
      p_items: [{ content_id: "tt1", content_type: "movie", name: "X", added_at: 5 }],
    });
    expect(env.store.get("nuviolink.client-id")).toBe("00000000-0000-4000-8000-000000000000");
  });

  it("removeFromLibrary sends the exact keys as received", async () => {
    fetchMock.mockResolvedValue(json(204));
    await client.removeFromLibrary(4, { content_id: "weird:Scheme/1", content_type: "series" });
    const c = call(0);
    expect(c.url).toBe("https://api.nuvio.tv/rest/v1/rpc/sync_delete_library_items");
    expect(c.body).toEqual({
      p_profile_id: 4,
      p_origin_client_id: "00000000-0000-4000-8000-000000000000",
      p_keys: [{ content_id: "weird:Scheme/1", content_type: "series" }],
    });
  });

  it("updates the cache after add and remove", async () => {
    fetchMock.mockResolvedValueOnce(json(200, rows(2)));
    await client.getLibrary(1);
    fetchMock.mockResolvedValue(json(204));
    await client.addToLibrary(1, { content_id: "tt99", content_type: "movie" });
    expect(client.getCachedLibrary(1)!.map((i) => i.content_id)).toEqual(["tt99", "tt0", "tt1"]);
    await client.removeFromLibrary(1, { content_id: "tt0", content_type: "movie" });
    expect(client.getCachedLibrary(1)!.map((i) => i.content_id)).toEqual(["tt99", "tt1"]);
  });

  it("never calls the forbidden sync_push_library RPC (runtime)", async () => {
    fetchMock.mockResolvedValue(json(204));
    await client.addToLibrary(1, { content_id: "tt1", content_type: "movie" });
    await client.removeFromLibrary(1, { content_id: "tt1", content_type: "movie" });
    for (const [url] of fetchMock.mock.calls) {
      expect(String(url)).not.toMatch(/sync_push_library(?!_items)/);
    }
  });
});

describe("forbidden RPC", () => {
  it("no source file references sync_push_library other than sync_push_library_items", () => {
    const root = path.resolve(__dirname, "..");
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (["node_modules", ".next", ".git", "tests", "e2e"].includes(name)) continue;
        const p = path.join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx|js|jsx|mjs)$/.test(name) && /sync_push_library(?!_items)/.test(readFileSync(p, "utf8"))) hits.push(p);
      }
    };
    for (const d of ["app", "lib", "components", "hooks"]) {
      try {
        walk(path.join(root, d));
      } catch {
        // directory may not exist
      }
    }
    expect(hits).toEqual([]);
  });
});
