import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getOwnBook } from "@/lib/queries/books";

const navLinkClasses =
  "rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Gate every dashboard route at the layout level; pages and actions still
  // call requireUser() themselves for claims (layouts don't re-run on every
  // client-side navigation).
  const claims = await requireUser();
  if (!(await getOwnBook(claims))) redirect("/onboarding");

  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <nav className="mx-auto flex h-14 w-full max-w-4xl items-center gap-1 px-4">
          <Link
            href="/dashboard"
            className="mr-4 text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
          >
            Address Book
          </Link>
          <Link href="/dashboard" className={navLinkClasses}>
            Contacts
          </Link>
          {/* No pending-count badge in v1: the layout would need a
              per-navigation count query. Revisit post-v1 (Task 18 polish). */}
          <Link href="/dashboard/review" className={navLinkClasses}>
            Review
          </Link>
          <Link href="/dashboard/settings" className={navLinkClasses}>
            Settings
          </Link>
          <form action="/auth/signout" method="post" className="ml-auto">
            <button
              type="submit"
              className="h-9 rounded-lg border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
            >
              Sign out
            </button>
          </form>
        </nav>
      </header>
      {children}
    </div>
  );
}
