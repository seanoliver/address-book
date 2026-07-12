import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getOwnBook } from "@/lib/queries/books";
import { listContacts, type ContactListRow } from "@/lib/queries/contacts";

const chipBase =
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium";

const chipStyles = {
  updated:
    "border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200",
  none: "border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400",
  sent: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200",
  delivered:
    "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200",
  opened:
    "border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-200",
  bounced:
    "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
  complained:
    "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
} as const;

const chipLabels = {
  updated: "Updated",
  none: "—",
  sent: "Sent",
  delivered: "Delivered",
  opened: "Opened",
  bounced: "Bounced",
  complained: "Complained",
} as const;

function StatusChip({ contact }: { contact: ContactListRow }) {
  // "Updated" (recipient confirmed/changed details after our last send)
  // outranks the raw delivery status in the UI.
  const key = contact.updatedAfterSend ? "updated" : contact.sendStatus;
  return <span className={`${chipBase} ${chipStyles[key]}`}>{chipLabels[key]}</span>;
}

const thClasses =
  "px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400";
const tdClasses = "px-4 py-3 text-sm text-zinc-700 dark:text-zinc-300";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const claims = await requireUser();
  const book = await getOwnBook(claims);

  // Onboarding: no book yet → set one up first.
  if (!book) redirect("/dashboard/settings");

  // A crafted URL can repeat ?q=; take the first value rather than crashing.
  const { q } = await searchParams;
  const query = (Array.isArray(q) ? q[0] : q)?.trim() ?? "";
  const rows = await listContacts(claims, query || undefined);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {book.title}
        </h1>
        <div className="flex items-center gap-2">
          {/* route lands in Task 10 */}
          <Link
            href="/dashboard/import"
            className="inline-flex h-9 items-center rounded-lg border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
          >
            Import CSV
          </Link>
          {/* route lands in Task 9 */}
          <Link
            href="/dashboard/contacts/new"
            className="inline-flex h-9 items-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Add contact
          </Link>
        </div>
      </div>

      {/* GET form: search stays a server round-trip, no client JS needed. */}
      <form action="/dashboard" method="get" className="mt-6 flex gap-2">
        <label htmlFor="q" className="sr-only">
          Search contacts
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={query}
          placeholder="Search by name or partner…"
          className="h-9 w-full max-w-xs rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
        <button
          type="submit"
          className="h-9 rounded-lg border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
        >
          Search
        </button>
      </form>

      {rows.length === 0 ? (
        query ? (
          <p className="mt-6 rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
            No contacts match &ldquo;{query}&rdquo;.{" "}
            <Link
              href="/dashboard"
              className="underline underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-200"
            >
              Clear search
            </Link>
          </p>
        ) : (
          <p className="mt-6 rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
            No contacts yet —{" "}
            {/* route lands in Task 10 */}
            <Link
              href="/dashboard/import"
              className="underline underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-200"
            >
              import a CSV
            </Link>{" "}
            or{" "}
            {/* route lands in Task 9 */}
            <Link
              href="/dashboard/contacts/new"
              className="underline underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-200"
            >
              add your first contact
            </Link>
            .
          </p>
        )
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <table className="w-full min-w-[40rem]" aria-label="Contacts">
            <thead className="border-b border-zinc-200 dark:border-zinc-800">
              <tr>
                <th scope="col" className={thClasses}>
                  Name
                </th>
                <th scope="col" className={thClasses}>
                  Partner
                </th>
                <th scope="col" className={thClasses}>
                  Email
                </th>
                <th scope="col" className={thClasses}>
                  Location
                </th>
                <th scope="col" className={thClasses}>
                  Status
                </th>
                <th scope="col" className={thClasses}>
                  Updated
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
              {rows.map((contact) => (
                <tr key={contact.id}>
                  <td className={tdClasses}>
                    {/* route lands in Task 9 */}
                    <Link
                      href={`/dashboard/contacts/${contact.id}`}
                      className="font-medium text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-50"
                    >
                      {contact.fullName}
                    </Link>
                  </td>
                  <td className={tdClasses}>{contact.partnerName ?? "—"}</td>
                  <td className={tdClasses}>{contact.email ?? "—"}</td>
                  <td className={tdClasses}>
                    {[contact.city, contact.country].filter(Boolean).join(", ") ||
                      "—"}
                  </td>
                  <td className={tdClasses}>
                    <StatusChip contact={contact} />
                  </td>
                  <td className={`${tdClasses} whitespace-nowrap`}>
                    {contact.updatedAt.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
