import type { Metadata } from "next";
import { AspireSouthCalendarPreview } from "@/components/calendar/aspire-south-calendar-preview";

export const metadata: Metadata = {
  title: "Aspire South Calendar Fundraiser Preview",
  robots: { index: false, follow: false },
};

export default function AspireSouthCalendarPage() {
  return <AspireSouthCalendarPreview />;
}
