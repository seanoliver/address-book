import { requireUser } from "@/lib/auth";

/**
 * Placeholder dashboard proving the requireUser() gate works end-to-end.
 * Task 7 replaces this with the real onboarding/dashboard flow.
 */
export default async function DashboardPage() {
  const claims = await requireUser();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 bg-zinc-50 px-4 dark:bg-black">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
        Dashboard
      </h1>
      <p className="font-mono text-sm text-zinc-600 dark:text-zinc-400">
        {claims.sub}
      </p>
      <form action="/auth/signout" method="post">
        <button
          type="submit"
          className="h-9 rounded-lg border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
        >
          Sign out
        </button>
      </form>
    </main>
  );
}
