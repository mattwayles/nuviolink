import { expect, freshSession, setup, T, test } from "./fixtures";

const card = (page: import("@playwright/test").Page, name: string | RegExp) =>
  page.getByRole("button", { name }).filter({ has: page.locator("img, div") }).first();

test.describe("auth", () => {
  test("login gate shows form, rejects bad password inline, signs in without storing the password", async ({ page }) => {
    const m = await setup(page, { session: null });
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);

    await page.getByLabel("Email").fill("me@example.com");
    await page.getByLabel("Password").fill("wrong");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("form").getByRole("alert")).toHaveText("Invalid login credentials");

    await page.getByLabel("Password").fill("correct-horse");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("searchbox", { name: "Search movies and TV shows" })).toBeVisible();
    expect(m.logins).toBe(2);
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }));
    expect(stored).not.toContain("correct-horse");
    expect(stored).toContain("refresh-1");
  });

  test("sign in gives password managers their signals: live fields, a URL change, and the credential", async ({ page }) => {
    await setup(page, { session: null });
    await page.addInitScript(() => {
      (window as any).__stored = [];
      navigator.credentials.store = async (c: any) => ((window as any).__stored.push({ id: c.id, password: c.password }), c);
    });
    await page.route(/\/auth\/v1\/token/, async (route) => {
      await new Promise((r) => setTimeout(r, 200));
      await route.fallback();
    });
    await page.goto("/");
    await expect(page).toHaveURL(/\/#sign-in$/);

    await page.getByLabel("Email").fill("me@example.com");
    await page.getByLabel("Password").fill("correct-horse");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("button", { name: "Signing in…" })).toBeVisible();
    await expect(page.getByLabel("Password")).toBeEnabled();
    await expect(page.getByLabel("Password")).not.toBeEditable();

    await expect(page.getByRole("searchbox", { name: "Search movies and TV shows" })).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    expect(await page.evaluate(() => (window as any).__stored)).toEqual([{ id: "me@example.com", password: "correct-horse" }]);
  });

  test("a failed sign in keeps the form editable and stores nothing", async ({ page }) => {
    await setup(page, { session: null });
    await page.addInitScript(() => {
      (window as any).__stored = 0;
      navigator.credentials.store = async (c: any) => ((window as any).__stored++, c);
    });
    await page.goto("/");
    await page.getByLabel("Email").fill("me@example.com");
    await page.getByLabel("Password").fill("wrong");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("form").getByRole("alert")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeEditable();
    await expect(page).toHaveURL(/#sign-in$/);
    expect(await page.evaluate(() => (window as any).__stored)).toBe(0);
  });

  test("a CDN error on refresh does not sign the user out", async ({ page }) => {
    await setup(page, { session: freshSession({ access_token: "stale", expires_at: 1 }) });
    await page.route(/\/auth\/v1\/token/, (route) =>
      route.fulfill({ status: 403, headers: { "access-control-allow-origin": "*" }, body: "<html>Forbidden</html>" }),
    );
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
    await expect(page.getByLabel("Password")).toHaveCount(0);
    const s = await page.evaluate(() => JSON.parse(localStorage.getItem("nuviolink.session")!));
    expect(s.refresh_token).toBe("refresh-1");
  });

  test("the app asks the browser to keep its storage once signed in", async ({ page }) => {
    await setup(page);
    await page.addInitScript(() => {
      (window as any).__persisted = 0;
      navigator.storage.persist = async () => ((window as any).__persisted++, true);
    });
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
    expect(await page.evaluate(() => (window as any).__persisted)).toBeGreaterThan(0);
  });

  test("stored session never flashes the login form", async ({ page }) => {
    await setup(page);
    await page.addInitScript(() => {
      (window as any).__sawLogin = false;
      new MutationObserver(() => {
        if (document.querySelector('input[type="password"]')) (window as any).__sawLogin = true;
      }).observe(document, { childList: true, subtree: true });
    });
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
    await expect(page.getByTestId("title-card").first()).toBeVisible();
    expect(await page.evaluate(() => (window as any).__sawLogin)).toBe(false);
  });

  test("expired access token refreshes silently without a login prompt", async ({ page }) => {
    const m = await setup(page, { session: freshSession({ access_token: "stale", expires_at: 1 }) });
    await page.goto("/");
    await expect(page.getByTestId("title-card").first()).toBeVisible();
    await page.getByRole("button", { name: "Watchlists" }).click();
    await expect(page.getByRole("menuitem", { name: "Kids" })).toBeVisible();
    await expect(page.getByLabel("Password")).toHaveCount(0);
    expect(m.refreshes).toBe(1);
    expect(m.calls[0].auth).toBe("Bearer access-2");
    const s = await page.evaluate(() => JSON.parse(localStorage.getItem("nuviolink.session")!));
    expect(s.refresh_token).toBe("refresh-2");
  });

  test("sign out clears the session, uses scope=local and shows login", async ({ page }) => {
    const m = await setup(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    expect(m.logouts).toEqual(["?scope=local"]);
    expect(await page.evaluate(() => localStorage.getItem("nuviolink.session"))).toBeNull();
  });
});

