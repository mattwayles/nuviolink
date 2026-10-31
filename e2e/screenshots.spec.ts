import { setup, test, expect } from "./fixtures";

const DIR = process.env.SHOTS_DIR ?? "test-results/shots";

test.use({ viewport: { width: 1280, height: 860 } });

test("capture screenshots (landing, menu, watchlist, login)", async ({ page }) => {
  await setup(page);
  await page.goto("/");
  await expect(page.getByTestId("title-card")).toHaveCount(8);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${DIR}/landing.png` });

  await page.getByRole("button", { name: /Dune/ }).first().click();
  await expect(page.getByRole("menuitem", { name: "Add to Guest Watchlist" })).toBeVisible();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${DIR}/menu.png` });
  await page.getByRole("menuitem", { name: "Add to Kids Watchlist" }).click();
  await expect(page.locator('[data-tone="success"]')).toBeVisible();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${DIR}/menu-toast.png` });
  await page.keyboard.press("Escape");

  await page.goto("/watchlist/0");
  await expect(page.getByTestId("title-card")).toHaveCount(4);
  await expect(page.getByText("8.9")).toBeVisible();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${DIR}/watchlist.png` });

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${DIR}/login.png` });
});
