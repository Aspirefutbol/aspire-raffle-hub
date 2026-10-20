"use client";

import { Button } from "@/components/ui/button";

export function PrintTicketsButton() {
  return <Button onClick={() => window.print()}>Print tickets</Button>;
}