test.describe("landing", () => {
  test("popular grid with ratings, badges and autofocused search", async ({ page }) => {
    await setup(page);
    await page.goto("/");
    const search = page.getByRole("searchbox", { name: "Search movies and TV shows" });
    await expect(search).toBeFocused();
    await expect(page.getByTestId("title-card")).toHaveCount(8);
    await expect(card(page, /Inception/)).toContainText("8.4");
    await expect(card(page, /Obscure Gem/)).toContainText("NR");
    await expect(card(page, /Breaking Bad/)).toContainText("TV");
    await expect(card(page, /Inception/)).toContainText("Movie");
  });

  test("debounced search replaces the grid, clearing restores popular", async ({ page }) => {
    const m = await setup(page);
    await page.goto("/");
    await expect(page.getByTestId("title-card")).toHaveCount(8);
    await page.getByRole("searchbox").pressSequentially("dune", { delay: 60 });
    await expect(page.getByTestId("title-card")).toHaveCount(2);
    await expect(card(page, /Dune: Part Two/)).toBeVisible();
    expect(m.tmdb.search).toEqual(["dune"]);
    await expect(page).toHaveURL(/\?q=dune$/);

    await page.getByRole("button", { name: "Clear search" }).click();
    await expect(page.getByTestId("title-card")).toHaveCount(8);
    await expect(page).toHaveURL(/\/$/);
  });

  test("search with no results shows an empty state", async ({ page }) => {
    await setup(page);
    await page.goto("/");
    await page.getByRole("searchbox").fill("qqqq");
    await expect(page.getByText("No results for “qqqq”.")).toBeVisible();
  });

  test("sort by title and rating, nulls last in both directions", async ({ page }) => {
    await setup(page);
    await page.goto("/");
    const names = () => page.getByTestId("title-card").locator("p.truncate").allTextContents();
    await expect(page.getByTestId("title-card")).toHaveCount(8);

    await page.getByLabel("Sort by").selectOption("title");
    expect((await names())[0]).toBe("Barbie");
    expect((await names())[7]).toBe("The Bear");

    await page.getByLabel("Sort by").selectOption("rating");
    let n = await names();
    expect(n[0]).toBe("Breaking Bad");
    expect(n[7]).toBe("Obscure Gem");

    await page.getByRole("button", { name: /Descending order/ }).click();
    n = await names();
    expect(n[0]).toBe("Barbie");
    expect(n[7]).toBe("Obscure Gem");

    await page.reload();
    await expect(page.getByLabel("Sort by")).toHaveValue("rating");
  });
});

