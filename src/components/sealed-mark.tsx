import { cn } from "@/lib/utils";

/** Original temporary mark: a closed envelope secured with a small seal. */
export function SealedMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("size-4", className)}
      aria-hidden="true"
    >
      <rect x="2.75" y="5" width="18.5" height="14" rx="2.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="m4 7 8 6 8-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="13" r="2.15" fill="currentColor" />
      <path d="m10.7 14.6-.55 3 1.85-.9 1.85.9-.55-3" fill="currentColor" />
    </svg>
  );
}

export function SealedWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2 font-serif text-base text-foreground", className)}>
      <SealedMark className="text-primary" />
      Sealed
    </span>
  );
}
