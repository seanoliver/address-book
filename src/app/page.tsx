import Link from "next/link";
import { ArrowRight, Lock, Mail } from "lucide-react";

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
          <Link href="/login" className="mt-8 inline-flex h-12 items-center gap-2 rounded-lg bg-primary px-6 text-base font-medium text-primary-foreground transition-colors hover:bg-primary/80">
            Create your address book
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Lock className="size-4" aria-hidden="true" />
          Private by design. Your contacts are never visible to one another.
        </p>
      </div>
    </main>
  );
}
