import { redirect } from "next/navigation";
import { z } from "zod";
import { SubmitButton } from "@/components/submit-button";
import { currentRequestOrigin } from "@/lib/request-origin";
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
  const origin = await currentRequestOrigin();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/confirm` },
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
    <main className="flex flex-1 items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-sm ">
        <h1 className="font-serif text-2xl leading-tight text-foreground">
          Sign in
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          We&apos;ll email you a magic link — no password needed.
        </p>

        {sent ? (
          <div className="mt-6 flex flex-col gap-3">
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200">
              Check your email for a sign-in link.
            </div>
            <a
              href="/login"
              className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground/80  "
            >
              Use a different email
            </a>
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
                className="h-10 rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-ring focus:ring-3 focus:ring-ring/25 "
              />
              <SubmitButton
                pendingLabel="Sending…"
                className="h-10 rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80 "
              >
                Send magic link
              </SubmitButton>
            </form>

            <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground/70">
              <div className="h-px flex-1 bg-border " />
              or
              <div className="h-px flex-1 bg-border " />
            </div>

            <form action={signInWithGoogle}>
              <SubmitButton
                pendingLabel="Redirecting…"
                className="h-10 w-full rounded-lg border border-input bg-card text-sm font-medium text-foreground transition-colors hover:bg-muted  "
              >
                Sign in with Google
              </SubmitButton>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
