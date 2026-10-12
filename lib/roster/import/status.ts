import type { Tone } from "@/components/ui/badge";

export const IMPORT_STATUS: Record<string, { tone: Tone; label: string }> = {
  uploaded: { tone: "info", label: "Map columns" },
  mapped: { tone: "warning", label: "Needs review" },
  validated: { tone: "warning", label: "Needs review" },
  completed: { tone: "success", label: "Imported" },
  cancelled: { tone: "muted", label: "Cancelled" },
};
