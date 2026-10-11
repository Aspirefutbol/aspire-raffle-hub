import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

const STEPS = ["Upload", "Map columns", "Review & fix", "Import", "Summary"] as const;

export function ImportStepper({ current }: { current: 0 | 1 | 2 | 3 | 4 }) {
  return (
    <ol className="mb-5 flex items-center gap-1 overflow-x-auto text-xs sm:gap-2 sm:text-sm" aria-label="Import progress">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex shrink-0 items-center gap-1 sm:gap-2" aria-current={active ? "step" : undefined}>
            <span
              className={cn(
                "grid size-5 place-items-center rounded-full text-[11px] font-semibold sm:size-6",
                done ? "bg-brand-600 text-white" : active ? "bg-brand-100 text-brand-800 ring-2 ring-brand-500" : "bg-line text-muted",
              )}
            >
              {done ? <Check aria-hidden className="size-3.5" /> : i + 1}
            </span>
            <span className={cn(active ? "font-semibold text-ink" : done ? "text-ink-soft" : "text-muted", !active && "hidden sm:inline")}>{label}</span>
            {i < STEPS.length - 1 && <span aria-hidden className="mx-1 h-px w-4 bg-line-strong sm:w-8" />}
          </li>
        );
      })}
    </ol>
  );
}
