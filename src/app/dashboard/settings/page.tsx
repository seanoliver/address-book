import { requireUser } from "@/lib/auth";
import { getOwnBook, getOwnProfile } from "@/lib/queries/books";
import { BookForm } from "./book-form";

export default async function SettingsPage() {
  const claims = await requireUser();
  const [book, profile] = await Promise.all([
    getOwnBook(claims),
    getOwnProfile(claims),
  ]);

  const urlPrefix = `${process.env.APP_URL}/b/`;

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-10">
      <div className="rounded-xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {book ? "Book settings" : "Set up your address book"}
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {book
            ? "Update your name, link, and the fields friends are asked for."
            : "Add your name and pick a link to share with friends."}
        </p>

        {book ? (
          <p className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
            Shareable link:{" "}
            <a
              href={`${urlPrefix}${book.slug}`}
              className="font-mono underline underline-offset-2"
            >
              {urlPrefix}
              {book.slug}
            </a>
          </p>
        ) : null}

        <BookForm
          urlPrefix={urlPrefix}
          currentSlug={book?.slug ?? null}
          defaults={{
            display_name: profile?.displayName ?? "",
            slug: book?.slug ?? "",
            // New books default to optional fields disabled (matches the DB).
            partner_name: book?.enabledFields.partner_name ?? false,
            kids_names: book?.enabledFields.kids_names ?? false,
            birthday: book?.enabledFields.birthday ?? false,
          }}
        />
      </div>
    </main>
  );
}
