import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { authDisplayName, suggestLinkName } from "@/lib/onboarding";
import { getOwnBook, getOwnProfile } from "@/lib/queries/books";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const claims = await requireUser();
  const [book, profile] = await Promise.all([
    getOwnBook(claims),
    getOwnProfile(claims),
  ]);
  if (book) redirect("/dashboard");

  const email = typeof claims.email === "string" ? claims.email : "";
  const displayName = profile?.displayName.trim() || authDisplayName(claims);

  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-10 dark:bg-black">
      <div className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Create your address book
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Start with your name and the link you&apos;ll eventually share.
        </p>

        <OnboardingForm
          urlPrefix={`${process.env.APP_URL}/b/`}
          defaults={{
            display_name: displayName,
            slug: suggestLinkName(email),
          }}
        />
      </div>
    </main>
  );
}
