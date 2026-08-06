import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getOwnBook, getOwnProfile } from "@/lib/queries/books";
import { BookForm } from "./book-form";

export default async function SettingsPage() {
  const claims = await requireUser();
  const [book, profile] = await Promise.all([
    getOwnBook(claims),
    getOwnProfile(claims),
  ]);
  if (!book) redirect("/onboarding");

  const urlPrefix = `${process.env.APP_URL}/b/`;
  const defaults = {
    display_name: profile?.displayName ?? "",
    slug: book.slug,
    partner_name: book.enabledFields.partner_name,
    kids_names: book.enabledFields.kids_names,
    birthday: book.enabledFields.birthday,
  };
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-8">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Address book settings
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Update your details while previewing exactly what friends will see.
        </p>

        <BookForm
          urlPrefix={urlPrefix}
          currentSlug={book.slug}
          defaults={defaults}
        />
      </div>
    </main>
  );
}
