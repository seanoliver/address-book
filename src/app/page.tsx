import Link from "next/link";
import { Lock, Mail } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function Home() {
  return (
    <main className="flex flex-1 items-center px-5 py-16 sm:px-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-12">
        <span className="flex items-center gap-2 font-serif text-base text-foreground">
          <Mail className="size-4 text-primary" aria-hidden="true" />
          Address Book
        </span>
        <div className="max-w-2xl">
          <p className="mb-4 text-sm font-medium tracking-wide text-primary uppercase">
            A simpler way to stay in touch
          </p>
          <h1 className="font-serif text-5xl leading-[1.05] text-balance text-foreground sm:text-7xl">
            Mailing addresses, kept current by the people you love.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-pretty text-muted-foreground">
            Share one private link with friends and family. They add their own details, and your address book stays ready for cards and invitations.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/signup"
              className={cn(
                buttonVariants({ variant: "default", size: "lg" }),
                "h-13 rounded-xl border-primary px-7 text-base font-semibold shadow-md shadow-primary/15 hover:-translate-y-0.5 hover:bg-primary/85 hover:shadow-lg hover:shadow-primary/20",
              )}
            >
              Create your address book
            </Link>
            <Link
              href="/login"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "h-13 rounded-xl px-6 text-base shadow-sm",
              )}
            >
              Log in
            </Link>
          </div>
        </div>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Lock className="size-4" aria-hidden="true" />
          Private by design. Your contacts are never visible to one another.
        </p>
      </div>
    </main>
  );
}
