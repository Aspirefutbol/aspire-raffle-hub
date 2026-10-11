export const JURISDICTION_PROFILES = ["TEXAS_CREA_OFFLINE_PAYMENT"] as const;

export const JURISDICTION_LABELS: Record<(typeof JURISDICTION_PROFILES)[number], string> = {
  TEXAS_CREA_OFFLINE_PAYMENT: "Texas CREA — offline payment only",
};

export const ORGANIZATION_STATUSES = ["active", "suspended", "archived"] as const;
