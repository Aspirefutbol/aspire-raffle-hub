"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function OrgError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <AlertTriangle aria-hidden className="mx-auto mb-3 size-6 text-amber-600" />
      <h1 className="font-semibold text-ink">This page couldn’t load</h1>
      <p className="mt-1 text-sm text-muted">
        A temporary problem stopped us from loading your data. Nothing was changed. Try again, and if it keeps happening, contact support
        {error.digest ? ` with reference ${error.digest}` : ""}.
      </p>
      <Button className="mt-4" variant="secondary" icon={<RotateCcw className="size-4" />} onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
