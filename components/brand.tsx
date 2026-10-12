import { Ticket } from "lucide-react";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="grid size-7 place-items-center rounded-lg bg-brand-600 text-white">
        <Ticket aria-hidden className="size-4" />
      </span>
      {!compact && <span className="text-[15px] font-semibold tracking-tight text-ink">Raffle Hub</span>}
    </span>
  );
}
