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

  test("remove asks for confirmation, shows green toast, Undo restores with original added_at", async ({ page }) => {
    const m = await setup(page);
    await page.goto("/watchlist/0");
    await card(page, /Breaking Bad/).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText('Remove "Breaking Bad" from Matt Watchlist?');
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);
    expect(m.rpc("sync_delete_library_items")).toHaveLength(0);

    await card(page, /Breaking Bad/).click();
    await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
    await expect(page.locator('[data-tone="success"]')).toContainText('Removed "Breaking Bad" from Matt Watchlist');
    await expect(page.getByTestId("title-card")).toHaveCount(3);
    expect(m.rpc("sync_delete_library_items")[0]).toMatchObject({
      p_profile_id: 0,
      p_keys: [{ content_id: "tt0903747", content_type: "series" }],
    });

    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByTestId("title-card")).toHaveCount(4);
    const re = m.rpc("sync_push_library_items")[0];
    expect(re.p_items[0]).toMatchObject({ content_id: "tt0903747", content_type: "series", added_at: 2000, name: "Breaking Bad" });
    expect(re.p_items[0]).not.toHaveProperty("user_id");
  });

  test("remove failure shows a red toast and the item stays", async ({ page }) => {
    const m = await setup(page);
    m.failRemove = true;
    await page.goto("/watchlist/0");
    await card(page, /Inception/).click();
    await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
    await expect(page.locator('[data-tone="error"]')).toHaveText(/Boom: could not delete/);
    await expect(page.getByTestId("title-card")).toHaveCount(4);
  });
});

test.describe("descriptions and navigation", () => {
  test("add menu shows the title's description", async ({ page }) => {
    await setup(page);
    await page.goto("/");
    await card(page, /Inception/).click();
    await expect(page.getByRole("dialog")).toContainText("Inception overview");
  });

  test("remove dialog shows the stored description", async ({ page }) => {
    const library = { 0: [{ content_id: "tt1375666", content_type: "movie", name: "Inception", description: "Stored synopsis", added_at: 1 }] };
    await setup(page, { library });
    await page.goto("/watchlist/0");
    await card(page, /Inception/).click();
    await expect(page.getByRole("dialog")).toContainText("Stored synopsis");
  });

  test("remove dialog falls back to TMDB, then to a no-description message", async ({ page }) => {
    await setup(page);
    await page.goto("/watchlist/0");
    await card(page, /Breaking Bad/).click();
    await expect(page.getByRole("dialog")).toContainText("Breaking Bad overview");
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
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

test.describe("mobile 360px", () => {
  test.use({ viewport: { width: 360, height: 740 } });

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
