"use client";

import { useActionState } from "react";
import {
  TurnstileWidget,
  useTurnstileResetOnError,
} from "@/components/turnstile-widget";
import { type TokenUpdateValues } from "@/lib/validation/contact";
import { type TokenUpdateState } from "./actions";

const initialState: TokenUpdateState = {};

const inputClasses =
  "h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";
const labelClasses = "text-sm font-medium text-zinc-900 dark:text-zinc-50";

/** Per-book optional-field switches, straight from books.enabled_fields. */
export type EnabledFields = {
  partner_name: boolean;
  kids_names: boolean;
  birthday: boolean;
};

type TokenUpdateFormProps = {
  /** submitTokenUpdate with the token pre-bound server-side. */
  action: (
    state: TokenUpdateState,
    formData: FormData,
  ) => Promise<TokenUpdateState>;
  defaults: TokenUpdateValues;
  enabled: EnabledFields;
};

type FieldProps = {
  name: keyof TokenUpdateValues;
  label: string;
  value: string;
  type?: "text" | "email" | "date";
  maxLength?: number;
  hint?: string;
};

function Field({ name, label, value, type = "text", maxLength, hint }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className={labelClasses}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        maxLength={maxLength}
        defaultValue={value}
        className={inputClasses}
      />
      {hint ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * Recipient-facing update form. Renders ONLY the fields this book enables —
 * a disabled field is absent from the DOM entirely, so it is never posted
 * and (per apply_token_update semantics) never touched. There is no notes
 * field on this surface by design.
 */
export function TokenUpdateForm({
  action,
  defaults,
  enabled,
}: TokenUpdateFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);
  // Turnstile responses are single-use: refresh the widget after any error
  // so the user's retry carries a fresh response.
  useTurnstileResetOnError(state.error);
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

      <div className="flex flex-col gap-1.5">
        <label htmlFor="full_name" className={labelClasses}>
          Full name
        </label>
        <input
          id="full_name"
          name="full_name"
          type="text"
          required
          maxLength={200}
          defaultValue={v.full_name}
          className={inputClasses}
        />
      </div>

      {enabled.partner_name ? (
        <Field
          name="partner_name"
          label="Partner name"
          value={v.partner_name}
          maxLength={200}
        />
      ) : null}
      {enabled.kids_names ? (
        <Field
          name="kids_names"
          label="Kids' names"
          value={v.kids_names}
          maxLength={500}
          hint="Comma separated."
        />
      ) : null}
      <Field
        name="email"
        label="Email"
        value={v.email}
        type="email"
        maxLength={320}
      />
      {enabled.birthday ? (
        <Field name="birthday" label="Birthday" value={v.birthday} type="date" />
      ) : null}
      <Field
        name="address_line1"
        label="Address line 1"
        value={v.address_line1}
        maxLength={200}
      />
      <Field
        name="address_line2"
        label="Address line 2"
        value={v.address_line2}
        maxLength={200}
      />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field name="city" label="City" value={v.city} maxLength={120} />
        <Field
          name="state_region"
          label="State / region"
          value={v.state_region}
          maxLength={120}
        />
        <Field
          name="postal_code"
          label="Postal code"
          value={v.postal_code}
          maxLength={20}
        />
        <Field
          name="country"
          label="Country"
          value={v.country}
          maxLength={120}
        />
      </div>

      <TurnstileWidget />

      <button
        type="submit"
        disabled={pending}
        className="h-10 rounded-lg bg-zinc-900 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {pending ? "Saving…" : "Update my details"}
      </button>
    </form>
  );
}
