import { randomBytes } from "node:crypto";
import { expect, type Page } from "@playwright/test";

/** Supabase's local Mailpit (config.toml [local_smtp], port 54324). */
const MAILPIT_URL = "http://127.0.0.1:54324";

/** Unique-per-run factories so concurrent/repeated runs never collide. */
export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}@e2e.test`;
}

export function uniqueSlug(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
}

/**
 * Poll Mailpit's REST API for the newest message to `email` and pull the
 * /auth/confirm magic link out of its text body.
 */
async function fetchMagicLink(email: string): Promise<string> {
  const query = encodeURIComponent(`to:${email}`);
  let link: string | null = null;
  await expect
    .poll(
      async () => {
        const search = await fetch(`${MAILPIT_URL}/api/v1/search?query=${query}`);
        if (!search.ok) return null;
        const { messages } = (await search.json()) as {
          messages: { ID: string }[];
        };
        if (messages.length === 0) return null; // not delivered yet
        // messages[] is newest-first — take the latest link for this address.
        const res = await fetch(`${MAILPIT_URL}/api/v1/message/${messages[0].ID}`);
        if (!res.ok) return null;
        const { Text } = (await res.json()) as { Text: string };
        link = Text.match(/https?:\/\/[^\s)]+\/auth\/confirm[^\s)]*/)?.[0] ?? null;
        return link;
      },
      { message: `magic link email for ${email} in Mailpit`, timeout: 15_000 },
    )
    .not.toBeNull();
  // TS can't see the closure assignment above; the poll guarantees non-null.
  if (link === null) throw new Error(`no magic link found for ${email}`);
  return link;
}

/**
 * Sign up (or in) through the REAL /login form: request a magic link, fetch
 * it from Mailpit, and visit it. Lands on /dashboard — or /dashboard/settings
 * for a brand-new user (onboarding redirect: no book yet).
 */
export async function signupAndLogin(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send magic link" }).click();
  await expect(
    page.getByText("Check your email for a sign-in link."),
  ).toBeVisible();
  const link = await fetchMagicLink(email);
  await page.goto(link);
  await expect(page).toHaveURL(/\/dashboard(\/settings)?$/);
}

/** Create (or update) the signed-in owner's book through the real settings form. */
export async function createBook(
  page: Page,
  opts: {
    title: string;
    slug: string;
    /** Omitted toggles keep the form defaults (all enabled for a new book). */
    toggles?: Partial<Record<"partner_name" | "kids_names" | "birthday", boolean>>;
  },
): Promise<void> {
  await page.goto("/dashboard/settings");
  await page.locator("#title").fill(opts.title);
  await page.locator("#slug").fill(opts.slug);
  for (const [name, on] of Object.entries(opts.toggles ?? {})) {
    await page.locator(`input[name="${name}"]`).setChecked(on);
  }
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
}

/**
 * Wait for the Turnstile widget to inject a non-empty cf-turnstile-response
 * into the enclosing form. The local always-pass test keys resolve without
 * interaction, but the script loads from Cloudflare — submit before the
 * response exists and verification fails closed.
 */
export async function waitForTurnstile(page: Page): Promise<void> {
  await expect(
    page.locator('input[name="cf-turnstile-response"]'),
  ).toHaveValue(/.+/, { timeout: 20_000 });
}
