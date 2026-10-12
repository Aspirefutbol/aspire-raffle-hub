import { describe, expect, it } from "vitest";
import { age, formatDate, formatPhone, fullName, pluralize } from "./format";

describe("format", () => {
  it("prefers preferred name", () => {
    expect(fullName({ first_name: "Arjun", last_name: "Patel", preferred_name: "AJ" })).toBe("AJ Patel");
    expect(fullName({ first_name: "Arjun", last_name: "Patel", preferred_name: null })).toBe("Arjun Patel");
  });
  it("does not shift date-only values across timezones", () => {
    expect(formatDate("2013-04-12")).toBe("Apr 12, 2013");
  });
  it("computes age around birthdays", () => {
    expect(age("2013-04-12", new Date("2026-04-11T12:00:00Z"))).toBe(12);
    expect(age("2013-04-12", new Date("2026-04-12T12:00:00Z"))).toBe(13);
  });
  it("formats US phones", () => {
    expect(formatPhone("7135550101")).toBe("(713) 555-0101");
    expect(formatPhone("+1 713 555 0101")).toBe("(713) 555-0101");
    expect(formatPhone("+44 20 7946 0000")).toBe("+44 20 7946 0000");
  });
  it("pluralizes", () => {
    expect(pluralize(1, "player")).toBe("1 player");
    expect(pluralize(3, "player")).toBe("3 players");
  });
});
