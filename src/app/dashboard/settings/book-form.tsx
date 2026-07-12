"use client";

import { useActionState } from "react";
import {
  saveBook,
  type BookFormValues,
  type SaveBookState,
} from "./actions";

const initialState: SaveBookState = {};

type BookFormProps = {
  urlPrefix: string;
  defaults: BookFormValues;
};

const inputClasses =
  "h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

export function BookForm({ urlPrefix, defaults }: BookFormProps) {
  const [state, formAction, pending] = useActionState(saveBook, initialState);
  // React 19 resets uncontrolled inputs to defaultValue after a form action
  // completes; on error the action echoes the submitted values back so the
  // reset restores what the user typed instead of wiping the form.
  const v = state.values ?? defaults;

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-5">
      {state.error ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        >
          {state.error}
        </div>
      ) : null}
      {state.saved ? (
        <div
          role="status"
          className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200"
        >
          Saved.
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="title"
          className="text-sm font-medium text-zinc-900 dark:text-zinc-50"
        >
          Book title
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          maxLength={120}
          defaultValue={v.title}
          placeholder="Our Address Book"
          className={inputClasses}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="slug"
          className="text-sm font-medium text-zinc-900 dark:text-zinc-50"
        >
          Link name
        </label>
        <div className="flex items-center gap-2">
          <span className="shrink-0 font-mono text-sm text-zinc-500 dark:text-zinc-400">
            {urlPrefix}
          </span>
          {/* pattern uses \- : browsers compile the attribute with the `v`
              regex flag, where an unescaped hyphen inside a character class
              is a syntax error (the whole pattern would be silently
              ignored). */}
          <input
            id="slug"
            name="slug"
            type="text"
            required
            pattern="[a-z0-9][a-z0-9\-]{2,62}"
            title="3-63 chars; lowercase letters, numbers, hyphens; must start alphanumeric"
            defaultValue={v.slug}
            placeholder="my-address-book"
            className={`${inputClasses} w-full`}
          />
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Lowercase letters, numbers, and hyphens. This is the link you share.
        </p>
      </div>

      <fieldset className="flex flex-col gap-2.5">
        <legend className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
          Ask your friends for
        </legend>
        {(
          [
            ["partner_name", "Ask for partner name"],
            ["kids_names", "Ask for kids' names"],
            ["birthday", "Ask for birthday"],
          ] as const
        ).map(([name, label]) => (
          <label
            key={name}
            className="flex items-center gap-2.5 text-sm text-zinc-700 dark:text-zinc-300"
          >
            <input
              type="checkbox"
              name={name}
              defaultChecked={v[name]}
              className="size-4 rounded border-zinc-300 accent-zinc-900 dark:border-zinc-700 dark:accent-zinc-50"
            />
            {label}
          </label>
        ))}
      </fieldset>

      <button
        type="submit"
        disabled={pending}
        className="h-10 rounded-lg bg-zinc-900 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
