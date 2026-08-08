import Link from "next/link";
import { Mail } from "lucide-react";
import {
  continueWithGoogle,
  sendMagicLink,
} from "@/app/auth/actions";
import { SubmitButton } from "@/components/submit-button";

type AuthPageProps = {
  flow: "login" | "signup";
  sent?: string;
  error?: string;
};

const copy = {
  login: {
    headline: "Welcome back.",
    message:
      "Your contacts are waiting right where you left them. We’ll email you the key.",
    formTitle: "Open your address book",
    formMessage: "Enter the email you use for Address Book.",
    sentMessage: "Check your email for a sign-in link.",
    alternatePrompt: "New here?",
    alternateLabel: "Create an address book",
    alternateHref: "/signup",
  },
  signup: {
    headline: "Make a place for your people.",
    message:
      "Create one private link for friends and family, and let the people you love keep their own details current.",
    formTitle: "Create your address book",
    formMessage: "Start with your email. No password needed.",
    sentMessage: "Check your email to finish creating your address book.",
    alternatePrompt: "Already have an address book?",
    alternateLabel: "Log in",
    alternateHref: "/login",
  },
} as const;

/** Shared editorial auth surface with flow-specific correspondence and copy. */
export function AuthPage({ flow, sent, error }: AuthPageProps) {
  const text = copy[flow];

  return (
    <main className="flex flex-1 items-center px-5 py-12 sm:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <Link
          href="/"
          className="mb-8 flex items-center gap-2 font-serif text-base text-foreground"
        >
          <Mail className="size-4 text-primary" aria-hidden="true" />
          Address Book
        </Link>

        <div className="overflow-hidden rounded-3xl border bg-card shadow-xl shadow-foreground/5 md:grid md:grid-cols-[0.9fr_1.1fr]">
          <section className="flex flex-col justify-center bg-secondary/70 p-8 sm:p-10">
            <h1 className="font-serif text-4xl leading-tight text-balance text-foreground">
              {text.headline}
            </h1>
            <p className="mt-4 leading-relaxed text-pretty text-muted-foreground">
              {text.message}
            </p>
            <Mail className="mt-12 size-5 text-primary" aria-hidden="true" />
          </section>

          <section aria-label={text.formTitle} className="p-8 sm:p-10">
            <h2 className="font-serif text-2xl text-foreground">
              {text.formTitle}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {text.formMessage}
            </p>

            {sent ? (
              <div className="mt-7 flex flex-col gap-4">
                <div
                  role="status"
                  className="rounded-xl border border-green-500/25 bg-green-500/10 p-4 text-sm text-foreground"
                >
                  {text.sentMessage}
                </div>
                <Link
                  href={`/${flow}`}
                  className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
                >
                  Use a different email
                </Link>
              </div>
            ) : (
              <AuthActions flow={flow} error={error} />
            )}

            <p className="mt-7 text-sm text-muted-foreground">
              {text.alternatePrompt}{" "}
              <Link
                href={text.alternateHref}
                className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
              >
                {text.alternateLabel}
              </Link>
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}

function AuthActions({
  flow,
  error,
}: {
  flow: AuthPageProps["flow"];
  error?: string;
}) {
  return (
    <div className="mt-7">
      {error ? (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
        >
          Something went wrong. Please try again.
        </div>
      ) : null}

      <form action={sendMagicLink} className="flex flex-col gap-3">
        <input type="hidden" name="flow" value={flow} />
        <label htmlFor="email" className="text-sm font-medium text-foreground">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          className="h-12 rounded-xl border border-input bg-background/60 px-4 text-base text-foreground shadow-sm outline-none placeholder:text-muted-foreground/60 focus:border-ring focus:ring-3 focus:ring-ring/25"
        />
        <SubmitButton
          pendingLabel="Sending…"
          className="mt-1 h-12 rounded-xl bg-primary text-base font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/85"
        >
          Send magic link
        </SubmitButton>
      </form>

      <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wider text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>

      <form action={continueWithGoogle}>
        <input type="hidden" name="flow" value={flow} />
        <SubmitButton
          pendingLabel="Redirecting…"
          className="h-11 w-full rounded-xl border border-input bg-background/40 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          Continue with Google
        </SubmitButton>
      </form>
    </div>
  );
}
