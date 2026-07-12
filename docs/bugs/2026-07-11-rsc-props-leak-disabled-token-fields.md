# RSC props leaked disabled-field values into the token page source

**Date:** 2026-07-11
**Severity:** Important
**Status:** Fixed in `feat: recipient token update page` (caught pre-merge by the Task 13 e2e)

## Symptom

On `/u/[token]` for a book with `kids_names` disabled, the kids field was
correctly absent from the rendered form — but the contact's stored kids
names ("Ziggy, Zoe") were still present in the page source. E2E check
"kids VALUE not leaked into DOM" failed.

## Root cause

The server page built a full `TokenUpdateValues` defaults object (every
field, including disabled ones) and passed it as props to the client form
component. Props crossing the server→client boundary are serialized into
the RSC/Flight payload embedded in the HTML, so a value reaches the page
source even when no JSX ever renders it. "Don't render the field" is not
the same as "don't send the data".

## Repro steps

1. Book with `enabled_fields.kids_names = false`; contact with kids names set.
2. Mint a token, open `/u/<token>` (no fix applied).
3. View page source: no kids input, but the kids value appears in the
   inline Flight data.

## Fix

`src/app/u/[token]/page.tsx`: blank disabled fields when building the
client-facing defaults —
`kids_names: enabled_fields.kids_names ? contact.kids_names ?? "" : ""`
(same for `partner_name`, `birthday`). The action independently omits
disabled fields from the update payload, and `apply_token_update` re-gates
them in SQL, so blanking the default cannot cause an accidental clear.

## Verification

Task 13 e2e: "kids field ABSENT", "kids VALUE not leaked into DOM", and
"DB: kids unchanged" all pass; page HTML also asserted free of UUIDs and
other contacts' data.

## Recurrence guardrail

Convention: on unauthenticated surfaces, filter PII server-side BEFORE it
crosses a server→client component boundary — client-component props are
part of the page source. The e2e leak assertions (raw `page.content()`
scans for hidden values, not just visible DOM) are the regression net; keep
them when Task 14 builds `/b/[slug]`.
