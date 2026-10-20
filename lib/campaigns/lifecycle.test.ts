import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_LOCKED_FIELDS, CAMPAIGN_STATUSES, CAMPAIGN_TRANSITIONS, canTransition, editableFieldsFilter,
  transitionNeedsReason, transitionPermission,
} from "./lifecycle";

const sql = readFileSync(join(__dirname, "../../supabase/migrations/20261012000200_campaign_lifecycle.sql"), "utf8");
const complianceSql = readFileSync(join(__dirname, "../../supabase/migrations/20261020170805_controlled_pilot_compliance.sql"), "utf8");

describe("campaign lifecycle mirror", () => {
  it("transition edges match campaign_transition_allowed()", () => {
    const body = sql.slice(sql.indexOf("function public.campaign_transition_allowed"), sql.indexOf("function public.guard_campaign_write"));
    const edges = [...body.matchAll(/\('([A-Z]+)', '([A-Z]+)'\)/g)].map((m) => `${m[1]}>${m[2]}`).sort();
    const mirror = Object.entries(CAMPAIGN_TRANSITIONS).flatMap(([from, tos]) => tos.map((to) => `${from}>${to}`)).sort();
    expect(mirror).toEqual(edges);
  });

  it("locked fields match the latest campaign_locked_fields()", () => {
    const body = complianceSql.slice(complianceSql.indexOf("function public.campaign_locked_fields"), complianceSql.indexOf("function public.campaign_compliance_fields"));
    const fields = [...body.matchAll(/'([a-z_]+)', c\./g)].map((m) => m[1]).sort();
    expect([...CAMPAIGN_LOCKED_FIELDS].sort()).toEqual(fields);
  });

  it("rejects skipping states and reopening", () => {
    expect(canTransition("DRAFT", "ACTIVE")).toBe(false);
    expect(canTransition("ACTIVE", "DRAFT")).toBe(false);
    expect(canTransition("CLOSED", "ACTIVE")).toBe(false);
    expect(canTransition("ARCHIVED", "DRAFT")).toBe(false);
    for (const s of CAMPAIGN_STATUSES) expect(canTransition(s, s)).toBe(false);
  });

  it("activation and drawing require governance permission; setup steps require campaigns.manage", () => {
    expect(transitionPermission("READY", "ACTIVE")).toBe("campaigns.activate");
    expect(transitionPermission("CLOSED", "DRAWN")).toBe("campaigns.activate");
    expect(transitionPermission("DRAWN", "ARCHIVED")).toBe("campaigns.activate");
    expect(transitionPermission("DRAFT", "READY")).toBe("campaigns.manage");
    expect(transitionPermission("ACTIVE", "CLOSED")).toBe("campaigns.manage");
    expect(transitionPermission("DRAFT", "ARCHIVED")).toBe("campaigns.manage");
  });

  it("only DRAFT → READY may skip the reason", () => {
    expect(transitionNeedsReason("DRAFT", "READY")).toBe(false);
    expect(transitionNeedsReason("READY", "ACTIVE")).toBe(true);
  });

  it("ticket price is editable before activation, locked after, closed campaigns read-only", () => {
    expect(editableFieldsFilter("READY")?.("ticket_price_cents")).toBe(true);
    expect(editableFieldsFilter("ACTIVE")?.("ticket_price_cents")).toBe(false);
    expect(editableFieldsFilter("ACTIVE")?.("goal_amount_cents")).toBe(true);
    expect(editableFieldsFilter("CLOSED")).toBeNull();
  });
});
