# Security Model

This app stores home addresses — of people who never signed up for it and can't audit it. Leaking them is the failure mode the architecture is built around, and because the code is open source, the security model can't rely on obscurity: every mechanism below is inspectable in this repo and covered by tests.

This document describes the model as implemented, the production checklist for deployments, and how to report a vulnerability.

## Architecture: two independent walls

A leak requires **two independent failures** — a bug in server code *and* a bug in database policy.

**Wall 1 — server-only data access.** The browser talks to exactly two things: Next.js routes and Supabase Auth. The Supabase Data API (PostgREST) is disabled in production (exposed schemas removed — see the checklist), so the public surface of a deployment is Next.js routes, Supabase Auth, nothing else. All data access happens in server actions and route handlers via Drizzle over a direct Postgres connection (`DATABASE_URL`, server-env only).

**Wall 2 — RLS enforced on every server query.** Every table has row-level security enabled with default-deny, owner-scoped policies (`books.owner_id = auth.uid()`). Owner-facing queries never run as the table owner: `withRls` (`src/lib/db/index.ts`) wraps each one in a transaction that sets the user's JWT claims and drops to the `authenticated` role, so a forgotten `where owner_id = …` in app code hits the RLS wall instead of leaking data. The wrapper is integration-tested (`src/lib/db/rls.test.ts`), including proof that no role or claims leak onto the pooled connection after commit.

### Untrusted surfaces: SECURITY DEFINER functions

The two unauthenticated flows — token updates (`/u/[token]`) and permalink self-adds (`/b/[slug]`) — go through four narrow `SECURITY DEFINER` functions in a `private` schema (`supabase/migrations/00000000000002_private_functions.sql`):

- `private.get_contact_for_token` — token lookup, returns only the contact's own fields plus display metadata
- `private.apply_token_update` — single-use update, re-gated against the book's enabled fields server-side
- `private.submit_to_book` — write-only permalink insert
- `private.check_rate_limit` — Postgres-backed fixed-window rate limiter

All four have a locked `search_path` and `EXECUTE` revoked from `public`, `anon`, and `authenticated` — only the direct server connection can call them. Nothing else in any reachable role can touch `update_tokens`.

The admin connection that calls them (`dbAdmin`, which bypasses RLS) is lint-restricted: `no-restricted-imports` in `eslint.config.mjs` blocks importing `db/admin` outside an explicit allowlist of sanctioned call sites, each annotated with its rationale.

### Least-privilege grants (and the TRUNCATE story)

RLS does not apply to `TRUNCATE`, and Supabase's default ACLs historically leave residual `TRUNCATE`/`REFERENCES`/`TRIGGER`/`MAINTAIN` privileges for client roles — meaning a compromised `authenticated` session could have emptied whole tables *through* enabled RLS. The core migration revokes **everything** from `anon` and `authenticated` (including via `ALTER DEFAULT PRIVILEGES`, so future tables are covered), then grants back exactly the DML the policies mediate:

- `anon` holds **zero** grants on every table
- `update_tokens` grants **nothing** to any client role — even the owner's `SELECT` throws `permission denied`
- `submissions` has no `INSERT` grant — only `private.submit_to_book` can create one
- `email_sends` and `contact_events` are read-only for owners

The pgTAP suite (`supabase/tests/database/01_rls.sql`) asserts the exact expected grant matrix — a stray grant (or a dropped one) in any future migration shows up as a named failure — plus cross-user isolation and `WITH CHECK` probes for every policy. Full story: [docs/bugs/2026-07-11-residual-truncate-privileges-bypass-rls.md](bugs/2026-07-11-residual-truncate-privileges-bypass-rls.md).

## Token design

Update links (`/u/<token>`) are bearer credentials, treated accordingly (`src/lib/tokens.ts`):

- **32 bytes CSPRNG** (`crypto.randomBytes`), 43-char unpadded base64url in the URL
- **SHA-256 at rest** — the database stores only `update_tokens.token_hash`; a DB leak exposes no live links
- **30-day TTL** (`TOKEN_TTL_DAYS`)
- **Single-use** — consumed (`used_at`) on successful update, inside a `SELECT … FOR UPDATE` so concurrent submits can't double-spend
- **Single-active-per-contact** — re-running "Request addresses" deletes the contact's previous unused tokens before minting, so old links die immediately instead of living out their expiry
- **Shape gate before DB** — both the page and the action test the token against `TOKEN_SHAPE` (`^[A-Za-z0-9_-]{43}$`) before any query; malformed tokens cost zero DB work
- **Never logged** — the raw token exists only in the emailed URL; `logDbError` strips query params, and the sole exception is the `EMAIL_DRY_RUN=1` dev log, which is hard-disabled when `NODE_ENV=production`
- `/u/*` responses carry `X-Robots-Tag: noindex, nofollow` (`next.config.ts`) so a leaked link can't end up in a search index
- Emails contain no address data — only the link, which identifies nothing by itself

