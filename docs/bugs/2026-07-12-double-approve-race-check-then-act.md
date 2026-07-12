# Concurrent review approvals both won (check-then-act on submission status)

**Date:** 2026-07-12
**Severity:** Important
**Status:** Fixed in `0f8bd0a`

## Symptom

Two concurrent `approveNew` calls on the same pending submission both
succeeded: two duplicate contacts created (for an email-less submission —
email-bearing ones were only saved by `contacts_book_email_unique`) and two
`contact_events` audit rows. Found in Task 15 code review; proven by the
reviewer with two concurrent transactions replaying the action.

## Root cause

Check-then-act: the approve actions SELECTed the submission with a
`status = 'pending'` predicate, then inserted the contact, then UPDATEd the
status — the pending check and the status write were separate statements
with no atomic gate. Under READ COMMITTED, both transactions read the
snapshot where `status='pending'`, and the final unconditioned UPDATE
happily re-approved an already-approved row. Nothing serialized the two
writers. (`reject()` never had the bug: its UPDATE carried the
`status='pending'` predicate and was the only statement.)

## Repro steps

Two concurrent transactions, barrier-synchronized so both SELECT the pending
row before either writes, each replaying the old sequence
(select-pending → insert contact → update status). Both insert →
2 contacts. Reproduced (and now guarded) by
`src/app/dashboard/review/approve-race.test.ts`.

## Fix

`src/app/dashboard/review/actions.ts`: the status flip IS the concurrency
gate (`winApprovalFlip`) —

```sql
update submissions set status='approved'
where id=? and book_id=? and status='pending' returning id
```

run inside the SAME transaction as the contact write, AFTER all read-only
checks (so a losing/invalid path never commits a stray flip) and BEFORE the
insert/merge (so a loser returns having written nothing). Under READ
COMMITTED the second UPDATE blocks on the row lock, re-evaluates the
predicate after the winner commits, matches 0 rows → NOT_FOUND. A failed
contact write (duplicate email) throws → the whole tx, flip included, rolls
back → submission stays pending and actionable.

## Verification

- `approve-race.test.ts`: two barrier-synchronized concurrent replays →
  exactly one contact, loser sees 0 flip rows; plus a rollback test against
  the real `contacts_book_email_unique` constraint → status restored to
  `pending`.
- Full e2e re-run green (55 checks), including duplicate-email
  stays-pending. Gates: tsc, eslint, vitest 146/146, pgTAP 40/40, build.

## Recurrence guardrail

`src/app/dashboard/review/approve-race.test.ts` runs in the vitest suite
against the local DB and fails if the flip is reordered after the write or
split back into check-then-act. Convention (also on `winApprovalFlip`'s
doc): a status transition that authorizes a write must be a single
conditional UPDATE (`... where status='<from>' returning`) in the same
transaction as that write — a prior SELECT is never the gate.
