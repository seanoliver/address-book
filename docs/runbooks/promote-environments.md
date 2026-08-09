# Promote local changes through staging and production

**Status:** Current
**Last verified:** `156da36` on 2026-08-09 in staging; production workflow configured but not yet exercised end to end
**Owner:** Maintainers
**Related:** [Environment topology](../ENVIRONMENTS.md), [PR #9](https://github.com/seanoliver/address-book/pull/9), [Vercel environment deletion incident](../bugs/2026-08-09-vercel-env-target-removal-deletes-shared-record.md)

## Purpose

Promote one verified commit from local/PR testing to shared staging and then to production without crossing data, auth, or credential boundaries.

## Prerequisites

- Use the environment assignments in `docs/ENVIRONMENTS.md`; never substitute one environment's Supabase project or data into another.
- PR CI and the staging Vercel preview must be green.
- GitHub `Staging` contains `STAGING_DATABASE_URL`; GitHub `Production` contains `PRODUCTION_DATABASE_URL` and requires approval.
- Both migration URLs must use Supabase's IPv4 transaction pooler on port 6543 with `sslmode=require`. GitHub-hosted runners cannot reach the projects' IPv6-only direct database endpoints.
- Vercel Production has the complete variable set listed in `docs/ENVIRONMENTS.md` and remains disconnected from Git.
- Migrations are backward-compatible with the currently deployed application. Production has no automatic schema rollback.
- Do not run `supabase config push` from the localhost-oriented `supabase/config.toml`; hosted Auth URL/provider configuration is managed separately.

## Procedure

1. Verify the PR locally and in its staging-backed Vercel preview. For OAuth, confirm the callback stays on the preview where sign-in began.
2. Merge the PR to `main` only after CI and the preview pass.
3. Watch main CI:

   ```bash
   gh run list --workflow ci.yml --branch main --limit 5
   gh run watch <run-id> --exit-status
   ```

4. Main CI success triggers `.github/workflows/deploy-staging.yml`. Watch it and require a successful `supabase db push`:

   ```bash
   gh run list --workflow deploy-staging.yml --limit 5
   gh run watch <run-id> --exit-status
   ```

5. Smoke-test stable staging at `https://address-book-staging.vercel.app`: login, callback, onboarding, an authenticated owner action, and any changed recipient flow. Application-generated address-request email remains dry-run in staging.
6. Record the exact commit SHA that passed staging:

   ```bash
   git rev-parse origin/main
   ```

7. Dispatch the protected production workflow with that exact SHA or a release tag:

   ```bash
   gh workflow run deploy-production.yml -f ref=<sha-or-tag>
   ```

8. Approve the GitHub Production environment deployment after checking the ref and staging evidence. The workflow applies migrations first and then asks Vercel to build and deploy the same checkout.
9. Watch the workflow to completion and run non-destructive production smoke checks: homepage, login initiation/callback, dashboard access, and public form rendering. Do not create or inspect real contact data merely for a smoke test.
10. After the first deployment using a rotated runtime database role, confirm the active deployment connects successfully before disabling the superseded login credential.

## Verification

A promotion is complete only when all applicable signals pass:

```bash
gh run list --branch main --limit 10
curl -fsS -o /dev/null -w '%{http_code}\n' https://address-book-staging.vercel.app/login
```

For production, also verify:

- the workflow's migration and Vercel jobs used the same requested ref,
- Google OAuth returns through `/auth/confirm`,
- Vercel logs show no missing-environment or database-authentication errors,
- Resend and Turnstile credentials are present by name in Vercel without revealing their values.

## Failure recovery

### Staging migration reports an IPv6 network error

The secret contains a direct Supabase URL. Rotate the staging database-owner password, construct the project's transaction-pooler URL (`postgres.<project-ref>` on port 6543), verify it connects as `postgres`, replace `STAGING_DATABASE_URL`, and rerun only the failed workflow. Never print the URL or password in logs.

### Migration fails on SQL

Do not force a deployment or edit migration history. Diagnose against a disposable/local database, then add a corrective forward migration. Staging Vercel deploys independently through Git, so backward compatibility is required while the schema failure is corrected.

### Production migration succeeds but deployment fails

Leave the previous production deployment serving traffic. Because migrations must be expand/migrate/contract compatible, repair the build and rerun the same ref or a forward-fix ref; do not attempt an automatic database rollback.

### A Vercel variable disappears while changing targets

Stop before redeploying. Follow the provider-rotation recovery in `docs/bugs/2026-08-09-vercel-env-target-removal-deletes-shared-record.md`, restore the complete Production set, and verify names with `vercel env ls`.

## References

- `.github/workflows/ci.yml`
- `.github/workflows/deploy-staging.yml`
- `.github/workflows/deploy-production.yml`
- `docs/ENVIRONMENTS.md`
- Supabase database connection guidance: <https://supabase.com/docs/guides/database/connecting-to-postgres>
- GitHub environments: <https://docs.github.com/actions/deployment/targeting-different-environments/using-environments-for-deployment>
