import { describe, expect, it } from "vitest";
import { emailSchema, normalizeEmail } from "./email";

describe("email normalization", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Jo_E@Example.COM ")).toBe("jo_e@example.com");
    expect(emailSchema.parse(" A_B+c@x.org ")).toBe("a_b+c@x.org");
  });
  it("keeps _ and % as literal characters (lookup is exact, never a pattern)", () => {
    expect(normalizeEmail("j_o%e@x.org")).toBe("j_o%e@x.org");
  });
  it("rejects invalid addresses", () => {
    expect(emailSchema.safeParse("not-an-email").success).toBe(false);
    expect(emailSchema.safeParse("").success).toBe(false);
  });
});
