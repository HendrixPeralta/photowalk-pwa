import { expect, test, TEST_USER } from "./fixtures";

test.describe("signed out", () => {
  test.use({ signedInAs: null });

  test("the sign-in screen stands in for the app, and Google sign-in leads back into it", async ({ page, auth }) => {
    await page.goto("/album/");
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
    await expect(page.locator(".topbar")).toHaveCount(0);
    await expect(page.locator(".bottom-nav")).toHaveCount(0);

    await page.getByRole("button", { name: "Continue with Google" }).click();
    await expect(page.locator("#screenTitle")).toHaveText("Album");
    expect(auth.signInStarts).toBe(1);
    await page.getByRole("button", { name: "Profile" }).click();
    await expect(page.getByRole("dialog", { name: "Menu" })).toContainText(TEST_USER.email);
  });

  test("a sign-in that failed says so", async ({ page }) => {
    await page.goto("/?error=access_denied");
    await expect(page.getByRole("status")).toHaveText("Sign-in didn't finish. Try again.");
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
  });

  test("a server that can't be reached offers to try again", async ({ page, auth }) => {
    auth.failWith = 503;
    await page.goto("/");
    await expect(page.getByRole("status")).toHaveText("Couldn't reach PhotoEYE. Check your connection and try again.");
    auth.failWith = null;
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  });

  test("the sign-in screen follows the language", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("photoeye-lang", "ja"));
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Googleで続ける" })).toBeVisible();
  });
});

test("the menu shows who is signed in and leads to their account", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Profile" }).click();
  await page.getByRole("link", { name: new RegExp(TEST_USER.name) }).click();
  await expect(page).toHaveURL(/\/settings\/$/);
  const card = page.locator(".account-card");
  await expect(card).toContainText(TEST_USER.name);
  await expect(card).toContainText(TEST_USER.email);
});

test("signing out returns to the sign-in screen and leaves the device's data in place", async ({ page, auth }) => {
  await page.goto("/settings/?history=seed");
  await expect(page.locator(".account-card")).toBeVisible();
  const walks = await page.evaluate(() => JSON.parse(localStorage.getItem("photoeye:state")!).state.walkHistory.length);
  expect(walks).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  expect(auth.signOuts).toBe(1);
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem("photoeye:state")!).state.walkHistory.length);
  expect(kept).toBe(walks);
});

test("someone else signing in on the device starts from a clean slate", async ({ page, auth }) => {
  await page.goto("/");
  await expect(page.locator(".topbar")).toBeVisible();
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("photoeye:state")!);
    saved.state.profile.displayName = "Aki's camera";
    localStorage.setItem("photoeye:state", JSON.stringify(saved));
  });
  await page.goto("/settings/");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();

  auth.signedInAs = { id: "someone-else", name: "Ben", email: "ben@example.com", image: null };
  await page.reload();
  await expect(page.locator(".topbar")).toBeVisible();
  const name = await page.evaluate(() => JSON.parse(localStorage.getItem("photoeye:state")!).state.profile.displayName);
  expect(name).toBe("");
  await page.goto("/settings/");
  await expect(page.locator(".account-card")).toContainText("ben@example.com");
});

test("an ended session doesn't interrupt, it offers to sign in again", async ({ page, auth }) => {
  await page.goto("/");
  await expect(page.locator(".topbar")).toBeVisible();
  auth.signedInAs = null;
  await page.goto("/settings/");
  await expect(page.locator("#screenTitle")).toHaveText("Settings");
  await expect(page.locator(".toast").filter({ hasText: "Your session ended. Sign in again." })).toBeVisible();
  await expect(page.locator(".account-card")).toContainText("Your session ended.");

  await page.getByRole("button", { name: "Sign in again" }).click();
  await expect(page.locator(".account-card")).toContainText("Signed in with Google.");
});
