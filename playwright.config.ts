import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// The dev server loads .env.local itself; this makes the same config visible
// to the TEST process (e2e/db.ts needs DATABASE_URL, the webhook spec signs
// with RESEND_WEBHOOK_SECRET). Node's loadEnvFile never overrides variables
// already present in the environment.
process.loadEnvFile(path.resolve(__dirname, ".env.local"));

// Override the browser/server port when another worktree already owns :3000.
// APP_URL remains the configured canonical origin and is asserted separately.
const port = Number(process.env.E2E_PORT ?? "3000");
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error(`Invalid E2E_PORT: ${process.env.E2E_PORT}`);
}
const appUrl = `http://localhost:${port}`;

export default defineConfig({
  testDir: "e2e",
  // Specs are self-contained (own users, own books) and may run in parallel
  // worker processes; tests WITHIN a file run in order.
  fullyParallel: false,
  // Local-first suite: no retries — a flaky test is a bug to fix, not retry.
  retries: 0,
  timeout: 30_000,
  // Dev-mode route compiles make first paints slow; give assertions headroom.
  expect: { timeout: 10_000 },
  reporter: "list",
  use: {
    baseURL: appUrl,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: process.env.E2E_PORT
      ? `pnpm exec next dev --webpack -p ${port}`
      : "pnpm dev",
    url: appUrl,
    // Local: attach to an already-running dev server. CI: always boot fresh.
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
