import type { Metadata } from "next";
import Link from "next/link";
import { AspireSouthCalendarPreview } from "@/components/calendar/aspire-south-calendar-preview";
import { CalendarFamilyPreview } from "@/components/calendar/calendar-family-preview";

export const metadata: Metadata = {
  title: "Aspire South Calendar Fundraiser Preview",
  robots: { index: false, follow: false },
};

export default async function AspireSouthCalendarPage({ searchParams }: {
  searchParams: Promise<{ view?: string | string[]; lang?: string | string[] }>;
}) {
  const query = await searchParams;
  const family = query.view === "family";
  return <>
    <nav aria-label="Preview views / Vistas de demostración" className="mx-auto flex max-w-4xl flex-wrap gap-x-5 gap-y-1 px-4 pt-4 text-sm">
      <Link href="/calendar/aspire-south" aria-current={!family ? "page" : undefined} className="inline-flex min-h-11 items-center font-semibold text-brand-700 underline">Calendar / Calendario</Link>
      <Link href="/calendar/aspire-south?view=family" aria-current={family ? "page" : undefined} data-testid="calendar-family-preview-link" className="inline-flex min-h-11 items-center font-semibold text-brand-700 underline">Family sharing / Compartir</Link>
    </nav>
    {family ? <CalendarFamilyPreview initialLanguage={query.lang === "es" ? "es" : "en"} /> : <AspireSouthCalendarPreview />}
  </>;
}
