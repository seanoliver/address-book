# Address Book — Design

**Date:** 2026-07-11
**Status:** Approved

An open-source, self-hostable address book for people who mail things to people — holiday cards being the canonical use case. Inspired by Postables' address book feature. Owners keep a list of contacts, email each contact a unique link to update their own address, re-run that request in bulk each year, and share a permalink where people can add themselves. Security is the top design priority: this app stores home addresses, and leaking them is the failure mode the architecture is built around.

## Decisions log

| Decision | Choice |
|---|---|
| Recipient UX | Tokenized link, no account required |
| Stack | Next.js (App Router) on Vercel + Supabase + Resend + Cloudflare Turnstile |
| Permalink | Write-only form; visitors can never read book contents |
| Email provider | Resend (batch sends, webhooks for status) |
| Addresses | International-friendly structured fields |
| V1 extras | CSV import, CSV export, send-status tracking |
| Not in v1 | Groups/tags, Stripe/plans, multiple books per user, recipient self-service link renewal |
| Access architecture | **Server-only + RLS on (option B)** — chosen over hybrid and client-first after explicit security comparison |

## 1. System overview

Next.js (App Router) on Vercel + Supabase (Postgres, Auth, RLS) + Resend (email) + Cloudflare Turnstile (bot protection on public forms).

The browser never talks to Supabase's data APIs:

- **Auth:** `@supabase/ssr` with cookie-based sessions (magic link + Google OAuth). This is the only Supabase endpoint the browser touches.
- **All data access** goes through Next.js server actions / route handlers. The server connects to Postgres directly via Drizzle (which has first-class Supabase RLS support) and wraps every query in a transaction that sets the user's JWT claims and drops to the `authenticated` role — **RLS is enforced on every server query** even though the query originates from trusted code. A forgotten `where owner_id = ...` in app code hits the RLS wall instead of leaking data.
- **The Data API (PostgREST) is disabled** — exposed schemas emptied. The public surface of a deployment is: Next.js routes, Supabase Auth, nothing else.
- **Untrusted flows** (token update, permalink submit) go through route handlers that call three narrow `SECURITY DEFINER` Postgres functions in a private schema. Nothing else can touch `update_tokens`.

**Defense in depth:** a leak requires two independent failures — a bug in server code *and* a bug in RLS policies.

**Tooling boundary:** Supabase CLI migrations are the single source of truth for schema, policies, and functions. Drizzle is purely the query layer (introspected/generated types, no drizzle-kit migrations).

## 2. Data model

```
profiles        id (= auth.users.id), full_name
books           id, owner_id, slug (unique), title, enabled_fields jsonb
contacts        id, book_id, full_name, partner_name, kids_names,
                email (citext), birthday,
                address_line1, address_line2, city, state_region,
                postal_code, country, notes, created_at, updated_at
submissions     id, book_id, payload jsonb, status (pending/approved/rejected)
update_tokens   id, contact_id, token_hash, expires_at, used_at
email_sends     id, contact_id, book_id, resend_id, status
                (sent/delivered/opened/bounced/complained), sent_at
contact_events  id, contact_id, source (owner/token/submission), diff jsonb  -- audit trail
```

- One book per user in v1; `books` is a table so multiple books later is a migration, not a rewrite.
- `enabled_fields` jsonb drives which optional fields (partner name, kids' names, birthday) appear on the token-update and permalink forms. Name, email, and address are always on.
- `partner_name` is a first-class column — the dashboard searches and sorts by it. Knowing the partner is a primary navigation affordance.
- Addresses are structured but international: line1/line2, city, state_region, postal_code, country.

## 3. Security design

- **RLS default-deny on every table.** Owner-scoped policies via `books.owner_id = auth.uid()`. `update_tokens` and `contact_events` have *no* policies — no role reachable from app code can read them outside the definer functions.
- **Tokens:** 32 bytes CSPRNG, base64url in the URL, only the SHA-256 hash stored. 30-day expiry, single-use (consumed on successful update). Invalid, expired, and used tokens all return the same generic 404. Tokens are never logged.
- **Permalink is write-only and enumeration-proof:** submitting returns an identical response whether or not the email matches an existing contact. Matches surface only to the owner in the review queue ("possible update to existing contact — merge?"). Self-adds never write directly to `contacts`; the owner approves them.
- **Rate limiting + Turnstile** on both public endpoints (permalink submit, token update). Zod validation and length caps on every field.
- **pgTAP RLS regression tests** (`supabase test db`): every table asserts deny-by-default and cross-user isolation. CI fails if a new table ships without RLS. This is the guardrail against the OSS-contributor footgun.
- **Resend webhook route verifies the webhook signature** before touching `email_sends`.
- **Secrets:** direct `DATABASE_URL` uses a restricted role (not `postgres`), lives only in Vercel server env. No service-role key in any client-reachable path.
- No PII in URLs or email subject lines; the token link is the only sensitive URL and it identifies nothing by itself.

## 4. Core flows

1. **Setup:** magic-link/Google sign-in → create book (title, slug, field toggles) → CSV import (browser-side parse for preview; rows inserted via RLS-scoped server action).
2. **Request addresses:** select contacts (or all) → server action mints one token per contact, sends via Resend batch API, logs to `email_sends`. Re-running it (e.g., next year) mints fresh tokens; old ones are dead.
3. **Recipient update:** click link → `/u/[token]` → form pre-filled with only their own current info + the owner's enabled fields → submit → contact updated, token consumed, audit row written.
4. **Self-add:** `/b/[slug]` → write-only form → lands in `submissions` → owner notified by email → approve / merge / reject in the dashboard review queue.
5. **Status tracking:** Resend webhooks drive per-contact chips: sent → delivered → opened → bounced → **updated** (token used). Bounce = chase this person another way.
6. **Payoff:** CSV export of all contacts with current addresses, ready for label printing / mail merge.

## 5. Pages

| Route | Purpose |
|---|---|
| `/` | Landing |
| `/login` | Auth (magic link + Google) |
| `/dashboard` | Contact list — name + partner prominent, search, status chips |
| `/dashboard/contacts/[id]` | Contact detail/edit |
| `/dashboard/review` | Pending permalink submissions |
| `/dashboard/settings` | Book title, slug, field toggles |
| `/b/[slug]` | Public write-only self-add form |
| `/u/[token]` | Recipient address-update form |
| `/api/webhooks/resend` | Signed webhook receiver |

Dashboard reads are server components querying through Drizzle.

## 6. Testing & error handling

- **pgTAP** for RLS policies and the three definer functions.
- **Vitest** for CSV parsing/validation logic.
- **Playwright** for the three happy paths: owner CRUD, token update, permalink submit.
- Expired/invalid token → generic 404-style page: "ask [owner name] for a fresh link." No self-service re-request in v1 (spam vector).

## 7. Deliberately out of v1

Stripe/plans (schema doesn't block a later `plan` column), groups/tags, multiple books per user, recipient self-service link renewal, address formats beyond the structured international fields. Monetization is acknowledged (hosting + email costs) but deferred until core functionality is proven.

## Architecture options considered

- **A — Client-first, RLS everywhere:** browser holds anon key, RLS is the single wall. Rejected: one policy mistake is a breach, schema is public reading in an OSS repo, PostgREST endpoint of every deployment is internet-reachable.
- **C — Hybrid:** RLS-client dashboard + server routes for untrusted flows. Rejected: keeps the public PostgREST surface open and imposes two security models on every contributor PR.
- **B — Server-only with RLS enforced (chosen):** two independent enforcement layers, minimal public surface, one choke point for rate limiting and audit logging. Cost: more boilerplate, no realtime (not needed).
