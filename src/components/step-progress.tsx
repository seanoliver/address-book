import { cn } from "@/lib/utils";

const STEP_LABELS = ["Your details", "Preview"];

export function StepProgress({
  current,
  total = 2,
}: {
  current: number;
  total?: number;
}) {
  return (
    <div
      className="flex items-center gap-3"
      aria-label={`Step ${current} of ${total}`}
    >
      <span className="font-serif text-sm tracking-wide text-muted-foreground">
        Step <span className="text-foreground tabular-nums">{current}</span>
        <span aria-hidden="true"> of {total}</span>
      </span>
      <ol className="flex items-center gap-1.5" role="list">
        {Array.from({ length: total }, (_, index) => {
          const step = index + 1;
          const done = step < current;
          const active = step === current;
          return (
            <li key={step} className="flex items-center">
              <span
                className={cn(
                  "block h-1.5 rounded-full transition-all duration-300",
                  active
                    ? "w-8 bg-primary"
                    : done
                      ? "w-4 bg-primary/50"
                      : "w-4 bg-border",
                )}
              />
              <span className="sr-only">
                {STEP_LABELS[index] ?? `Step ${step}`}
                {done ? " (completed)" : active ? " (current)" : ""}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
