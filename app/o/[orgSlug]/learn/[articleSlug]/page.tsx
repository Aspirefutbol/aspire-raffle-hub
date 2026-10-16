import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireOrgContext, requirePagePermission } from "@/lib/auth/org-context";
import { getLearningArticle } from "@/lib/learning/articles";

export default async function LearningArticlePage({
  params,
}: {
  params: Promise<{ orgSlug: string; articleSlug: string }>;
}) {
  const { orgSlug, articleSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  requirePagePermission(ctx, "organization.manage");

  const article = getLearningArticle(articleSlug);
  if (!article) notFound();

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link href={`/o/${orgSlug}/learn`} className="inline-flex items-center gap-1 hover:text-ink">
            <ArrowLeft aria-hidden className="size-3" />
            Learning Hub
          </Link>
        }
        title={article.title}
        description={article.summary}
      />

      <Card className="mb-5">
        <CardBody className="space-y-6">
          {article.sections.map((section) => (
            <section key={section.title}>
              <h2 className="mb-2 text-base font-semibold text-ink">{section.title}</h2>
              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph} className="mb-2 text-sm leading-6 text-ink-soft">{paragraph}</p>
              ))}
              {section.steps && (
                <ol className="space-y-2 pl-5 text-sm leading-6 text-ink-soft">
                  {section.steps.map((step, index) => (
                    <li key={step} className="list-decimal pl-1"><span className="font-medium text-ink">{index + 1}.</span> {step}</li>
                  ))}
                </ol>
              )}
              {section.bullets && (
                <ul className="space-y-2 pl-5 text-sm leading-6 text-ink-soft">
                  {section.bullets.map((bullet) => <li key={bullet} className="list-disc pl-1">{bullet}</li>)}
                </ul>
              )}
            </section>
          ))}
        </CardBody>
      </Card>

      {article.related.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-ink">Related guides</h2>
          <div className="flex flex-wrap gap-2">
            {article.related.map((slug) => {
              const related = getLearningArticle(slug);
              return related ? (
                <Link key={slug} href={`/o/${orgSlug}/learn/${slug}`} className="rounded-control border border-line bg-surface px-3 py-2 text-sm text-brand-700 hover:border-brand-300 hover:underline">
                  {related.title}
                </Link>
              ) : null;
            })}
          </div>
        </section>
      )}

      <p className="mt-5 text-xs text-muted">Updated {article.updatedAt}. Guidance is version-controlled with the deployed product and does not perform any campaign, ticket, money, drawing, roster, or audit mutation.</p>
    </>
  );
}
