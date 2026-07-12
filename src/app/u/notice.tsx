import { type ReactNode } from "react";

/**
 * Single generic copy for EVERY dead token — unknown, expired, and used
 * render pixel-identically so the page never confirms whether a token ever
 * existed. The submit action returns the same string for the same reason.
 */
export const INVALID_LINK_MESSAGE =
  "This link is invalid or has expired. Ask the person who sent it for a fresh one.";

/** Centered card used by every recipient-facing terminal state. */
export function Notice({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {title}
        </h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          {children}
        </p>
      </div>
    </main>
  );
}

/** The one-and-only dead-link page (invalid, expired, and used alike). */
export function InvalidLinkNotice() {
  return <Notice title="Link not available">{INVALID_LINK_MESSAGE}</Notice>;
}
