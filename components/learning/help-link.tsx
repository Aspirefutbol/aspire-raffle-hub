import { CircleHelp } from "lucide-react";
import Link from "next/link";

export function HelpLink({ orgSlug, article, label = "Learn" }: {
  orgSlug: string;
  article: string;
  label?: string;
}) {
  return (
    <Link
      href={`/o/${orgSlug}/learn/${article}`}
      className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline"
    >
      <CircleHelp aria-hidden className="size-4" />
      {label}
    </Link>
  );
}
