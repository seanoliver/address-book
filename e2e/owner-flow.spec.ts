import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { cleanupUser } from "./db";
import { createBook, signupAndLogin, uniqueEmail, uniqueSlug } from "./helpers";

/**
 * The owner's whole happy path in one serial journey: signup → onboarding →
 * create book → add/edit a contact (audit trail) → export CSV → import CSV →
 * search. Serial because each step builds on the last; the spec owns its
 * user and removes it (and everything cascaded) afterwards.
 */
test.describe.configure({ mode: "serial" });

const ownerEmail = uniqueEmail("owner");
const slug = uniqueSlug("owner-book");

let page: Page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
});

test.afterAll(async () => {
  await cleanupUser(ownerEmail);
  await page.close();
});

test("signs up via magic link and lands on onboarding", async () => {
  await signupAndLogin(page, ownerEmail);
  // No book yet → the dashboard bounces to settings for onboarding.
  await expect(page).toHaveURL(/\/dashboard\/settings$/);
  await expect(
    page.getByRole("heading", { name: "Set up your address book" }),
  ).toBeVisible();
});

test("creates a book from the settings form", async () => {
  await createBook(page, { title: "E2E Owner Book", slug });
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "E2E Owner Book" }),
  ).toBeVisible();
  await expect(page.getByText("No contacts yet")).toBeVisible();
});

test("adds a contact via the form", async () => {
  await page.getByRole("link", { name: "Add contact" }).click();
  await page.locator("#full_name").fill("Ada Lovelace");
  await page.locator("#email").fill("ada@e2e.test");
  await page.locator("#city").fill("London");
  await page.getByRole("button", { name: "Add contact" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page
      .getByRole("table", { name: "Contacts" })
      .getByRole("link", { name: "Ada Lovelace" }),
  ).toBeVisible();
});

test("edits the contact and the audit trail records the change", async () => {
  await page.getByRole("link", { name: "Ada Lovelace" }).click();
  await expect(page).toHaveURL(/\/dashboard\/contacts\/[0-9a-f-]+$/);
  await page.locator("#city").fill("Boston");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");

  await page.reload();
  const history = page.getByRole("region", { name: "History" });
  // Two entries: the create snapshot and the edit diff (newest first).
  await expect(history.locator("li")).toHaveCount(2);
  const latest = history.locator("li").first();
  await expect(latest).toContainText("You");
  await expect(latest.locator("pre")).toContainText('"city"');
  await expect(latest.locator("pre")).toContainText("Boston");
});

test("exports contacts as CSV with the canonical header", async () => {
  await page.goto("/dashboard");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export CSV" }).click();
  const download = await downloadPromise;
  const csv = readFileSync(await download.path(), "utf8");

  const lines = csv.replace(/^﻿/, "").split("\r\n");
  expect(lines[0]).toBe(
    "full_name,partner_name,kids_names,email,birthday,address_line1," +
      "address_line2,city,state_region,postal_code,country,notes",
  );
  expect(lines[1]).toContain("Ada Lovelace");
  expect(lines[1]).toContain("ada@e2e.test");
  expect(lines[1]).toContain("Boston");
});

test("imports a 3-row CSV through the UI", async () => {
  await page.goto("/dashboard/import");
  const csv = [
    "full_name,email,city",
    "Bea Import,bea@e2e.test,Berlin",
    "Cal Import,cal@e2e.test,Cork",
    "Dot Import,,Dover", // no email — still a valid row
  ].join("\n");
  await page.setInputFiles("#csv-file", {
    name: "contacts.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf8"),
  });
  await expect(page.getByText("3 contacts ready")).toBeVisible();
  await page.getByRole("button", { name: "Import 3 contacts" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Imported 3 contacts, skipped 0.",
  );

  await page.goto("/dashboard");
  await expect(
    page.getByRole("table", { name: "Contacts" }).locator("tbody tr"),
  ).toHaveCount(4);
});

test("search filters the list and clears back to all contacts", async () => {
  await page.locator("#q").fill("Ada");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/\?q=Ada$/);
  const rows = page.getByRole("table", { name: "Contacts" }).locator("tbody tr");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Ada Lovelace");

  await page.locator("#q").fill("nobody-matches-this");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByText(/No contacts match/)).toBeVisible();

  await page.getByRole("link", { name: "Clear search" }).click();
  await expect(rows).toHaveCount(4);
});
