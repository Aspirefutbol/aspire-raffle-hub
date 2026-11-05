"use client";

import { useMemo, useState } from "react";

type Language = "en" | "es";

const copy = {
  en: {
    badge: "Aspire South",
    title: "Sponsor a Day",
    subtitle: "Choose a day on the calendar to support this player's Aspire South season.",
    raised: "Raised",
    goal: "Goal",
    available: "Available",
    sponsored: "Sponsored",
    selected: "Selected",
    choose: "Choose one or more available days",
    hint: "The day number is the sponsorship amount. For example, Day 12 = $12.",
    total: "Selected total",
    continue: "Continue to sponsor",
    secure: "Secure preview",
    secureBody: "This is synthetic preview data only. No payment will be collected from this page.",
    language: "Español",
    player: "Player",
    team: "Team",
    day: "Day",
  },
  es: {
    badge: "Aspire South",
    title: "Patrocina un Día",
    subtitle: "Elige un día del calendario para apoyar la temporada de este jugador de Aspire South.",
    raised: "Recaudado",
    goal: "Meta",
    available: "Disponible",
    sponsored: "Patrocinado",
    selected: "Seleccionado",
    choose: "Elige uno o más días disponibles",
    hint: "El número del día es la cantidad del patrocinio. Por ejemplo, Día 12 = $12.",
    total: "Total seleccionado",
    continue: "Continuar para patrocinar",
    secure: "Vista previa segura",
    secureBody: "Estos son datos de prueba. No se cobrará ningún pago desde esta página.",
    language: "English",
    player: "Jugador",
    team: "Equipo",
    day: "Día",
  },
} as const;

const sponsoredDays = new Set([2, 5, 8, 11, 17, 23, 28]);

export function AspireSouthCalendarPreview() {
  const [language, setLanguage] = useState<Language>("en");
  const [selected, setSelected] = useState<number[]>([]);
  const t = copy[language];

  const total = useMemo(() => selected.reduce((sum, day) => sum + day, 0), [selected]);

  function toggleDay(day: number) {
    if (sponsoredDays.has(day)) return;
    setSelected((current) =>
      current.includes(day) ? current.filter((value) => value !== day) : [...current, day].sort((a, b) => a - b),
    );
  }

  return (
    <main className="min-h-screen bg-canvas">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:py-10">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-700">{t.badge}</p>
            <p className="mt-1 text-xs text-muted">Calendar Fundraiser · Recaudación de Calendario</p>
          </div>
          <button
            type="button"
            onClick={() => setLanguage(language === "en" ? "es" : "en")}
            className="min-h-11 rounded-control border border-line-strong bg-surface px-4 text-sm font-semibold text-ink shadow-card"
          >
            {t.language}
          </button>
        </header>

        <section className="mt-6 overflow-hidden rounded-[1rem] border border-line bg-surface shadow-card">
          <div className="border-b border-line bg-brand-900 px-5 py-6 text-white sm:px-8">
            <p className="text-sm font-semibold text-brand-200">{t.player}: Mateo R. · {t.team}: Aspire South 2012</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{t.title}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-brand-100 sm:text-base">{t.subtitle}</p>
          </div>

          <div className="grid gap-5 p-5 sm:grid-cols-[1fr_auto] sm:p-8">
            <div>
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t.raised}</p>
                  <p className="mt-1 text-2xl font-bold tabular text-ink">$184</p>
                </div>
                <p className="text-sm text-muted">{t.goal}: $500</p>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-line">
                <div className="h-full w-[37%] rounded-full bg-brand-600" />
              </div>
            </div>
            <div className="rounded-control border border-line bg-canvas px-4 py-3 text-sm text-ink-soft">
              <p className="font-semibold text-ink">{t.secure}</p>
              <p className="mt-1 max-w-xs text-xs leading-5">{t.secureBody}</p>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-[1rem] border border-line bg-surface p-5 shadow-card sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-ink">{t.choose}</h2>
              <p className="mt-1 text-sm text-muted">{t.hint}</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-line px-3 py-1.5 text-ink-soft">{t.available}</span>
              <span className="rounded-full bg-line px-3 py-1.5 text-muted">{t.sponsored}</span>
              <span className="rounded-full bg-brand-100 px-3 py-1.5 font-semibold text-brand-800">{t.selected}</span>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-4 gap-2 sm:grid-cols-7 sm:gap-3">
            {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => {
              const isSponsored = sponsoredDays.has(day);
              const isSelected = selected.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  disabled={isSponsored}
                  onClick={() => toggleDay(day)}
                  aria-pressed={isSelected}
                  className={[
                    "min-h-20 rounded-card border p-2 text-left transition sm:min-h-24",
                    isSponsored
                      ? "cursor-not-allowed border-line bg-canvas text-muted opacity-60"
                      : isSelected
                        ? "border-brand-400 bg-brand-50 text-brand-900 ring-2 ring-brand-200"
                        : "border-line bg-surface text-ink hover:border-brand-300 hover:bg-brand-50/40",
                  ].join(" ")}
                >
                  <span className="block text-xs font-medium">{isSponsored ? t.sponsored : isSelected ? t.selected : t.available}</span>
                  <span className="mt-2 block text-2xl font-bold tabular">{day}</span>
                  <span className="block text-xs">{"$" + day}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-6 flex flex-col gap-3 rounded-card border border-line bg-canvas p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t.total}</p>
              <p className="mt-1 text-2xl font-bold tabular text-ink">{"$" + total}</p>
              {selected.length > 0 && <p className="mt-1 text-xs text-muted">{selected.map((day) => t.day + " " + day).join(" · ")}</p>}
            </div>
            <button
              type="button"
              disabled={selected.length === 0}
              className="min-h-12 rounded-control bg-brand-600 px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t.continue}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
