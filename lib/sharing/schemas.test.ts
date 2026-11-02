import { describe, expect, it } from "vitest";
import { interestSchema, sellerToken, shareLinks } from "./schemas";
const request = { name: "Supporter", email: "buyer@example.test", phone: "", contact: "email", quantity: 2, note: "", website: "" };
describe("nonbinding supporter requests", () => {
  it("accepts one preferred contact and caps quantities", () => {
    expect(interestSchema.safeParse(request).success).toBe(true);
    for (const quantity of [0,101,1.5,NaN]) expect(interestSchema.safeParse({...request,quantity}).success).toBe(false);
    expect(interestSchema.safeParse({...request, email:""}).success).toBe(false);
    expect(interestSchema.safeParse({...request, contact:"phone", phone:"+1 (555) 123-4567", email:""}).success).toBe(true);
  });
  it("rejects unexpected fields, invalid contacts, and oversized text", () => {
    for (const extra of [{payment_method:"card"},{sale_id:"id"},{quantity:"2"},{email:"invalid"},{phone:"javascript:evil"},{note:"x".repeat(1001)},{name:" "}]) expect(interestSchema.safeParse({...request,...extra}).success).toBe(false);
  });
  it("accepts only the opaque token encoding", () => {
    expect(sellerToken.safeParse("a".repeat(64)).success).toBe(true);
    for(const value of ["1","a".repeat(63),"/o/aspire", "z".repeat(64)]) expect(sellerToken.safeParse(value).success).toBe(false);
  });
  it("encodes identical compliant copy for all sharing channels", () => {
    const url="https://example.test/s/"+"a".repeat(64), links=shareLinks(url,"$5.00");
    expect(decodeURIComponent(links.sms.split("body=")[1]!)).toBe(links.text);
    expect(new URL(links.email).searchParams.get("body")).toBe(links.text);
    expect(new URL(links.whatsapp).searchParams.get("text")).toBe(links.text);
    expect(links.text).toContain(url); expect(links.text).toContain("offline payment");
    expect(links.text).not.toMatch(/buy now|checkout|reserve tickets|entry is confirmed/i);
  });
});
