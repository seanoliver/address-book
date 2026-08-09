# Supabase SSR auth (@supabase/ssr 0.12) on Next.js 16

**Date:** 2026-07-11
**Prompted by:** Feature build (Task 6: auth + login page)

## Context

Wiring cookie-based Supabase Auth sessions into Next 16 App Router with
magic-link + Google OAuth, where the browser only ever talks to Supabase Auth
(all data goes through server actions + `withRls`). Verified the canonical
patterns against the installed packages rather than memory.

## Key findings

- **Next 16 renamed the root `middleware` file convention to `proxy`.**
  `src/middleware.ts` still runs but logs a deprecation warning; `src/proxy.ts`
  must export a function as default or named `proxy` (see
  `next/dist/build/analysis/get-page-static-info.js`). We use `src/proxy.ts`.
- **Magic-link emails must be re-templated for the SSR flow.** The default
  GoTrue template links to `{SUPABASE_URL}/auth/v1/verify?...&redirect_to=...`,
  which either puts tokens in a URL fragment (server can't read) or requires a
  PKCE verifier cookie. The canonical SSR flow overrides the template to
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`, and the
  app route calls `verifyOtp({ type, token_hash })` — no prior cookies needed.
  Configured in `supabase/config.toml` (`[auth.email.template.magic_link]` and
  `.confirmation`, both pointing at `supabase/templates/magic_link.html`).
  Config changes require `supabase stop && supabase start`.
- **`auth.getClaims()` exists on the installed @supabase/auth-js 2.110** and is
  the recommended validation call. With the local stack's symmetric JWT secret
  it falls back to a server-side check (like `getUser()`); with asymmetric keys
  it validates locally against cached JWKS. Return type is a 3-way union
  including `{ data: null, error: null }` — check `data?.claims?.sub`, not just
  `error`.
- **The local email UI is Mailpit, not Inbucket** (supabase CLI ≥ 2.x;
  `[local_smtp]` in config). API: `GET :54324/api/v1/search?query=to:<addr>`
  then `GET :54324/api/v1/message/<ID>`.
- **`redirect_to` is allowlisted.** `emailRedirectTo`/OAuth `redirectTo` must
  match `site_url` or `additional_redirect_urls` globs or GoTrue silently falls
  back to `site_url`. Aligned `site_url` to `http://localhost:3000` (was
  `127.0.0.1`, mismatching `APP_URL`). OAuth PKCE adds a stricter invariant:
  the callback must also return to the origin where sign-in began so the
  verifier cookie is available. See the [preview-origin bug journal](../bugs/2026-08-09-oauth-pkce-callback-crosses-preview-origin.md).

## How it works

- `src/lib/supabase/server.ts` — per-request `createServerClient` with
  `getAll`/`setAll` cookie bridge; `setAll` try/catch swallows the
  server-component "cookies are read-only" throw (middleware owns refresh).
- `src/lib/supabase/middleware.ts` — canonical `updateSession`: request-bound
  client, `getClaims()` triggers refresh, refreshed cookies written to both
  request and response. No gating here.
- `src/proxy.ts` — matcher excludes `_next/*`, static assets, and the public
  routes `/b/*`, `/u/*`, `/api/webhooks/*` (privacy: no session work on
  recipient pages). Verified via dev-log timing lines: excluded routes show no
  `proxy.ts` entry.
- `src/lib/auth.ts` — `requireUser()`: `getClaims()` → redirect `/login` on
  error/absence; returns `SessionClaims` (assignable to `withRls`'s claims).
- `src/app/auth/confirm/route.ts` — handles both `token_hash`+`type`
  (`verifyOtp`, magic link) and `code` (`exchangeCodeForSession`, OAuth PKCE).

## Gotchas

- Server actions can't be driven by hand-rolled `curl` POSTs (the RSC action
  wire format is not plain multipart) — a raw POST 500s with
  "Connection closed". Use Playwright against the real form.
- Turbopack caches the compiled middleware; after renaming
  `middleware.ts` → `proxy.ts` the dev server 500'd on a stale reference until
  `.next` was deleted and the server restarted.
- `signInWithOtp` from the SSR client issues PKCE-prefixed token hashes
  (`token_hash=pkce_...`); `verifyOtp` handles them transparently.
- The homebrew `supabase` CLI (2.65) can't parse this repo's config
  (`local_smtp`, `db.health_timeout`); always use the pinned `pnpm exec
  supabase` (2.109).

## References

- `node_modules/@supabase/ssr/dist/module/createServerClient.d.ts` (cookie
  contract + warnings), `types.d.ts` (`CookieMethodsServer`)
- `@supabase/auth-js` `GoTrueClient.d.ts` — `getClaims`, `verifyOtp`,
  `exchangeCodeForSession` signatures
- Supabase docs: Server-Side Auth for Next.js (email template override)
- `docs/plans/2026-07-11-address-book-implementation.md` Task 6
