import { describe, expect, it } from "vitest";
import { safeNextPath } from "./redirect";

describe("safeNextPath", () => {
  it("allows relative paths", () => {
    expect(safeNextPath("/o/aspire/dashboard?x=1")).toBe("/o/aspire/dashboard?x=1");
  });
  it("rejects open redirects", () => {
    expect(safeNextPath("//evil.com")).toBe("/");
    expect(safeNextPath("https://evil.com")).toBe("/");
    expect(safeNextPath("/\\evil.com")).toBe("/");
    expect(safeNextPath(undefined, "/login")).toBe("/login");
  });
});
