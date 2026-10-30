"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * Side panel built on <dialog> (focus trap, Esc to close, inert background).
 * Used instead of centered modals: forms keep context of the page behind them.
 */
export function Sheet({ open, onClose, title, description, children, footer, wide }: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="sheet-title"
      className={`fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-dvh min-w-0 w-full max-w-[100vw] ${wide ? "sm:max-w-2xl" : "sm:max-w-md"} bg-surface p-0 shadow-pop open:animate-sheet-in`}
    >
      {open && (
        <div className="flex h-full min-w-0 flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <h2 id="sheet-title" className="text-base font-semibold text-ink">{title}</h2>
              {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-control p-1.5 pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:p-3 text-muted hover:bg-canvas hover:text-ink"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="min-w-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="border-t border-line bg-canvas/60 px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
