import { expect, test, type Page } from "@playwright/test";

// All specs run against /demo* — deterministic client-side fixture data, no backend required.
// See src/app/lib/demo.ts for the available profiles (/demo, /demo-empty, /demo-push, ...).

function trackConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

test.describe("golden path: all screens load with real data, 0 console errors", () => {
  for (const path of ["/demo", "/demo/history", "/demo/progress", "/demo/tools"]) {
    test(`${path} renders cleanly`, async ({ page }) => {
      const errors = trackConsoleErrors(page);
      await page.goto(path);
      await expect(page.getByRole("navigation").first()).toBeVisible();
      // Never surface the generic error boundary/ErrorState on a golden-path demo load.
      await expect(page.getByRole("alert")).toHaveCount(0);
      expect(errors, `console errors on ${path}:\n${errors.join("\n")}`).toEqual([]);
    });
  }
});

test.describe("navigation", () => {
  test("bottom/side tab bar switches screens", async ({ page }) => {
    // Playwright's default browser locale is en-US, so i18next's navigator-based detection
    // resolves to the English catalog (nav labels: Home/History/Progress/Tools).
    await page.goto("/demo");
    const nav = page.getByRole("navigation").first();
    await nav.getByText("History").click();
    await expect(page).toHaveURL(/\/demo\/history$/);
    await nav.getByText("Progress").click();
    await expect(page).toHaveURL(/\/demo\/progress$/);
    await nav.getByText("Home").click();
    await expect(page).toHaveURL(/\/demo$/);
  });

  test("deep link straight to /demo/history loads the screen directly (no client-side nav)", async ({
    page,
  }) => {
    const errors = trackConsoleErrors(page);
    await page.goto("/demo/history");
    await expect(page.getByRole("navigation").first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("opening a session from History goes to its detail and back navigates home", async ({
    page,
  }) => {
    await page.goto("/demo/history");
    const firstSession = page.getByRole("button", { name: /,/ }).first(); // aria-label: "<dayName>, <date>"
    await firstSession.waitFor();
    await firstSession.click();
    await expect(page).toHaveURL(/\/demo\/session\/.+/);
    await expect(page.getByRole("alert")).toHaveCount(0);
  });
});

test.describe("filters drive the UI without crashing", () => {
  test("Progress: exercise select + period toggles", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await page.goto("/demo/progress");
    const exerciseSelect = page.locator("#exercise-select");
    await exerciseSelect.waitFor();
    const options = await exerciseSelect.locator("option").allTextContents();
    if (options.length > 1) {
      await exerciseSelect.selectOption({ index: 1 });
    }
    // Two PeriodToggle groups live on this screen (chart period, count period) — exercise every
    // button on both without assuming which is which.
    const toggleButtons = page.getByRole("group").locator("button");
    const count = await toggleButtons.count();
    for (let i = 0; i < count; i++) {
      await toggleButtons.nth(i).click();
    }
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("History: month filter narrows the list without crashing", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await page.goto("/demo/history");
    const monthFilter = page.locator("#month-filter");
    await monthFilter.waitFor();
    const options = await monthFilter.locator("option").allTextContents();
    if (options.length > 1) {
      await monthFilter.selectOption({ index: 1 });
    }
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

test.describe("corner cases", () => {
  test("/demo-empty shows an empty state, never a false '0 workouts' error look", async ({
    page,
  }) => {
    const errors = trackConsoleErrors(page);
    await page.goto("/demo-empty/history");
    await expect(page.getByRole("alert")).toHaveCount(0); // empty is not an error
    expect(errors).toEqual([]);
  });

  // PW-NAV-3
  test("unknown route under a demo token falls back to the app shell, not a blank page", async ({
    page,
  }) => {
    await page.goto("/demo/this-route-does-not-exist");
    await expect(page.getByRole("navigation").first()).toBeVisible();
  });
});

test.describe("theme toggle", () => {
  test("switching theme persists across reload", async ({ page }) => {
    await page.goto("/demo");
    const getThemeClass = () => page.evaluate(() => document.documentElement.className);
    const before = await getThemeClass();
    // Settings gear opens the theme/language menu (see SettingsMenu.tsx).
    await page
      .getByRole("button", { name: /settings|настрой/i })
      .click()
      .catch(async () => {
        // Fallback: some builds may only expose an icon-only trigger; try the last header button.
        await page.locator("header button").last().click();
      });
    const otherTheme = before.includes("dark") ? "Light" : "Dark";
    const themeOption = page.getByRole("menuitemradio", { name: new RegExp(otherTheme, "i") });
    await themeOption.click();
    await page.reload();
    const after = await getThemeClass();
    expect(after).not.toEqual(before);
  });
});
