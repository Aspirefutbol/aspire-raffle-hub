import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

export function Pagination({ page, pageSize, total, hrefFor }: {
  page: number;
  pageSize: number;
  total: number;
  hrefFor: (page: number) => string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const linkCls = "inline-flex size-8 pointer-coarse:size-11 items-center justify-center rounded-control border border-line-strong bg-surface hover:bg-canvas";
  const disabledCls = "inline-flex size-8 pointer-coarse:size-11 items-center justify-center rounded-control border border-line text-line-strong";
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-xs text-muted">
      <span className="tabular">
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-1.5">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className={linkCls} aria-label="Previous page">
            <ChevronLeft className="size-4" />
          </Link>
        ) : (
          <span className={disabledCls} aria-hidden><ChevronLeft className="size-4" /></span>
        )}
        <span className="tabular px-1">
          {page} / {pages}
        </span>
        {page < pages ? (
          <Link href={hrefFor(page + 1)} className={linkCls} aria-label="Next page">
            <ChevronRight className="size-4" />
          </Link>
        ) : (
          <span className={disabledCls} aria-hidden><ChevronRight className="size-4" /></span>
        )}
      </div>
    </nav>
  );
}
