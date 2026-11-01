import { describe, expect, it } from "vitest";
import { singleActiveFamilyCampaign } from "./family-entry";
import type { CampaignProgress } from "./types";

const NOW = Date.parse("2026-11-01T12:00:00Z");
function fixture(status: CampaignProgress["campaign"]["status"] = "ACTIVE", participantStatus: "active" | "withdrawn" = "active") {
  return {
    campaign: { status, starts_at: "2026-10-31T00:00:00Z", sales_close_at: "2026-11-23T00:00:00Z" },
    participants: [{ status: participantStatus }],
  } as Pick<CampaignProgress, "campaign" | "participants">;
}
describe("family home entry", () => {
  it("opens the only active family fundraiser without a selector", () => {
    const one = fixture();
    expect(singleActiveFamilyCampaign([one], NOW)).toBe(one);
  });
  it("opens a single eligible active fundraiser even when authorized READY and historical campaigns exist", () => {
    const active = fixture();
    const ready = fixture("READY");
    const historical = fixture("CLOSED");
    expect(singleActiveFamilyCampaign([ready, historical, active], NOW)).toBe(active);
    const outOfWindow = fixture();
    outOfWindow.campaign.starts_at = "2026-11-03T00:00:00Z";
    expect(singleActiveFamilyCampaign([outOfWindow, active], NOW)).toBe(active);
  });
  it("retains the selector whenever multiple authorized campaigns are visible", () => {
    expect(singleActiveFamilyCampaign([fixture(), fixture()], NOW)).toBeNull();
  });
  it("retains safe empty and unavailable states", () => {
    expect(singleActiveFamilyCampaign([], NOW)).toBeNull();
    expect(singleActiveFamilyCampaign([fixture("READY")], NOW)).toBeNull();
    expect(singleActiveFamilyCampaign([fixture("ACTIVE", "withdrawn")], NOW)).toBeNull();
  });
  it("does not open early, closed or invalid time windows", () => {
    const early = fixture();
    early.campaign.starts_at = "2026-11-02T00:00:00Z";
    expect(singleActiveFamilyCampaign([early], NOW)).toBeNull();
    const closed = fixture();
    closed.campaign.sales_close_at = "2026-10-31T00:00:00Z";
    expect(singleActiveFamilyCampaign([closed], NOW)).toBeNull();
    const invalid = fixture();
    invalid.campaign.starts_at = "not a timestamp";
    expect(singleActiveFamilyCampaign([invalid], NOW)).toBeNull();
  });
});
