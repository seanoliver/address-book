import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getOwnBook } from "@/lib/queries/books";
import { listContacts } from "@/lib/queries/contacts";
import { ContactsTable, type DashboardRow } from "./contacts-table";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const claims = await requireUser();
  const book = await getOwnBook(claims);

  // Onboarding: no book yet → set one up first.
  if (!book) redirect("/onboarding");

  // A crafted URL can repeat ?q=; take the first value rather than crashing.
  const { q } = await searchParams;
  const query = (Array.isArray(q) ? q[0] : q)?.trim() ?? "";
  const contacts = await listContacts(claims, query || undefined);

  // Serialize for the client table: format the date server-side so the
  // client component stays free of Date/locale handling.
  const rows: DashboardRow[] = contacts.map(({ updatedAt, ...rest }) => ({
    ...rest,
    updatedAtLabel: updatedAt.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
  }));

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Your address book
        </h1>
        <div className="flex items-center gap-2">
          {/* Route handler streams the CSV; plain <a> so the browser downloads it. */}
          <a
            href="/dashboard/export"
            download
            className="inline-flex h-9 items-center rounded-lg border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
          >
            Export CSV
          </a>
          <Link
            href="/dashboard/import"
            className="inline-flex h-9 items-center rounded-lg border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
          >
            Import CSV
          </Link>
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
            <Link
              href="/dashboard/import"
              className="underline underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-200"
            >
              import a CSV
            </Link>{" "}
            or{" "}
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
        <ContactsTable rows={rows} />
      )}
    </main>
  );
}
