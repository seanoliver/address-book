import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const emailSchema = z.object({ email: z.email().max(254) });

async function signInWithEmail(formData: FormData) {
  "use server";
  const parsed = emailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) redirect("/login?error=1");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { emailRedirectTo: `${process.env.APP_URL}/auth/confirm` },
  });
  // Generic failure state — never leak auth error details to the page.
  if (error) redirect("/login?error=1");
  redirect("/login?sent=1");
}

async function signInWithGoogle() {
  "use server";
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${process.env.APP_URL}/auth/confirm` },
  });
  if (error || !data.url) redirect("/login?error=1");
  redirect(data.url);
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { sent, error } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Sign in
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          We&apos;ll email you a magic link — no password needed.
        </p>

        {sent ? (
          <div className="mt-6 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200">
            Check your email for a sign-in link.
          </div>
        ) : (
          <>
            {error ? (
              <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                Something went wrong. Please try again.
              </div>
            ) : null}

            <form action={signInWithEmail} className="mt-6 flex flex-col gap-3">
              <label htmlFor="email" className="sr-only">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
              <button
                type="submit"
                className="h-10 rounded-lg bg-zinc-900 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                Send magic link
              </button>
            </form>

            <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wide text-zinc-400">
              <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
              or
              <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
            </div>

            <form action={signInWithGoogle}>
              <button
                type="submit"
                className="h-10 w-full rounded-lg border border-zinc-300 bg-white text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
              >
                Sign in with Google
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
