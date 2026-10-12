"use client";

import { useTransition } from "react";
import { toast } from "sonner";

type Result<T> = { ok: true; data: T; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };

/**
 * Runs a server action in a transition and reports the outcome with a toast.
 * Server actions call revalidatePath, so the page re-renders with fresh data.
 */
export function useActionRunner() {
  const [pending, startTransition] = useTransition();

  function run<T>(
    action: () => Promise<Result<T>>,
    opts: { onSuccess?: (data: T) => void; onError?: (fieldErrors?: Record<string, string>) => void; successMessage?: string } = {},
  ) {
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) {
          const message = opts.successMessage ?? result.message;
          if (message) toast.success(message);
          opts.onSuccess?.(result.data);
        } else {
          toast.error(result.error);
          opts.onError?.(result.fieldErrors);
        }
      } catch {
        toast.error("Network problem — your change may not have been saved. Please try again.");
      }
    });
  }

  return { run, pending };
}
