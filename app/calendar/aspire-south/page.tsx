import type { Metadata } from "next";
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
  return family
    ? <CalendarFamilyPreview initialLanguage={query.lang === "es" ? "es" : "en"} />
    : <AspireSouthCalendarPreview initialLanguage={query.lang === "es" ? "es" : "en"} />;
}
