import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getOwnBook } from "@/lib/queries/books";
import { ImportForm } from "./import-form";

export default async function ImportPage() {
  const claims = await requireUser();
  const book = await getOwnBook(claims);

  // Onboarding: no book yet → set one up first (imports need a book).
  if (!book) redirect("/onboarding");

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <Link
        href="/dashboard"
        className="text-sm text-zinc-500 underline underline-offset-2 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
      >
        &larr; Back to contacts
      </Link>
      <h1 className="mt-4 text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        Import contacts from CSV
      </h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Upload a CSV with a header row. Common column names like
        &ldquo;Name&rdquo;, &ldquo;Spouse&rdquo;, or &ldquo;Zip&rdquo; are
        recognized automatically, up to 1,000 rows per file.{" "}
        <a
          href="/contacts-template.csv"
          download
          className="underline underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-200"
        >
          Download the template CSV
        </a>
        .
      </p>
      <ImportForm />
    </main>
  );
}
