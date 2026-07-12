import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { withRls } from "@/lib/db";
import { books } from "@/lib/db/schema";

export default async function DashboardPage() {
  const claims = await requireUser();

  const [book] = await withRls(claims, (tx) =>
    tx.select().from(books).where(eq(books.ownerId, claims.sub)).limit(1),
  );

  // Onboarding: no book yet → set one up first.
  if (!book) redirect("/dashboard/settings");

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        {book.title}
      </h1>
      {/* Task 8 replaces this stub with the real contact list. */}
      <p className="mt-6 rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
        No contacts yet — import a CSV or add your first contact.
      </p>
    </main>
  );
}
