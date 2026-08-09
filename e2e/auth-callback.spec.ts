import { expect, test } from "@playwright/test";

test("a provider fallback code at the site root reaches auth confirmation", async ({
  page,
}) => {
  await page.goto("/?code=not-a-real-oauth-code");

  // The root hands the code to /auth/confirm. A deliberately invalid code then
  // follows the confirmation route's generic failure path instead of leaving
  // the visitor stranded on the public homepage with a code in the URL.
  await expect(page).toHaveURL(/\/login\?error=1$/);
  await expect(
    page.getByRole("alert").filter({ hasText: "Something went wrong" }),
  ).toBeVisible();
});