## Enumeration-proofing

- Invalid, expired, and already-used tokens all render the **same generic page** — no distinction an attacker can use to probe for live tokens.
- Permalink submits return an **identical response** (and take the same code path) whether or not the submitted email matches an existing contact. A match surfaces only to the owner, in the review queue.
- The permalink page itself (`src/lib/queries/public-book.ts`) selects only the book title, owner display name, and enabled-field flags — never ids, counts, or contact data; the select's key set is asserted in tests so a widened query fails CI.
- Auth failures on `/login` show one generic error, never Supabase's detail.

## Rate limits

All public surfaces are metered by `private.check_rate_limit` — a fixed-window limiter backed by Postgres (no extra infra). Client IPs are **hashed (SHA-256) before use as keys**, so `private.rate_limits` never stores raw IPs. Callers **fail closed**: a limiter outage denies the request rather than waving it through.

| Surface | Key | Limit |
|---|---|---|
| `/u/[token]` page view | `token-view:sha256(ip)` | 30 / hour |
| `/u/[token]` submit | `token-submit:sha256(ip)` | 10 / hour |
| `/b/[slug]` page view | `permalink-view:sha256(ip)` | 60 / hour |
| `/b/[slug]` submit, per client | `permalink-submit:sha256(ip)` | 5 / hour |
| `/b/[slug]` submit, per book | `permalink-book:<slug>` | 100 / day |

Ordering is deliberate: on permalink submits the per-IP limit runs first (a client burns its own budget before anything shared), and the per-book limit runs **after** the Turnstile gate — so bot-generated junk can never drain a targeted book's daily budget.

## Bot protection (Turnstile)

