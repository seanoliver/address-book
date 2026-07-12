import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { Webhook } from "svix";
import {
  cleanupUser,
  getUserIdByEmail,
  seedBook,
  seedContact,
  seedEmailSend,
} from "./db";
import { signupAndLogin, uniqueEmail, uniqueSlug } from "./helpers";

/**
 * Resend webhook → dashboard status chips. A send row is seeded in its
 * insert-time 'sent' state, then signed svix events (the same signing scheme
 * Resend uses) drive it Delivered → Opened, including the out-of-order case:
 * a LATE delivered must never regress an Opened chip.
 */
test.describe.configure({ mode: "serial" });

const ownerEmail = uniqueEmail("webhook-owner");
const resendId = `e2e_wh_${Date.now().toString(36)}`;

let ownerPage: Page;
let msgCounter = 0;

/** Sign `payload` exactly the way svix (and therefore Resend) does. */
function signedHeaders(payload: string): Record<string, string> {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) throw new Error("RESEND_WEBHOOK_SECRET is not set");
  const id = `msg_e2e_${Date.now().toString(36)}_${msgCounter++}`;
  const ts = new Date();
  return {
    "content-type": "application/json",
    "svix-id": id,
    "svix-timestamp": Math.floor(ts.getTime() / 1000).toString(),
    "svix-signature": new Webhook(secret).sign(id, ts, payload),
  };
}

async function postEvent(request: APIRequestContext, type: string): Promise<void> {
  const payload = JSON.stringify({
    type,
    created_at: new Date().toISOString(),
    data: { email_id: resendId },
  });
  const res = await request.post("/api/webhooks/resend", {
    headers: signedHeaders(payload),
    data: payload,
  });
  expect(res.status()).toBe(200);
}

/** The dashboard is dynamic — a fresh load re-reads email_sends. */
async function expectChip(status: string): Promise<void> {
  await ownerPage.goto("/dashboard");
  const row = ownerPage
    .getByRole("table", { name: "Contacts" })
    .locator("tbody tr", { hasText: "Webby Hook" });
  await expect(row.getByText(status, { exact: true })).toBeVisible();
}

test.beforeAll(async ({ browser }) => {
  ownerPage = await browser.newPage();
  await signupAndLogin(ownerPage, ownerEmail);
  const ownerId = await getUserIdByEmail(ownerEmail);
  const bookId = await seedBook({
    ownerId,
    slug: uniqueSlug("webhook-book"),
    title: "Webhook E2E Book",
  });
  const contactId = await seedContact({
    bookId,
    fullName: "Webby Hook",
    email: "webby@e2e.test",
  });
  await seedEmailSend({ contactId, bookId, resendId });
});

test.afterAll(async () => {
  await cleanupUser(ownerEmail);
  await ownerPage.close();
});

test("a seeded send starts as Sent", async () => {
  await expectChip("Sent");
});

test("email.delivered moves the chip to Delivered", async ({ request }) => {
  await postEvent(request, "email.delivered");
  await expectChip("Delivered");
});

test("email.opened moves the chip to Opened", async ({ request }) => {
  await postEvent(request, "email.opened");
  await expectChip("Opened");
});

test("a late email.delivered never regresses Opened", async ({ request }) => {
  await postEvent(request, "email.delivered"); // acked (200) but a no-op
  await expectChip("Opened");
});
