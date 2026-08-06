import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getOwnBook } from "@/lib/queries/books";
import { ContactForm } from "@/components/contact-form";
import { createContact } from "../actions";

export default async function NewContactPage() {
  const claims = await requireUser();
  const book = await getOwnBook(claims);

  // Onboarding: no book yet → set one up first.
  if (!book) redirect("/onboarding");

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-10">
      <div className="rounded-xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Add a contact
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Only the name is required — you can fill in the rest later, or let
          your friend do it.
        </p>

        <ContactForm
          action={createContact}
          submitLabel="Add contact"
          defaults={{
            full_name: "",
            partner_name: "",
            kids_names: "",
            email: "",
            birthday: "",
            address_line1: "",
            address_line2: "",
            city: "",
            state_region: "",
            postal_code: "",
            country: "",
            notes: "",
          }}
        />
      </div>
    </main>
  );
}
