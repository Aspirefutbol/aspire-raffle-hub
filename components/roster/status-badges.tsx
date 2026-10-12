import { Badge } from "@/components/ui/badge";

export function PlayerStatusBadge({ status }: { status: string | null }) {
  if (status === "active") return <Badge tone="success">Active</Badge>;
  if (status === "inactive") return <Badge tone="neutral">Inactive</Badge>;
  return <Badge tone="muted">Archived</Badge>;
}

export function TeamStatusBadge({ status }: { status: string }) {
  if (status === "active") return <Badge tone="success">Active</Badge>;
  if (status === "inactive") return <Badge tone="neutral">Inactive</Badge>;
  return <Badge tone="muted">Archived</Badge>;
}
