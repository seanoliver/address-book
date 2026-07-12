# React 19 form reset wipes user input when a server action returns an error

**Date:** 2026-07-11
**Severity:** Important
**Status:** Fixed in `3b34e8a`

## Symptom

In the book settings form, when `saveBook` returned a form-visible error
(e.g. "That link name is taken" on a slug conflict), every input in the
form was cleared — title, slug, and checkbox state all reverted to their
`defaultValue`/`defaultChecked`. A user hitting the conflict had to retype
everything. Caught by the Playwright e2e: after the conflict error, the
recovery submit never fired a POST because the now-empty `required` title
input failed browser validation and silently blocked submission.

A second, masking bug: the slug input's `pattern="[a-z0-9][a-z0-9-]{2,62}"`
was invalid and ignored by the browser (console error only), so pattern
validation never ran at all.

## Root cause

1. React 19 calls `requestFormReset` after every `<form action>` submission
   completes — success *or* error. Uncontrolled inputs are reset to their
   `defaultValue`, which for a first-time (onboarding) book form is `""`.
   The action's returned error state does not carry the submitted values,
   so the reset had nothing to restore.
2. Browsers compile the `pattern` attribute with the `v` regex flag, under
   which an unescaped `-` inside a character class is a syntax error. An
   invalid pattern is silently discarded (constraint not enforced).

## Repro steps

1. Sign in as a fresh user, open `/dashboard/settings`.
2. Fill title/slug with a slug already owned by another user; submit.
3. Observe "That link name is taken" — and all fields now empty.
4. Fill only the slug and submit again: nothing happens (blocked by
   `required` on the empty title; no POST in the server log).

## Fix

- `src/app/dashboard/settings/actions.ts`: `SaveBookState` gained
  `values?: BookFormValues`; every error return echoes the submitted
  values back.
- `src/app/dashboard/settings/book-form.tsx`: renders
  `const v = state.values ?? defaults` and points every
  `defaultValue`/`defaultChecked` at `v`, so the React 19 reset restores
  the user's input (the reset and the state update land in the same
  commit, so the new defaults are in place when the reset runs).
- Same file: `pattern="[a-z0-9][a-z0-9\-]{2,62}"` (escaped hyphen, valid
  under the `v` flag).

## Verification

Playwright e2e (`scratchpad/e2e-settings.mjs`, Task 7): second user
submits a taken slug → sees the error with input intact → changes only
the slug → save succeeds ("second user recovers with a free slug" PASS).
Browser console shows no pattern syntax error after the fix.

## Recurrence guardrail

Convention: any server action consumed via `useActionState` that returns
an error state MUST echo the submitted field values in that state, and the
form component MUST derive its `defaultValue`/`defaultChecked` from
`state.values ?? defaults`. When writing an HTML `pattern` attribute,
escape literal hyphens in character classes (`\-`) — browsers use the `v`
flag and silently drop invalid patterns. The Task 7 e2e script exercises
the error-then-recover path; keep an equivalent check in future form e2e
coverage.
