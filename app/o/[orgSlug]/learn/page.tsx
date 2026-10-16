import { BookOpen, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireOrgContext, requirePagePermission } from "@/lib/auth/org-context";
import { LEARNING_ARTICLES, LEARNING_CATEGORIES, searchLearningArticles } from "@/lib/learning/articles";

export const metadata: Metadata = { title: "Learning Hub" };

export default async function LearningHubPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { orgSlug } = await params;
  const raw = (await searchParams).q;
  const query = (Array.isArray(raw) ? raw[0] ?? "" : raw ?? "").trim();
  const ctx = await requireOrgContext(orgSlug);
  requirePagePermission(ctx, "organization.manage");

  const results = searchLearningArticles(query);

  return (
    <>
      <PageHeader
        title="Learning Hub"
        description="Search approved operating guides for Raffle Hub."
      />

      <Card className="mb-5">
        <CardBody>
          <form method="get" className="flex flex-col gap-2 sm:flex-row" role="search">
            <label htmlFor="learning-search" className="sr-only">What do you need help with?</label>
            <div className="relative min-w-0 flex-1">
              <Search aria-hidden className="absolute left-3 top-3 size-4 text-muted" />
              <input
                id="learning-search"
                name="q"
                defaultValue={query}
                placeholder="What do you need help with?"
                className="min-h-11 w-full rounded-control border border-line bg-surface pl-9 pr-3 text-sm text-ink"
              />
            </div>
            <button type="submit" className="min-h-11 rounded-control bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700">
              Search guides
            </button>
            {query && (
              <Link href={`/o/${orgSlug}/learn`} className="inline-flex min-h-11 items-center justify-center px-3 text-sm text-brand-700 hover:underline">
                Clear
              </Link>
            )}
          </form>
          <p className="mt-2 text-xs text-muted">Try: “reverse a sale”, “check bounced”, “freeze drawing”, or “money still due”.</p>
        </CardBody>
      </Card>

      {query ? (
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-ink">Search results</h2>
            <span className="text-xs text-muted">{results.length} guide{results.length === 1 ? "" : "s"}</span>
          </div>
          {results.length ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {results.map((article) => (
                <ArticleCard key={article.slug} orgSlug={orgSlug} article={article} />
              ))}
            </div>
          ) : (
            <Card>
              <CardBody className="py-8 text-center">
                <p className="font-medium text-ink">No approved guide matched that search.</p>
                <p className="mt-1 text-sm text-muted">Try fewer words or clear the search to browse all categories.</p>
              </CardBody>
            </Card>
          )}
        </section>
      ) : (
        <div className="space-y-5">
          <Card>
            <CardHeader title="Start here" description="The fastest path for a new raffle operator." />
            <CardBody>
              <div className="grid gap-3 md:grid-cols-3">
                {["prepare-campaign", "enroll-players-and-inventory", "roles-and-scope"].map((slug) => {
                  const article = LEARNING_ARTICLES.find((item) => item.slug === slug)!;
                  return <ArticleCard key={slug} orgSlug={orgSlug} article={article} compact />;
                })}
              </div>
            </CardBody>
          </Card>

          {LEARNING_CATEGORIES.filter((category) => category !== "Start here").map((category) => {
            const articles = LEARNING_ARTICLES.filter((article) => article.category === category);
            return (
              <section key={category}>
                <h2 className="mb-3 text-base font-semibold text-ink">{category}</h2>
                <div className="grid gap-3 lg:grid-cols-2">
                  {articles.map((article) => <ArticleCard key={article.slug} orgSlug={orgSlug} article={article} />)}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

function ArticleCard({
  orgSlug,
  article,
  compact = false,
}: {
  orgSlug: string;
  article: (typeof LEARNING_ARTICLES)[number];
  compact?: boolean;
}) {
  return (
    <Link
      href={`/o/${orgSlug}/learn/${article.slug}`}
      className="group block rounded-card border border-line bg-surface p-4 shadow-card hover:border-brand-300"
    >
      <div className="flex items-start gap-3">
        <BookOpen aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-600" />
        <div className="min-w-0">
          <h3 className="font-medium text-ink group-hover:text-brand-700 group-hover:underline">{article.title}</h3>
          {!compact && <p className="mt-1 text-sm text-muted">{article.summary}</p>}
          <p className="mt-2 text-xs text-muted">{article.category}</p>
        </div>
      </div>
    </Link>
  );
}
