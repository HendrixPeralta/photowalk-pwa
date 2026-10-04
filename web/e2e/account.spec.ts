import { expect, test } from "./fixtures";

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
