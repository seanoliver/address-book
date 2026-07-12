import { notFound } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getContactWithEvents } from "@/lib/queries/contacts";
import { ContactForm } from "@/components/contact-form";
import { updateContact } from "../actions";
import { DeleteContactButton } from "./delete-contact-button";

const uuidSchema = z.uuid();

/** Cap rendered diff JSON so a huge jsonb value can't blow up the page. */
const MAX_DIFF_CHARS = 4000;

/**
 * Render-safety: `diff` values are attacker-influenced (token updates write
 * diffs too, Task 13). Rendered ONLY as JSON text inside <pre> — React's
 * default escaping applies; never dangerouslySetInnerHTML. Tolerates any
 * jsonb shape (scalar/array/object).
 */
function formatDiff(diff: unknown): string {
  const json = JSON.stringify(diff, null, 2) ?? String(diff);
  return json.length > MAX_DIFF_CHARS
    ? `${json.slice(0, MAX_DIFF_CHARS)}\n… (truncated)`
    : json;
}

const sourceLabels: Record<string, string> = {
  owner: "You",
  token: "Recipient update",
  submission: "Permalink submission",
};

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const claims = await requireUser();

  // Reject non-UUID ids before they hit a uuid cast in the query.
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();

  const detail = await getContactWithEvents(claims, id);
  // RLS makes another user's contact indistinguishable from a missing one.
  if (!detail) notFound();
  const { contact, events } = detail;

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-10">
      <div className="rounded-xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {contact.fullName}
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Edit this contact&apos;s details.
        </p>

        <ContactForm
          action={updateContact}
          contactId={contact.id}
          submitLabel="Save changes"
          defaults={{
            full_name: contact.fullName,
            partner_name: contact.partnerName ?? "",
            kids_names: contact.kidsNames ?? "",
            email: contact.email ?? "",
            birthday: contact.birthday ?? "",
            address_line1: contact.addressLine1 ?? "",
            address_line2: contact.addressLine2 ?? "",
            city: contact.city ?? "",
            state_region: contact.stateRegion ?? "",
            postal_code: contact.postalCode ?? "",
            country: contact.country ?? "",
            notes: contact.notes ?? "",
          }}
        />
      </div>

      <section
        aria-label="History"
        className="mt-6 rounded-xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
      >
        <h2 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          History
        </h2>
        {events.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
            No changes recorded yet.
          </p>
        ) : (
          <ol className="mt-4 flex flex-col gap-4">
            {events.map((event) => (
              <li
                key={event.id}
                className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                    {sourceLabels[event.source] ?? event.source}
                  </span>
                  <time
                    dateTime={event.createdAt.toISOString()}
                    className="text-xs text-zinc-500 dark:text-zinc-400"
                  >
                    {event.createdAt.toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
                <pre className="mt-2 overflow-x-auto rounded-lg bg-zinc-50 p-3 text-xs text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                  {formatDiff(event.diff)}
                </pre>
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className="mt-6">
        <DeleteContactButton contactId={contact.id} />
      </div>
    </main>
  );
}
