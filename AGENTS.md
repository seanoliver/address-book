<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Project memory

Read `docs/README.md` before investigating an unfamiliar area or capturing project knowledge. Use `CONTEXT.md` for domain vocabulary and read relevant accepted ADRs before making architectural changes.

Treat code, tests, migrations, configuration, and the issue tracker as authoritative. Documents under `docs/bugs/`, `docs/investigations/`, and `docs/runbooks/` are evidence that may need re-verification; `docs/plans/` records intent only.

When a non-trivial bug, investigation, decision, or operational procedure should be preserved, load the `project-memory` skill. Route the lesson to one primary document and cross-link instead of duplicating it. Use Pi sessions (`pi -c`, `/resume`, `/tree`, `/compact`) for conversation continuity rather than writing session transcripts into the repository.
