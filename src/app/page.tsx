import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-zinc-50 px-4 text-center dark:bg-black">
      <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        Address Book
      </h1>
      <p className="max-w-md text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
        Collect and keep your friends&apos; mailing addresses up to date —
        without the group-text scramble.
      </p>
      <Link
        href="/login"
        className="flex h-11 items-center justify-center rounded-full bg-zinc-900 px-6 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        Sign in
      </Link>
    </main>
  );
}
