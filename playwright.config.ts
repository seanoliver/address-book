import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// The dev server loads .env.local itself; this makes the same config visible
// to the TEST process (e2e/db.ts needs DATABASE_URL, the webhook spec signs
// with RESEND_WEBHOOK_SECRET). Node's loadEnvFile never overrides variables
// already present in the environment.
process.loadEnvFile(path.resolve(__dirname, ".env.local"));

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
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