test.describe("title menu", () => {
  test("lists one Add item per profile (N=4)", async ({ page }) => {
    await setup(page);
    await page.goto("/");
    await card(page, /Dune$|Dune\s/).click();
    const items = page.getByRole("dialog").getByRole("menuitem");
    await expect(items).toHaveCount(4);
    await expect(items.nth(0)).toHaveText("Add to Matt Watchlist");
    await expect(items.nth(3)).toHaveText("Add to Guest Watchlist");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("lists exactly one item for a single profile (N=1)", async ({ page }) => {
    await setup(page, { profiles: [{ id: "u", profile_index: 0, name: "Solo", avatar_color_hex: null, avatar_url: null, pin_enabled: false }] });
    await page.goto("/");
    await card(page, /Dune/).click();
    const items = page.getByRole("dialog").getByRole("menuitem");
    await expect(items).toHaveCount(1);
    await expect(items.first()).toHaveText("Add to Solo Watchlist");
  });

  test("add shows a green toast and writes the right payload via the granular RPC only", async ({ page }) => {
    const m = await setup(page);
    await page.goto("/");
    await card(page, /Dune/).click();
    await page.getByRole("menuitem", { name: "Add to Kids Watchlist" }).click();
    const toast = page.locator('[data-tone="success"]');
    await expect(toast).toHaveText(/Added "Dune" to Kids Watchlist/);

    const pushes = m.rpc("sync_push_library_items");
    expect(pushes).toHaveLength(1);
    const p = pushes[0];
    expect(p.p_profile_id).toBe(1);
    expect(p.p_origin_client_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(p.p_items).toHaveLength(1);
    const it = p.p_items[0];
    expect(it).toMatchObject({ content_id: "tt1160419", content_type: "movie", name: "Dune", poster_shape: "POSTER", release_info: "2021", description: "Dune overview" });
    expect(typeof it.added_at).toBe("number");
    expect(it).not.toHaveProperty("imdb_rating");
    expect(m.calls.map((c) => c.fn)).not.toContain("sync_push_library");
    // Menu now shows it as added.
    await expect(page.getByRole("menuitem", { name: "Already in Kids Watchlist" })).toBeDisabled();
  });

  test("a title without an IMDb id is written as tmdb:<id> with series mapping", async ({ page }) => {
    const m = await setup(page);
    await page.goto("/");
    await card(page, /Obscure Gem/).click();
    await page.getByRole("menuitem", { name: "Add to Matt Watchlist" }).click();
    await expect(page.locator('[data-tone="success"]')).toBeVisible();
    expect(m.rpc("sync_push_library_items")[0].p_items[0].content_id).toBe("tmdb:9999");
  });

  test("add failure shows a red toast and keeps the menu open", async ({ page }) => {
    const m = await setup(page);
    m.failAdd = true;
    await page.goto("/");
    await card(page, /Dune/).click();
    await page.getByRole("menuitem", { name: "Add to Matt Watchlist" }).click();
    await expect(page.locator('[data-tone="error"]')).toHaveText(/Boom: could not save/);
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Add to Matt Watchlist" })).toBeEnabled();
  });

  test("lookup failure shows a red toast and writes nothing", async ({ page }) => {
    const m = await setup(page);
    m.failLookup = true;
    await page.goto("/");
    await card(page, /Dune/).click();
    await page.getByRole("menuitem", { name: "Add to Matt Watchlist" }).click();
    await expect(page.locator('[data-tone="error"]')).toBeVisible();
    expect(m.rpc("sync_push_library_items")).toHaveLength(0);
  });

  test("already-added titles are marked and disabled (matches tt ids)", async ({ page }) => {
    await setup(page);
    await page.goto("/");
    await card(page, /Inception/).click();
    const done = page.getByRole("menuitem", { name: "Already in Matt Watchlist" });
    await expect(done).toBeDisabled();
    await expect(page.getByRole("menuitem", { name: "Add to Kids Watchlist" })).toBeEnabled();
  });

  test("add still works while the library check is failing", async ({ page }) => {
    const m = await setup(page);
    await page.route(/rpc\/sync_pull_library/, (r) =>
      r.fulfill({ status: 500, headers: { "access-control-allow-origin": "*" }, body: "{}" }),
    );
    await page.goto("/");
    await card(page, /Dune/).click();
    await page.getByRole("menuitem", { name: "Add to Guest Watchlist" }).click();
    await expect(page.locator('[data-tone="success"]')).toBeVisible();
    expect(m.rpc("sync_push_library_items")).toHaveLength(1);
  });
});

test.describe("watchlists", () => {
  test("Watchlists menu navigates to a profile watchlist with name and count", async ({ page }) => {
    await setup(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Watchlists" }).click();
    await page.getByRole("menuitem", { name: "Matt" }).click();
    await expect(page).toHaveURL(/\/watchlist\/0$/);
    await expect(page.getByRole("heading", { name: "Matt Watchlist" })).toBeVisible();
    await expect(page.getByTestId("count")).toHaveText("4 titles");
    await expect(page.getByTestId("title-card")).toHaveCount(4);
    // order: recently added first; ratings filled lazily via lookup
    await expect(page.getByTestId("title-card").first()).toContainText("Inception");
    await expect(card(page, /Breaking Bad/)).toContainText("8.9");
    await expect(card(page, /Amélie/)).toContainText("7.9");
    await expect(card(page, /Odd Addon Show/)).toContainText("NR");
    await expect(page.getByRole("button", { name: "Watchlists" })).toBeVisible();
  });

  test("rating sort works on a watchlist using lazily filled ratings", async ({ page }) => {
    await setup(page);
    await page.goto("/watchlist/0");
    await expect(card(page, /Amélie/)).toContainText("7.9");
    await page.getByLabel("Sort by").selectOption("rating");
    const names = await page.getByTestId("title-card").locator("p.truncate").allTextContents();
    expect(names).toEqual(["Breaking Bad", "Inception", "Amélie", "Odd Addon Show"]);
  });

  test("local filter is diacritic-insensitive and never calls TMDB search", async ({ page }) => {
    const m = await setup(page);
    await page.goto("/watchlist/0");
    await expect(page.getByTestId("title-card")).toHaveCount(4);
    await page.getByRole("searchbox", { name: "Filter this watchlist" }).fill("amelie");
    await expect(page.getByTestId("title-card")).toHaveCount(1);
    await expect(page.getByTestId("count")).toHaveText("1 of 4 titles");
    await page.getByRole("searchbox").fill("zzz");
    await expect(page.getByText("No titles match “zzz”.")).toBeVisible();
    await page.waitForTimeout(600);
    expect(m.tmdb.search).toEqual([]);
    expect(m.tmdb.popular).toBe(0);
  });

  test("unknown profile index shows a friendly error", async ({ page }) => {
    await setup(page);
    await page.goto("/watchlist/42");
    await expect(page.getByRole("heading", { name: "Profile not found" })).toBeVisible();
  });

  test("item menu lists other profiles plus remove for the current profile", async ({ page }) => {
    await setup(page);
    await page.goto("/watchlist/0");
    await card(page, /Inception/).click();
    const items = page.getByRole("dialog").getByRole("menuitem");
    await expect(items).toHaveCount(4);
    await expect(items.nth(0)).toHaveText("Add to Kids Watchlist");
    await expect(items.nth(1)).toHaveText("Add to Sam Watchlist");
    await expect(items.nth(2)).toHaveText("Add to Guest Watchlist");
    await expect(items.nth(3)).toHaveText("Remove from Matt Watchlist");
    await page.getByRole("button", { name: "Close menu" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("item menu is anchored to the card, like the add menu", async ({ page }) => {
    await setup(page);
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto("/");
    await card(page, /Inception/).click();
    const addBox = (await page.getByRole("dialog").boundingBox())!;
    await page.keyboard.press("Escape");
    await page.goto("/watchlist/0");
    const cardBox = (await card(page, /Inception/).boundingBox())!;
    await card(page, /Inception/).click();
    const box = (await page.getByRole("dialog").boundingBox())!;
    expect(box.width).toBe(addBox.width);
    expect(box.x).toBe(cardBox.x);
  });

  test("adding to another profile copies the exact id, marks it, and keeps the menu open", async ({ page }) => {
    const m = await setup(page);
    await page.goto("/watchlist/0");
    await card(page, /Odd Addon Show/).click();
    await page.getByRole("menuitem", { name: "Add to Kids Watchlist" }).click();
    await expect(page.locator('[data-tone="success"]')).toContainText('Added "Odd Addon Show" to Kids Watchlist');
    await expect(page.getByRole("menuitem", { name: "Already in Kids Watchlist" })).toBeDisabled();
    await expect(page.getByRole("menuitem", { name: "Remove from Matt Watchlist" })).toBeEnabled();
    const push = m.rpc("sync_push_library_items")[0];
    expect(push).toMatchObject({ p_profile_id: 1 });
    expect(push.p_items[0]).toMatchObject({ content_id: "kitsu:123", content_type: "series", name: "Odd Addon Show" });
    expect(push.p_items[0]).not.toHaveProperty("user_id");
    expect(m.rpc("sync_delete_library_items")).toHaveLength(0);
  });

  test("a title stored under another id on a profile shows as already there", async ({ page }) => {
    const library = {
      0: [{ content_id: "tmdb:27205", content_type: "movie", name: "Inception", added_at: 1 }],
      1: [{ content_id: "tt1375666", content_type: "movie", name: "Inception", added_at: 1 }],
    };
    await setup(page, { library });
    await page.goto("/watchlist/0");
    await card(page, /Inception/).click();
    await expect(page.getByRole("menuitem", { name: "Already in Kids Watchlist" })).toBeDisabled();
  });

  test("remove keeps the menu open, removes immediately, and Undo restores the original", async ({ page }) => {
    const m = await setup(page);
    await page.goto("/watchlist/0");
    await card(page, /Breaking Bad/).click();
    await page.getByRole("menuitem", { name: "Remove from Matt Watchlist" }).click();
    await expect(page.locator('[data-tone="success"]')).toContainText('Removed "Breaking Bad" from Matt Watchlist');
    await expect(page.getByTestId("title-card")).toHaveCount(3);
    await expect(page.getByRole("menuitem", { name: "Removed from Matt Watchlist" })).toBeDisabled();
    await expect(page.getByRole("dialog")).toContainText("Breaking Bad overview");
    expect(m.rpc("sync_delete_library_items")[0]).toMatchObject({
      p_profile_id: 0,
      p_keys: [{ content_id: "tt0903747", content_type: "series" }],
    });

    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByTestId("title-card")).toHaveCount(4);
    await expect(page.getByRole("menuitem", { name: "Remove from Matt Watchlist" })).toBeEnabled();
    const re = m.rpc("sync_push_library_items")[0];
    expect(re.p_items[0]).toMatchObject({ content_id: "tt0903747", content_type: "series", added_at: 2000, name: "Breaking Bad" });
    expect(re.p_items[0]).not.toHaveProperty("user_id");
  });

  test("remove failure shows a red toast and the item and menu stay", async ({ page }) => {
    const m = await setup(page);
    m.failRemove = true;
    await page.goto("/watchlist/0");
    await card(page, /Inception/).click();
    await page.getByRole("menuitem", { name: "Remove from Matt Watchlist" }).click();
    await expect(page.locator('[data-tone="error"]')).toHaveText(/Boom: could not delete/);
    await expect(page.getByTestId("title-card")).toHaveCount(4);
    await expect(page.getByRole("menuitem", { name: "Remove from Matt Watchlist" })).toBeEnabled();
  });
});

test("home screen installs as NuvioLink with an app icon", async ({ page, request }) => {
  await setup(page);
  await page.goto("/");
  await expect(page).toHaveTitle("NuvioLink");
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute("content", "NuvioLink");
  const href = (name: string) => page.locator(`link[rel="${name}"]`).first().getAttribute("href");
  const manifest = await (await request.get((await href("manifest"))!)).json();
  expect(manifest.short_name).toBe("NuvioLink");
  const paths = [(await href("apple-touch-icon"))!, ...manifest.icons.map((i: { src: string }) => i.src)];
  for (const path of paths) {
    const res = await request.get(path);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/png");
  }
});

test.describe("descriptions and navigation", () => {
  test("add menu shows the title's description", async ({ page }) => {
    await setup(page);
    await page.goto("/");
    await card(page, /Inception/).click();
    await expect(page.getByRole("dialog")).toContainText("Inception overview");
  });

  test("watchlist menu shows the stored description", async ({ page }) => {
    const library = { 0: [{ content_id: "tt1375666", content_type: "movie", name: "Inception", description: "Stored synopsis", added_at: 1 }] };
    await setup(page, { library });
    await page.goto("/watchlist/0");
    await card(page, /Inception/).click();
    await expect(page.getByRole("dialog")).toContainText("Stored synopsis");
  });

  test("watchlist menu falls back to TMDB, then to a no-description message", async ({ page }) => {
    await setup(page);
    await page.goto("/watchlist/0");
    await card(page, /Breaking Bad/).click();
    await expect(page.getByRole("dialog")).toContainText("Breaking Bad overview");
    await page.getByRole("button", { name: "Close menu" }).click();
    await card(page, /Odd Addon Show/).click();
    await expect(page.getByRole("dialog")).toContainText("No description available.");
  });

  test("back button returns home from a watchlist and from an unknown profile", async ({ page }) => {
    await setup(page);
    for (const path of ["/watchlist/0", "/watchlist/42"]) {
      await page.goto(path);
      await page.getByRole("link", { name: "Back to home" }).click();
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByRole("searchbox", { name: "Search movies and TV shows" })).toBeVisible();
    }
  });

  test("the add menu stays on screen on a short desktop window", async ({ page }) => {
    await setup(page);
    await page.setViewportSize({ width: 1280, height: 620 });
    await page.goto("/");
    await card(page, /Inception/).click();
    const box = (await page.getByRole("dialog").boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(620);
  });
});

test.describe("phone login", () => {
  test.use({ viewport: { width: 360, height: 420 }, hasTouch: true, isMobile: true });

  test("the first screen after login is at the top with nothing focused to scroll to", async ({ page }) => {
    await setup(page, { session: null });
    await page.goto("/");
    await page.getByLabel("Email").fill("me@example.com");
    await page.getByLabel("Password").fill("correct-horse");
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByTestId("title-card")).toHaveCount(8);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page.getByRole("searchbox")).not.toBeFocused();
  });

  test("no form control is small enough to trigger iOS focus zoom", async ({ page }) => {
    const sizes = () =>
      page.locator("input, select").evaluateAll((els) => els.map((e) => parseFloat(getComputedStyle(e).fontSize)));
    await setup(page, { session: null });
    await page.goto("/");
    await expect(page.getByLabel("Password")).toBeVisible();
    for (const size of await sizes()) expect(size).toBeGreaterThanOrEqual(16);

    await page.getByLabel("Email").fill("me@example.com");
    await page.getByLabel("Password").fill("correct-horse");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByTestId("title-card")).toHaveCount(8);
    const home = await sizes();
    expect(home.length).toBeGreaterThanOrEqual(2);
    for (const size of home) expect(size).toBeGreaterThanOrEqual(16);
  });
});

test.describe("mobile 360px", () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test("toasts never cover the menu on a phone", async ({ page }) => {
    await setup(page);
    await page.goto("/watchlist/0");
    await card(page, /Inception/).click();
    await page.getByRole("menuitem", { name: "Remove from Matt Watchlist" }).click();
    const toast = page.locator('[data-tone="success"]');
    await expect(toast).toBeVisible();
    const t = (await toast.boundingBox())!;
    const d = (await page.getByRole("dialog").boundingBox())!;
    expect(t.y + t.height).toBeLessThanOrEqual(d.y);
  });

  test("fits three posters per row", async ({ page }) => {
    await setup(page);
    await page.goto("/");
    await expect(page.getByTestId("title-card")).toHaveCount(8);
    const tops = await page.getByTestId("title-card").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
    expect(tops.filter((t) => t === tops[0])).toHaveLength(3);
  });

  test("no horizontal overflow on landing, menu sheet and watchlist", async ({ page }) => {
    await setup(page);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await page.goto("/");
    await expect(page.getByTestId("title-card")).toHaveCount(8);
    expect(await overflow()).toBeLessThanOrEqual(0);

    await card(page, /Inception/).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("menuitem")).toHaveCount(4);
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(360);
    expect(box.y + box.height).toBeGreaterThan(700); // bottom sheet
    expect(await overflow()).toBeLessThanOrEqual(0);
    await page.keyboard.press("Escape");

    await page.goto("/watchlist/0");
    await expect(page.getByTestId("title-card")).toHaveCount(4);
    expect(await overflow()).toBeLessThanOrEqual(0);
    await page.getByRole("button", { name: "Watchlists" }).click();
    await expect(page.getByRole("menuitem", { name: "Guest" })).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);
  });
});
