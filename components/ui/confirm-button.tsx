"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Button } from "./button";

/**
 * Two-step inline confirmation ("Archive" → "Confirm archive?") instead of a
 * modal dialog. Reverts after a few seconds if not confirmed.
 */
export function ConfirmButton({ children, confirmLabel, onConfirm, variant = "danger", size = "sm", icon, disabled, loading }: {
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  variant?: "danger" | "secondary" | "ghost";
  size?: "sm" | "md";
  icon?: ReactNode;
  disabled?: boolean;
  loading?: boolean;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  return (
    <Button
      variant={armed ? "danger" : variant}
      size={size}
      icon={icon}
      disabled={disabled}
      loading={loading}
      aria-live="polite"
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
        }
      }}
    >
      {armed ? confirmLabel : children}
    </Button>
  );
}
