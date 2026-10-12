"use client";

import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { uploadImport } from "@/lib/roster/import/actions";

export function UploadCard({ orgSlug }: { orgSlug: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function upload(file: File) {
    setError(null);
    setFileName(file.name);
    const fd = new FormData();
    fd.set("file", file);
    startTransition(async () => {
      const result = await uploadImport(orgSlug, fd);
      if (result.ok) {
        if (result.message) toast.success(result.message);
        router.push(`/o/${orgSlug}/people/players/import/${result.data.id}`);
      } else {
        setError(result.fieldErrors?.file ?? result.error);
        setFileName(null);
      }
    });
  }

  return (
    <Card className="p-4 sm:p-5">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) upload(file);
        }}
        className={cn(
          "flex flex-col items-center rounded-card border-2 border-dashed px-4 py-8 text-center transition-colors sm:py-10",
          dragging ? "border-brand-500 bg-brand-50" : "border-line-strong bg-canvas/40",
        )}
      >
        <div className="mb-3 rounded-full bg-brand-50 p-3 text-brand-600">
          <FileSpreadsheet aria-hidden className="size-6" />
        </div>
        <p className="font-semibold text-ink">{pending ? `Uploading ${fileName}…` : "Drop your roster spreadsheet here"}</p>
        <p className="mt-1 max-w-md text-sm text-muted">
          CSV from Excel, Google Sheets or your registration system — any column names. Nothing is added to your roster until you review and confirm.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.tsv,.txt,text/csv"
          className="sr-only"
          id="roster-file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
            e.target.value = "";
          }}
        />
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button icon={<Upload className="size-4" />} loading={pending} onClick={() => inputRef.current?.click()}>
            Choose file
          </Button>
          <a href="/templates/raffle-hub-player-import-template.csv" download className="inline-flex h-9 pointer-coarse:h-11 items-center gap-1.5 rounded-control px-3 text-sm font-medium text-ink-soft hover:bg-surface">
            <Download aria-hidden className="size-4" /> Download template
          </a>
        </div>
        {error && (
          <p role="alert" className="mt-4 rounded-control bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
      <p className="mt-3 text-xs text-muted">Up to 5,000 rows and 5 MB per file. Excel users: File → Save As → CSV (UTF-8).</p>
    </Card>
  );
}
