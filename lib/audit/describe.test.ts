import { describe, expect, it } from "vitest";
import { describeAction, describeChangedFields } from "./describe";

describe("audit descriptions", () => {
  it("labels known actions and falls back gracefully", () => {
    expect(describeAction("PLAYER_TEAM_CHANGED")).toBe("Team changed");
    expect(describeAction("SOMETHING_NEW")).toBe("Something new");
    expect(describeAction("ROLE_GRANTED")).toBe("Role granted");
    expect(describeAction("CAMPAIGN_STATUS_CHANGED")).toBe("Campaign status changed");
  });
  it("lists changed fields in plain language", () => {
    expect(describeChangedFields(["date_of_birth", "first_name", "archived_at"])).toBe("date of birth, first name");
    expect(describeChangedFields(["status"])).toBeNull();
  });
});
