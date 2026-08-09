import { expect, test } from "@playwright/test";
import { fetchMagicLink, uniqueEmail } from "./helpers";

test("a failed signup magic link returns to signup", async ({ page }) => {
  const email = uniqueEmail("signup-error");
  await page.goto("/signup");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send magic link" }).click();
  await expect(
    page.getByText("Check your email to finish creating your address book."),
  ).toBeVisible();

  const link = new URL(await fetchMagicLink(email));
  expect(link.searchParams.get("flow")).toBe("signup");
  link.searchParams.set("token_hash", "not-a-real-token-hash");
  await page.goto(link.toString());

  await expect(page).toHaveURL(/\/signup\?error=1$/);
  await expect(
    page.getByRole("alert").filter({ hasText: "Something went wrong" }),
  ).toBeVisible();
});

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
