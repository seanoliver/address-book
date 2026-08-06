"use client";

import { InvitePageIntroduction } from "@/components/invite-page-introduction";
import {
  BLANK_RECIPIENT_VALUES,
  RecipientFields,
  type EnabledFields,
} from "@/components/recipient-fields";

const OPTIONAL_FIELDS = [
  ["partner_name", "Partner name"],
  ["kids_names", "Kids' names"],
  ["birthday", "Birthday"],
] as const;

type OnboardingPreviewProps = {
  ownerName: string;
  publicUrl: string;
  enabledFields: EnabledFields;
  onFieldChange: (name: keyof EnabledFields, enabled: boolean) => void;
};

/** Optional-field controls paired with a deliberately inert invite preview. */
export function OnboardingPreview({
  ownerName,
  publicUrl,
  enabledFields,
  onFieldChange,
}: OnboardingPreviewProps) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
      <aside className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <fieldset>
          <legend className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Optional fields
          </legend>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            All optional fields start off. Add only what you want to ask for.
          </p>
          <div className="mt-4 flex flex-col gap-3">
            {OPTIONAL_FIELDS.map(([name, label]) => (
              <label
                key={name}
                className="flex min-h-10 cursor-pointer items-center justify-between gap-4 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
              >
                {label}
                <input
                  id={`enable_${name}`}
                  name={name}
                  type="checkbox"
                  checked={enabledFields[name]}
                  onChange={(event) => onFieldChange(name, event.target.checked)}
                  className="size-4 rounded border-zinc-300 accent-zinc-900 dark:border-zinc-700 dark:accent-zinc-50"
                />
              </label>
            ))}
          </div>
        </fieldset>

        <dl className="mt-5 border-t border-zinc-200 pt-4 text-xs dark:border-zinc-700">
          <dt className="font-medium text-zinc-500 dark:text-zinc-400">
            Public link
          </dt>
          <dd className="mt-1 break-all font-mono text-zinc-700 dark:text-zinc-300">
            {publicUrl}
          </dd>
        </dl>
      </aside>

      <section
        aria-label="Invite page preview"
        className="rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50/50 p-3 dark:border-indigo-800 dark:bg-indigo-950/20 sm:p-5"
      >
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
          Preview — what friends will see
        </p>
        <div className="mx-auto w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <InvitePageIntroduction ownerName={ownerName} headingLevel="h3" />
          <fieldset disabled className="mt-6 flex flex-col gap-5">
            <RecipientFields
              defaults={BLANK_RECIPIENT_VALUES}
              enabled={enabledFields}
              emailHint={`Optional — but include it so ${ownerName} can reach you.`}
            />
            <button
              type="button"
              disabled
              className="h-10 rounded-lg bg-zinc-900 text-sm font-medium text-white opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
            >
              Add my details
            </button>
          </fieldset>
        </div>
      </section>
    </div>
  );
}