Both public submit flows require a Cloudflare Turnstile pass. `verifyTurnstile` (`src/lib/turnstile.ts`) **fails closed** on every failure mode — missing secret, empty or oversized response, non-2xx from siteverify, malformed body, network throw — and never logs the response token (it's attacker-supplied and the siteverify payload can echo it).

## Input handling and size caps

Every write passes through three independent nets:

1. **Zod schemas** with max lengths mirroring the SQL CHECK constraints (`src/lib/validation/*`) — also keeping Postgres class-22 errors (which can echo input values into logs) unreachable
2. **The SECURITY DEFINER functions**, which refuse non-object payloads and anything over 64 KB, whitelist the keys they map (junk keys never reach storage, including the audit trail), and re-gate optional fields against the book's `enabled_fields` server-side
3. **CHECK constraints** on every column

Additional caps: CSV imports are rejected over 1 MB before parsing and capped at 1000 rows (re-validated server-side); the webhook route caps bodies at 64 KB (declared Content-Length *and* actual length). Submission payloads are attacker-controlled jsonb — the review queue renders them through a lenient display-only parser (unknown keys dropped, non-string values dropped, 200-char display truncation, malformed payloads get a reject-only card) and relies on React's escaping; `dangerouslySetInnerHTML` appears nowhere near user data.

## CSV export: formula injection

A contact who sets their name to `=HYPERLINK(...)` via the token form must not become an exploit when the owner opens the export in Excel/Numbers/Sheets. Per OWASP CSV-injection guidance, `contactsToCsv` (`src/lib/csv/export.ts`) prefixes any cell starting with `=` `+` `-` `@`, tab, or CR with a neutralizing `'` — a documented tradeoff (the `'` survives re-import) of safety over losslessness.

## PII-safe logging

- `logDbError` (`src/lib/log.ts`) never logs a raw DB error: Drizzle's messages embed the full query with parameters, and Postgres `detail` can embed row values. Only the error code, constraint name, and the Postgres message (which names relations, not values) are logged.
- The email layer never logs message bodies (they contain personal token URLs); real-mode failures log Resend's error name/message only.
- Raw tokens, raw IPs, and Turnstile responses are never logged anywhere.
- No PII in URLs or email subject lines.

## Webhook verification

`/api/webhooks/resend` (`src/app/api/webhooks/resend/route.ts`) is the only unauthenticated write path outside the definer functions:

- **svix signature verification over the raw request bytes**, before any parsing; bad or missing signatures → 401; missing server secret → 500 (never fail-open)
- 64 KB body cap so unauthenticated input is never HMAC'd at megabyte scale
- Verified-but-malformed payloads are acked with 200 (Resend schema drift must not cause retry storms) and the payload is never logged
- A **status precedence guard** (`sent < delivered < opened < bounced/complained`) means retried or out-of-order events can only move a send's status forward — a late `email.delivered` never regresses `opened`, and nothing regresses a bounce

## Audit trail

`contact_events` records every contact mutation — owner edits, token updates, approved submissions — with a source tag and a diff. The table is client-unwritable (no INSERT grant or policy; rows are appended server-side only), and the token-update path whitelists payload keys so junk from the untrusted payload never reaches the stored diff.

## Production checklist

Work through this before pointing real traffic at a deployment:

- [ ] **Disable the Data API**: Supabase Dashboard → Settings → Data API → **remove all exposed schemas**. Local dev keeps it on because the CLI and pgTAP need the stack; production must not. This is Wall 1 — do not skip it.
- [ ] **`DATABASE_URL` uses the transaction-mode pooler (port 6543) with `sslmode=require`**, and lives only in server-side env (never `NEXT_PUBLIC_*`, never in client-reachable config).
- [ ] **Enable Supabase Auth email rate limits** (Dashboard → Auth → Rate Limits) — magic-link requests are an email-sending endpoint.
- [ ] **Auth settings note**: the app is passwordless (magic link + Google), so `minimum_password_length` is N/A — but confirm signups stay confirmation-gated: the magic-link flow inherently verifies the email, and local `config.toml` sets `enable_confirmations = false` for dev convenience only. Review the hosted Auth email settings rather than copying the local config.
- [ ] **Real Turnstile keys** — the keys in `.env.local.example` are Cloudflare's public always-pass test keys; with them, the bot wall is decorative.
- [ ] **Resend**: verify the sending domain (SPF/DKIM) and set the webhook endpoint + `RESEND_WEBHOOK_SECRET` — without the secret the webhook route refuses all events (fail closed).
- [ ] **Vercel env vars marked Sensitive** so they're write-only in the dashboard.
- [ ] **`EMAIL_DRY_RUN` must be unset.** The code also gates it on `NODE_ENV !== "production"` (a stray flag can't divert real sends into console logs of token links), but don't rely on the belt when you can remove the braces.
- [ ] **Schedule a `private.rate_limits` sweep** — the table grows with distinct key×window entries and has no in-band cleanup. pg_cron:

  ```sql
  select cron.schedule('sweep-rate-limits', '17 4 * * *',
    $$ delete from private.rate_limits where window_start < now() - interval '1 day' $$);
  ```

- [ ] **`X-Robots-Tag` for `/u/*`** ships in `next.config.ts` — verify the header survives any proxy/CDN in front of the app (`curl -sI https://<app>/u/anything | grep -i x-robots-tag`).

## Reporting a vulnerability

Please **do not open a public GitHub issue** for security problems. Email **helloseanoliver@gmail.com** with a description and reproduction steps; you'll get an acknowledgment within a few days. Coordinated disclosure is appreciated — this app holds other people's home addresses, so please allow a fix to ship before publishing details.

## Design-decision records

The non-obvious security decisions are journaled with symptom, root cause, and guardrail — useful reading before touching the related code:

- [Residual TRUNCATE privileges bypass RLS](bugs/2026-07-11-residual-truncate-privileges-bypass-rls.md) — why the grants matrix is asserted exactly
- [citext equality under a locked search_path](bugs/2026-07-11-citext-equality-under-locked-search-path.md) — why `submit_to_book` uses `operator(extensions.=)`
- [RSC props leak disabled token fields](bugs/2026-07-11-rsc-props-leak-disabled-token-fields.md) — why disabled fields are blanked server-side before props cross to the client
- [`reset role` masks errors in aborted transactions](bugs/2026-07-11-reset-role-masks-errors-in-aborted-transaction.md) — error handling inside `withRls`
- [Double-approve race (check-then-act)](bugs/2026-07-12-double-approve-race-check-then-act.md) — why review approvals gate on an atomic status flip
- [React 19 form reset wipes input on action error](bugs/2026-07-11-react19-form-reset-wipes-input-on-action-error.md)
- [Zod uuid rejects non-RFC4122 fixture ids](bugs/2026-07-11-zod-uuid-rejects-non-rfc4122-fixture-ids.md)
- Investigations: [Supabase SSR auth on Next 16](investigations/2026-07-11-supabase-ssr-auth-on-next-16.md), [Drizzle onConflict with partial unique indexes](investigations/2026-07-11-drizzle-onconflict-partial-unique-index.md), [E2E suite: local auth, Turnstile, webhooks](investigations/2026-07-12-e2e-suite-local-auth-turnstile-webhooks.md)
