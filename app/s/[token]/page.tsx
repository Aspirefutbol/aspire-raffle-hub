import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { publicSellerPage } from "@/lib/sharing/public";
import { SupporterForm } from "@/components/sharing/supporter-form";
import { ticketOfferText } from "@/lib/fundraising/campaign-pricing";
import { formatDate } from "@/lib/format";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Support this fundraiser", robots: { index: false, follow: false } };
export default async function SupporterPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const page = await publicSellerPage(token);
  if (!page) notFound();
  return <main className="mx-auto max-w-2xl space-y-6 break-words px-4 py-8">
    <header><p className="text-sm font-semibold text-brand-700">{page.organization}</p><h1 className="mt-2 text-3xl font-bold">{page.campaign}</h1><p className="mt-2 text-ink-soft">Support this Aspire fundraiser by requesting raffle tickets below.</p></header>
    {page.description && <p className="whitespace-pre-wrap">{page.description}</p>}
    <dl className="grid gap-3 rounded-card border border-line bg-surface p-4"><div><dt>Ticket price</dt><dd>{ticketOfferText(page.ticket_price_cents, page.ticket_packages)}</dd></div><div><dt>Sales close</dt><dd>{formatDate(page.sales_close_at,page.timezone)}</dd></div><div><dt>Drawing date</dt><dd>{formatDate(page.draw_at,page.timezone)}</dd></div></dl>
    <SupporterForm token={token} ticketPriceCents={page.ticket_price_cents} ticketPackages={page.ticket_packages}/>
    <details className="rounded-control border border-line bg-surface px-4 py-2"><summary className="min-h-11 cursor-pointer py-3 font-semibold">Raffle details</summary><div className="space-y-4 pb-3 text-sm text-ink-soft"><section><h2 className="font-semibold text-ink">Rules and eligibility</h2><p className="mt-1 whitespace-pre-wrap">{page.rules}</p></section><section><h2 className="font-semibold text-ink">Support</h2><p className="mt-1 break-all">{page.support_email} {page.support_phone}</p></section></div></details>
  </main>;
}
