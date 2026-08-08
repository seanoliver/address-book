"use client";

import { useActionState } from "react";
import { deleteContact, type DeleteContactState } from "../actions";

const initialState: DeleteContactState = {};

export function DeleteContactButton({ contactId }: { contactId: string }) {
  const [state, formAction, pending] = useActionState(
    deleteContact,
    initialState,
  );

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm("Delete this contact? This cannot be undone.")) {
          e.preventDefault();
        }
      }}
      className="flex flex-col gap-3"
    >
      {state.error ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        >
          {state.error}
        </div>
      ) : null}
      <input type="hidden" name="id" value={contactId} />
      <button
        type="submit"
        disabled={pending}
        className="h-10 self-start rounded-lg border border-red-300 bg-white px-4 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-900  dark:text-red-400 dark:hover:bg-red-950"
      >
        {pending ? "Deleting…" : "Delete contact"}
      </button>
    </form>
  );
}
