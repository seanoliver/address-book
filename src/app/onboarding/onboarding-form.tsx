"use client";

import { useActionState } from "react";
import {
  advanceOnboarding,
  type OnboardingState,
  type OnboardingValues,
} from "./actions";

const inputClasses =
  "h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

type OnboardingFormProps = {
  defaults: OnboardingValues;
  urlPrefix: string;
};

export function OnboardingForm({ defaults, urlPrefix }: OnboardingFormProps) {
  const initialState: OnboardingState = { step: "details", values: defaults };
  const [state, formAction, pending] = useActionState(
    advanceOnboarding,
    initialState,
  );
  const values = state.values;

  if (state.step === "confirm") {
    return (
      <form action={formAction} className="mt-6 flex flex-col gap-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Step 2 of 2
        </p>
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Ready to create your address book?
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Review these details. You can change them later in Settings.
          </p>
        </div>

        {state.error ? <ErrorMessage>{state.error}</ErrorMessage> : null}

        <dl className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
          <div className="flex flex-col gap-1 p-4 sm:flex-row sm:justify-between">
            <dt className="font-medium text-zinc-500 dark:text-zinc-400">
              Your name
            </dt>
            <dd className="text-zinc-900 dark:text-zinc-50">
              {values.display_name}
            </dd>
          </div>
          <div className="flex flex-col gap-1 p-4 sm:flex-row sm:justify-between">
            <dt className="font-medium text-zinc-500 dark:text-zinc-400">
              Public link
            </dt>
            <dd className="break-all font-mono text-zinc-900 dark:text-zinc-50">
              {urlPrefix}
              {values.slug}
            </dd>
          </div>
          <div className="flex flex-col gap-1 p-4 sm:flex-row sm:justify-between">
            <dt className="font-medium text-zinc-500 dark:text-zinc-400">
              Optional fields
            </dt>
            <dd className="text-zinc-900 dark:text-zinc-50">None yet</dd>
          </div>
        </dl>

        <input type="hidden" name="display_name" value={values.display_name} />
        <input type="hidden" name="slug" value={values.slug} />

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="submit"
            name="intent"
            value="back"
            formNoValidate
            disabled={pending}
            className="h-10 rounded-lg border border-zinc-300 bg-white px-5 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
          >
            Back
          </button>
          <button
            type="submit"
            name="intent"
            value="create"
            disabled={pending}
            className="h-10 rounded-lg bg-zinc-900 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {pending ? "Creating…" : "Create my address book"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Step 1 of 2
      </p>
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Choose your details
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Your name tells friends whose address book they&apos;re adding to.
        </p>
      </div>

      {state.error ? <ErrorMessage>{state.error}</ErrorMessage> : null}

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="display_name"
          className="text-sm font-medium text-zinc-900 dark:text-zinc-50"
        >
          Your name
        </label>
        <input
          id="display_name"
          name="display_name"
          type="text"
          required
          maxLength={200}
          autoComplete="name"
          defaultValue={values.display_name}
          placeholder="Sean"
          className={inputClasses}
        />
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          A first name is fine. This will be visible to friends.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="slug"
          className="text-sm font-medium text-zinc-900 dark:text-zinc-50"
        >
          Link name
        </label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <span className="shrink-0 font-mono text-sm text-zinc-500 dark:text-zinc-400">
            {urlPrefix}
          </span>
          <input
            id="slug"
            name="slug"
            type="text"
            required
            pattern="[a-z0-9][a-z0-9\-]{2,62}"
            title="3-63 chars; lowercase letters, numbers, hyphens; must start alphanumeric"
            defaultValue={values.slug}
            className={`${inputClasses} w-full`}
          />
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Lowercase letters, numbers, and hyphens. You can edit the suggestion.
        </p>
      </div>

      <button
        type="submit"
        name="intent"
        value="continue"
        disabled={pending}
        className="h-10 rounded-lg bg-zinc-900 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {pending ? "Checking…" : "Continue"}
      </button>
    </form>
  );
}

function ErrorMessage({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
    >
      {children}
    </div>
  );
}
