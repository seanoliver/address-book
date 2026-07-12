# z.uuid() silently rejects hand-rolled fixture uuids (version/variant bits)

**Date:** 2026-07-11
**Severity:** Minor (test-only; would be Important if seed/import data used non-v4 ids)
**Status:** Fixed in e2e fixtures (Task 12); no app change needed

## Symptom

Task 12 e2e: the second "Request addresses" send returned instantly (3ms,
no dry-run log lines) and the UI showed the generic "Invalid request."
error instead of the success banner. The first send — via `{ all: true }`,
which carries no ids — worked fine.

## Root cause

Zod v4's `z.uuid()` validates RFC 4122/9562 **version and variant bits**,
not just the 8-4-4-4-12 hex shape. Hand-rolled fixture ids like
`40000000-0000-0000-0000-0000000000a1` have version nibble `0` and fail
validation, so `requestAddresses`' `z.array(z.uuid())` input parse
rejected the whole request. Real rows (from `gen_random_uuid()`, v4)
always pass — only synthetic ids that flow back through a Zod boundary
are affected. (`z.guid()` is the shape-only validator.)

## Repro steps

```ts
import { z } from "zod";
z.uuid().safeParse("40000000-0000-0000-0000-0000000000a1").success; // false
z.uuid().safeParse("40000000-0000-4000-8000-0000000000a1").success; // true
```

## Fix

E2E fixture contact ids changed to v4-shaped values
(`40000000-0000-4000-8000-...`: version nibble `4`, variant nibble `8`).
No application change — strict validation on untrusted action input is
desired.

## Verification

Task 12 e2e re-run: all 23 checks pass, including the second send
(`requestAddresses({ contactIds: [...] })` → "Sent 2 requests") and the
cross-user isolation case.

## Recurrence guardrail

Convention: any fixture uuid that will round-trip through a Zod schema
(server action inputs, route params) must be v4-shaped —
use the `X0000000-0000-4000-8000-...` pattern. pgTAP-only fixtures never
cross a Zod boundary and may stay all-zero-nibble.
