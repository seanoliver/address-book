import "server-only";

/**
 * Startup assertion for required server env vars. Deliberately dumb — no
 * schema library, just presence checks with a clear error naming every
 * missing var at once (instead of failing one-at-a-time deep in a request,
 * e.g. APP_URL silently producing "undefined/u/<token>" links).
 *
 * Called from src/lib/db/admin.ts module init: every server path that can
 * touch data imports the db layer (directly or transitively), so a
 * misconfigured deployment fails loudly at first touch.
 */

const ALWAYS_REQUIRED = [
  "APP_URL",
  "DATABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

/** Only needed when emails actually go out (see isEmailDryRun in email/resend.ts). */
const EMAIL_REQUIRED = ["RESEND_API_KEY", "EMAIL_FROM"] as const;

export function assertServerEnv(): void {
  const missing: string[] = ALWAYS_REQUIRED.filter((k) => !process.env[k]);

  // Mirror of isEmailDryRun() in @/lib/email/resend.ts — duplicated (two
  // lines) so this module stays dependency-free and import-cycle-proof.
  const emailDryRun =
    process.env.EMAIL_DRY_RUN === "1" && process.env.NODE_ENV !== "production";
  if (!emailDryRun) {
    missing.push(...EMAIL_REQUIRED.filter((k) => !process.env[k]));
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}. ` +
        "See .env.local.example for the full list.",
    );
  }
}
