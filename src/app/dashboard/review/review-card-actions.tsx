"use client";

import { useActionState } from "react";
import { approveMerge, approveNew, reject } from "./actions";

const approveButtonClasses =
  "inline-flex h-9 items-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300";
const rejectButtonClasses =
  "inline-flex h-9 items-center rounded-lg border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800";

/**
 * Approve/Reject buttons for one review card. `approve` picks the approval
 * action ("new" → Add contact, "merge" → Apply update); omit it for
 * malformed submissions, which can only be rejected.
 */
export function ReviewCardActions({
  submissionId,
  approve,
}: {
  submissionId: string;
  approve?: "new" | "merge";
}) {
  const [approveState, approveAction, approvePending] = useActionState(
    approve === "merge" ? approveMerge : approveNew,
    {},
  );
  const [rejectState, rejectAction, rejectPending] = useActionState(reject, {});

  const pending = approvePending || rejectPending;
  const error = approveState.error ?? rejectState.error;

  return (
    <div className="mt-4">
      {error ? (
        <p
          role="alert"
          className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        >
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {approve ? (
          <form action={approveAction}>
            <input type="hidden" name="id" value={submissionId} />
            <button
              type="submit"
              disabled={pending}
              className={approveButtonClasses}
            >
              {approve === "merge" ? "Apply update" : "Add contact"}
            </button>
          </form>
        ) : null}
        <form action={rejectAction}>
          <input type="hidden" name="id" value={submissionId} />
          <button
            type="submit"
            disabled={pending}
            className={rejectButtonClasses}
          >
            Reject
          </button>
        </form>
      </div>
    </div>
  );
}
