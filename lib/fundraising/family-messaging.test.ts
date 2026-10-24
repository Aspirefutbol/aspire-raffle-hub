import { describe, expect, it } from "vitest";
import { familyCampaignDisplayState, fundraisingEncouragement } from "./family-messaging";

describe("family campaign messaging", () => {
  it("shows parent-facing sales state instead of a misleading active badge", () => {
    const now = Date.parse("2026-10-24T14:00:00Z");
    expect(familyCampaignDisplayState("ACTIVE", null, "2026-10-24T13:59:00Z", now)).toEqual({ label: "Sales closed", tone: "warning" });
    expect(familyCampaignDisplayState("ACTIVE", "2026-10-24T14:01:00Z", null, now)).toEqual({ label: "Starts soon", tone: "info" });
    expect(familyCampaignDisplayState("ACTIVE", "2026-10-24T13:00:00Z", "2026-10-25T14:00:00Z", now)).toBeNull();
    expect(familyCampaignDisplayState("DRAWN", null, null, now)).toBeNull();
  });

  it("adds restrained milestone encouragement", () => {
    expect(fundraisingEncouragement(0, 20000, 0)).toBe("Share your raffle link to get started.");
    expect(fundraisingEncouragement(2000, 20000, 2)).toContain("Nice start");
    expect(fundraisingEncouragement(5000, 20000, 5)).toContain("Great start");
    expect(fundraisingEncouragement(10000, 20000, 10)).toContain("Halfway");
    expect(fundraisingEncouragement(15000, 20000, 15)).toContain("Almost there");
    expect(fundraisingEncouragement(20000, 20000, 20)).toContain("Goal reached");
  });
});
