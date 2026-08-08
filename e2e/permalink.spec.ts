import { expect, test, type Browser, type Page } from "@playwright/test";
import { cleanupUser, clearRateLimits } from "./db";
import {
  createBook,
  signupAndLogin,
  uniqueEmail,
  uniqueSlug,
  waitForTurnstile,
} from "./helpers";

/**
 * The /b/[slug] public permalink surface: anonymous visitors submit the
 * write-only form; submissions land in the owner's review queue for
 * approve/reject. The owner and book are created through the real UI.
 */
test.describe.configure({ mode: "serial" });

const ownerEmail = uniqueEmail("permalink-owner");
const slug = uniqueSlug("permalink");

let ownerPage: Page;

/** Submit the public form as a brand-new anonymous visitor. */
async function submitAsVisitor(
  browser: Browser,
  fields: { full_name: string; email?: string; city?: string },
): Promise<void> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`/b/${slug}`);
  await expect(
    page.getByRole("heading", {
      name: "Add your address to Permalink Owner's address book",
    }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Fill in your details below. Only Permalink Owner can see what you submit.",
    ),
  ).toBeVisible();
  // Write-only page: the form never pre-fills anything.
  await expect(page.locator("#full_name")).toHaveValue("");

  await page.locator("#full_name").fill(fields.full_name);
  if (fields.email) await page.locator("#email").fill(fields.email);
  if (fields.city) await page.locator("#city").fill(fields.city);
  await waitForTurnstile(page);
  await page.getByRole("button", { name: "Add my details" }).click();
  await expect(page).toHaveURL(new RegExp(`/b/${slug}/thanks$`));
  await expect(
    page.getByRole("heading", { name: /Thanks — you're all set!/ }),
  ).toBeVisible();
  await context.close();
}

test.beforeAll(async ({ browser }) => {
  // Permalink submits are capped at 5/hour per IP — reset so repeated suite
  // runs from this machine never inherit a spent budget.
  await clearRateLimits();

  ownerPage = await browser.newPage();
  await signupAndLogin(ownerPage, ownerEmail);
  await createBook(ownerPage, { displayName: "Permalink Owner", slug });
});

test.afterAll(async () => {
  await cleanupUser(ownerEmail);
  await ownerPage.close();
});

test("an unknown slug 404s", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const response = await page.goto(`/b/${uniqueSlug("no-such-book")}`);
  expect(response?.status()).toBe(404);
  await context.close();
});

test("an anonymous visitor submits the write-only form", async ({ browser }) => {
  await submitAsVisitor(browser, {
    full_name: "Greta Approve",
    email: "greta@e2e.test",
    city: "Geneva",
  });
});

test("a second visitor submits (queued for the reject flow)", async ({
  browser,
}) => {
  await submitAsVisitor(browser, { full_name: "Rex Reject" });
});

test("the owner approves a submission into a contact", async () => {
  await ownerPage.goto("/dashboard/review");
  const card = ownerPage.locator("ol > li", { hasText: "Greta Approve" });
  await expect(card).toContainText("New contact");
  await expect(card).toContainText("Geneva");
  await card.getByRole("button", { name: "Add contact" }).click();
  await expect(card).toHaveCount(0); // action revalidates the queue

  await ownerPage.goto("/dashboard");
  await expect(
    ownerPage.getByRole("link", { name: "Greta Approve" }),
  ).toBeVisible();
});

test("the owner rejects a submission and it never becomes a contact", async () => {
  await ownerPage.goto("/dashboard/review");
  const card = ownerPage.locator("ol > li", { hasText: "Rex Reject" });
  await card.getByRole("button", { name: "Reject" }).click();
  await expect(card).toHaveCount(0);
  await expect(ownerPage.getByText("No pending submissions.")).toBeVisible();

  await ownerPage.goto("/dashboard");
  await expect(
    ownerPage.getByRole("link", { name: "Rex Reject" }),
  ).toHaveCount(0);
});
