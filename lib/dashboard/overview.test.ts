import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const { buildActionItems } = await import("./overview");

const base = {
  total_players: 20, active_teams: 6, households: 8, unassigned_players: 3, players_without_guardian: 0,
  possible_duplicates: 2, households_missing_contact: 1, open_imports: 1, recent_imports: [],
};

describe("buildActionItems", () => {
  it("only lists items that need action, each deep-linked", () => {
    const items = buildActionItems(base, "/o/aspire", true);
    expect(items.map((i) => i.key)).toEqual(["duplicates", "unassigned", "no-contact", "imports"]);
    expect(items[1]).toMatchObject({ count: 3, label: "players need a team", href: "/o/aspire/people/players?issue=unassigned" });
    expect(items[2]?.label).toBe("household missing contact information");
  });
  it("hides import items from users who cannot import", () => {
    expect(buildActionItems(base, "/o/a", false).some((i) => i.key === "imports")).toBe(false);
  });
});
