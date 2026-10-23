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
    <header><p className="text-sm font-semibold text-brand-700">{page.organization}</p><h1 className="mt-2 text-3xl font-bold">{page.campaign}</h1><p className="mt-2">Support this fundraiser</p></header>
    {page.description && <p className="whitespace-pre-wrap">{page.description}</p>}
    <dl className="grid gap-3 rounded-card border border-line bg-surface p-4"><div><dt>Ticket price</dt><dd>{ticketOfferText(page.ticket_price_cents, page.ticket_packages)}</dd></div><div><dt>Sales close</dt><dd>{formatDate(page.sales_close_at,page.timezone)}</dd></div><div><dt>Drawing date</dt><dd>{formatDate(page.draw_at,page.timezone)}</dd></div></dl>
    <SupporterForm token={token}/>
    <section><h2 className="font-semibold">What happens next</h2><p>Your seller follows up, receives approved offline cash or check payment, then records the sale and confirms ticket details through the approved process. No online payment is collected here. A request is not an entry.</p></section>
    <section><h2 className="font-semibold">Raffle rules and eligibility</h2><p className="whitespace-pre-wrap">{page.rules}</p></section>
    <section><h2 className="font-semibold">Support</h2><p className="break-all">{page.support_email} {page.support_phone}</p></section>
  </main>;
}
