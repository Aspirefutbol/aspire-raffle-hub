import { describe, expect, it } from "vitest";
import { LEARNING_ARTICLES, getLearningArticle, searchLearningArticles } from "./articles";

describe("Learning Hub catalog", () => {
  it("keeps stable unique article slugs", () => {
    const slugs = LEARNING_ARTICLES.map((article) => article.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs.length).toBeGreaterThanOrEqual(20);
  });

  it("resolves launch-critical operator questions", () => {
    expect(searchLearningArticles("reverse a sale").some((article) => article.slug === "reverse-sale")).toBe(true);
    expect(searchLearningArticles("check bounced").some((article) => article.slug === "returned-checks")).toBe(true);
    expect(searchLearningArticles("freeze drawing").some((article) => article.slug === "freeze-drawing")).toBe(true);
    expect(searchLearningArticles("money still due").some((article) => article.slug === "understand-money-balances")).toBe(true);
  });

  it("returns an article by slug and nothing for unknown slugs", () => {
    expect(getLearningArticle("record-offline-sale")?.title).toContain("offline sale");
    expect(getLearningArticle("not-a-real-guide")).toBeUndefined();
  });

  it("explains package setup and sale totals without single-price-only instructions", () => {
    expect(searchLearningArticles("ticket packages").some((article) => article.slug === "prepare-campaign")).toBe(true);
    expect(searchLearningArticles("bundle price").some((article) => article.slug === "record-offline-sale")).toBe(true);
    const setup = JSON.stringify(getLearningArticle("prepare-campaign"));
    const sale = JSON.stringify(getLearningArticle("record-offline-sale"));
    expect(setup).toContain("Add ticket package");
    expect(setup).toContain("Preview a sale");
    expect(setup).toContain("six tickets for $110");
    expect(setup).toContain("lock at activation");
    expect(setup).toContain("within one sale");
    expect(setup).not.toContain("full-price offline sales");
    expect(sale).toContain("automatically calculated total");
    expect(sale).toContain("retry the saved submission");
    expect(sale).toContain("one drawing entry");
    expect(sale).not.toContain("Confirm the amount matches ticket face value.");
  });

});
