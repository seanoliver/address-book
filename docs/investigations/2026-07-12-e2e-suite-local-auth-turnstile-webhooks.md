# Driving auth, Turnstile, and webhooks from a local Playwright suite

**Date:** 2026-07-12
**Prompted by:** Feature build (Task 17 — committed Playwright e2e suite)

## Context

Turning the ad-hoc Task 6–16 verification scripts into a committed suite
(`e2e/`) required answering: how does a test sign in through the REAL
magic-link flow, get past Turnstile on the public forms, hold a raw update
token, and drive Resend webhook state — all against the local stack, twice in
a row, with no manual steps?

## Key findings

- **Local Supabase does NOT enforce `[auth.rate_limit] email_sent`.**
  `supabase/config.toml` says `email_sent = 2` (per hour), which would cap
  the suite at two signups — but 12 back-to-back `/auth/v1/otp` requests all
  returned 200 against the local stack. Real magic-link signups per spec are
  safe locally with no config change. Do not assume the same in production.
- **Magic links are fetchable from Mailpit's REST API** (port 54324, the
  `[local_smtp]` service): `GET /api/v1/search?query=to:<email>` (newest
  first) → `GET /api/v1/message/<ID>` → the `/auth/confirm?token_hash=...`
  URL is in the `Text` body. See `fetchMagicLink` in `e2e/helpers.ts`.
- **`src/lib/db/*` is unimportable from the Playwright runner**: those
  modules import `server-only`, which throws outside an RSC bundle (vitest
  aliases it to a stub; Playwright has no such hook). The suite gets its own
  tiny postgres.js client, `e2e/db.ts`, which also mirrors the
  `generateToken` logic from `src/lib/tokens.ts` (raw token → sha256) so a
  spec can hold a live raw token — the only other place one exists is the
  dry-run email log, unreachable from a test.
- **Turnstile's always-pass test keys work headlessly but not instantly**:
  the widget still loads Cloudflare's real `api.js` and injects the hidden
  `cf-turnstile-response` input asynchronously. Submitting before that input
  has a value fails verification (fail-closed). `waitForTurnstile` polls the
  input for a non-empty value before every recipient-form submit.
- **The webhook is drivable with the real svix lib**: sign the payload with
  `new Webhook(process.env.RESEND_WEBHOOK_SECRET).sign(id, ts, payload)` and
  POST it — the dev server verifies with the same `.env.local` secret
  (`whsec_placeholder` decodes fine; Node's base64 decoder is lenient).

## How it works

- `playwright.config.ts` loads `.env.local` into the TEST process via
  `process.loadEnvFile` (never overrides existing env); the `webServer`
  (`pnpm dev`, `reuseExistingServer: true`) loads it itself.
- Each spec owns a unique-per-run user/slug (`uniqueEmail`/`uniqueSlug`,
  timestamp + random) and tears everything down with one
  `delete from auth.users where email = ...` — the FK chain
  auth.users → profiles → books → contacts → (submissions, update_tokens,
  email_sends, contact_events) is `on delete cascade` end to end.
- The token and permalink specs call `clearRateLimits()`
  (`delete from private.rate_limits`) in `beforeAll`: the whole suite runs
  from one IP, and permalink submits are capped at 5/hour/IP — without the
  reset the third back-to-back run would start flaking.

## Gotchas

- `supabase status` from the globally installed CLI fails to parse this
  project's `config.toml` (`health_timeout`, `local_smtp`, `pgdelta` keys);
  use the pinned devDependency: `pnpm exec supabase ...`.
- Playwright resolves the `@/*` tsconfig alias, but importing anything under
  `src/lib` that transitively touches `server-only` still throws at runtime —
  the alias working makes this trap easy to walk into.
- Fixture UUIDs like `00000000-...-e001` fail `z.uuid()` (non-RFC4122 — see
  `docs/bugs/2026-07-11-zod-uuid-rejects-non-rfc4122-fixture-ids.md`);
  `e2e/db.ts` lets Postgres `gen_random_uuid()` generate all ids instead.
- The dashboard "Updated" chip only appears when a token-sourced
  `contact_events` row is NEWER than the latest `email_sends.sent_at` — a
  spec asserting it must seed the send BEFORE submitting the token update.

## References

- `playwright.config.ts`, `e2e/db.ts`, `e2e/helpers.ts`, `e2e/*.spec.ts`
- `supabase/config.toml` (`[auth.rate_limit]`, `[local_smtp]`)
- `src/lib/tokens.ts`, `src/lib/db/admin.ts`, `supabase/migrations/*`
- Mailpit API: https://mailpit.axllent.org/docs/api-v1/
- Plan: `docs/plans/2026-07-11-address-book-implementation.md` Task 17
  (as-built notes)
