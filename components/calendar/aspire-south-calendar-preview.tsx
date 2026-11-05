"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  allCalendarDays,
  calendarSelectionTotalCents,
} from "@/lib/calendar/pricing";

type Language = "en" | "es";
type Step = "calendar" | "supporter" | "review" | "complete";

const copy = {
  en: {
    brand: "Aspire South",
    kicker: "Calendar Fundraiser",
    title: "Sponsor a Day",
    subtitle: "Choose one or more available days to support this player's Aspire South season.",
    raised: "Raised",
    goal: "Goal",
    available: "Available",
    sponsored: "Sponsored",
    selected: "Selected",
    choose: "Choose your day",
    hint: "The day number is the sponsorship amount. Day 12 = $12. A full 31-day calendar totals $496.",
    total: "Selected total",
    continue: "Continue",
    back: "Back",
    language: "Español",
    player: "Player",
    team: "Team",
    supporter: "Your information",
    supporterHelp: "We use this only for your sponsorship confirmation and receipt.",
    name: "Your name",
    email: "Email",
    phone: "Phone",
    review: "Review sponsorship",
    days: "Days selected",
    payment: "Payment",
    paymentHelp: "Secure Stripe checkout will open after the reservation is created.",
    reserve: "Reserve days & continue to secure checkout",
    complete: "Preview complete",
    completeHelp: "The original AFC flow is now represented through calendar selection, supporter details, reservation review, and secure-checkout handoff. This branch still uses synthetic data and does not collect payment.",
    secure: "Secure build",
    secureBody: "Synthetic Aspire South data only. No live donor data or payment credentials are used on this preview route.",
    required: "Please complete your name and email before continuing.",
    day: "Day",
  },
  es: {
    brand: "Aspire South",
    kicker: "Recaudación de Calendario",
    title: "Patrocina un Día",
    subtitle: "Elige uno o más días disponibles para apoyar la temporada de este jugador de Aspire South.",
    raised: "Recaudado",
    goal: "Meta",
    available: "Disponible",
    sponsored: "Patrocinado",
    selected: "Seleccionado",
    choose: "Elige tu día",
    hint: "El número del día es la cantidad del patrocinio. Día 12 = $12. El calendario completo de 31 días suma $496.",
    total: "Total seleccionado",
    continue: "Continuar",
    back: "Atrás",
    language: "English",
    player: "Jugador",
    team: "Equipo",
    supporter: "Tu información",
    supporterHelp: "La usamos solamente para la confirmación y el recibo de tu patrocinio.",
    name: "Tu nombre",
    email: "Correo electrónico",
    phone: "Teléfono",
    review: "Revisar patrocinio",
    days: "Días seleccionados",
    payment: "Pago",
    paymentHelp: "El pago seguro con Stripe se abrirá después de crear la reservación.",
    reserve: "Reservar días y continuar al pago seguro",
    complete: "Vista previa completa",
    completeHelp: "El flujo original de AFC ahora está representado con selección del calendario, datos del patrocinador, revisión de la reservación y entrega al pago seguro. Esta rama todavía usa datos de prueba y no cobra pagos.",
    secure: "Build seguro",
    secureBody: "Solo datos de prueba de Aspire South. Esta vista previa no utiliza datos reales de donantes ni credenciales de pago.",
    required: "Completa tu nombre y correo electrónico antes de continuar.",
    day: "Día",
  },
} as const;

const sponsoredDays = new Set([2, 5, 8, 11, 17, 23, 28]);

export function AspireSouthCalendarPreview() {
  const [language, setLanguage] = useState<Language>("en");
  const [step, setStep] = useState<Step>("calendar");
  const [selected, setSelected] = useState<number[]>([]);
  const [supporter, setSupporter] = useState({ name: "", email: "", phone: "" });
  const [error, setError] = useState("");
  const t = copy[language];

  const totalCents = useMemo(() => calendarSelectionTotalCents(selected), [selected]);
  const total = (totalCents / 100).toFixed(0);

  function toggleDay(day: number) {
    if (sponsoredDays.has(day)) return;
    setSelected((current) =>
      current.includes(day)
        ? current.filter((value) => value !== day)
        : [...current, day].sort((a, b) => a - b),
    );
  }

  function submitSupporter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!supporter.name.trim() || !supporter.email.trim()) {
      setError(t.required);
      return;
    }
    setStep("review");
  }

  return (
    <main className="min-h-screen bg-canvas">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:py-10">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-700">{t.brand}</p>
            <p className="mt-1 text-xs text-muted">{t.kicker}</p>
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

        {step === "calendar" && (
          <section className="mt-6 rounded-[1rem] border border-line bg-surface p-5 shadow-card sm:p-8">
            <div>
              <h2 className="text-xl font-bold text-ink">{t.choose}</h2>
              <p className="mt-1 text-sm text-muted">{t.hint}</p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-line px-3 py-1.5 text-ink-soft">{t.available}</span>
              <span className="rounded-full bg-line px-3 py-1.5 text-muted">{t.sponsored}</span>
              <span className="rounded-full bg-brand-100 px-3 py-1.5 font-semibold text-brand-800">{t.selected}</span>
            </div>

            <div className="mt-6 grid grid-cols-4 gap-2 sm:grid-cols-7 sm:gap-3">
              {allCalendarDays().map((day) => {
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
                    <span className="block text-xs font-medium">
                      {isSponsored ? t.sponsored : isSelected ? t.selected : t.available}
                    </span>
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
                {selected.length > 0 && (
                  <p className="mt-1 text-xs text-muted">
                    {selected.map((day) => t.day + " " + day).join(" · ")}
                  </p>
                )}
              </div>
              <button
                type="button"
                disabled={selected.length === 0}
                onClick={() => setStep("supporter")}
                className="min-h-12 rounded-control bg-brand-600 px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t.continue}
              </button>
            </div>
          </section>
        )}

        {step === "supporter" && (
          <section className="mt-6 rounded-[1rem] border border-line bg-surface p-5 shadow-card sm:p-8">
            <h2 className="text-xl font-bold text-ink">{t.supporter}</h2>
            <p className="mt-1 text-sm text-muted">{t.supporterHelp}</p>

            <form className="mt-6 space-y-4" onSubmit={submitSupporter}>
              <label className="block text-sm font-medium text-ink">
                {t.name}
                <input
                  value={supporter.name}
                  onChange={(event) => setSupporter((current) => ({ ...current, name: event.target.value }))}
                  className="mt-1 min-h-11 w-full rounded-control border border-line-strong bg-surface px-3"
                  autoComplete="name"
                  maxLength={200}
                  required
                />
              </label>
              <label className="block text-sm font-medium text-ink">
                {t.email}
                <input
                  type="email"
                  value={supporter.email}
                  onChange={(event) => setSupporter((current) => ({ ...current, email: event.target.value }))}
                  className="mt-1 min-h-11 w-full rounded-control border border-line-strong bg-surface px-3"
                  autoComplete="email"
                  maxLength={254}
                  required
                />
              </label>
              <label className="block text-sm font-medium text-ink">
                {t.phone}
                <input
                  type="tel"
                  value={supporter.phone}
                  onChange={(event) => setSupporter((current) => ({ ...current, phone: event.target.value }))}
                  className="mt-1 min-h-11 w-full rounded-control border border-line-strong bg-surface px-3"
                  autoComplete="tel"
                  maxLength={50}
                />
              </label>

              {error && <p role="alert" className="rounded-control border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                <button type="button" onClick={() => setStep("calendar")} className="min-h-11 rounded-control border border-line-strong px-4 text-sm font-semibold">
                  {t.back}
                </button>
                <button type="submit" className="min-h-12 rounded-control bg-brand-600 px-5 text-sm font-semibold text-white">
                  {t.continue}
                </button>
              </div>
            </form>
          </section>
        )}

        {step === "review" && (
          <section className="mt-6 rounded-[1rem] border border-line bg-surface p-5 shadow-card sm:p-8">
            <h2 className="text-xl font-bold text-ink">{t.review}</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-card border border-line bg-canvas p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t.days}</p>
                <p className="mt-2 font-semibold text-ink">{selected.map((day) => t.day + " " + day).join(" · ")}</p>
                <p className="mt-3 text-3xl font-bold tabular text-ink">{"$" + total}</p>
              </div>
              <div className="rounded-card border border-line bg-canvas p-4">
                <p className="font-semibold text-ink">{supporter.name}</p>
                <p className="mt-1 break-all text-sm text-muted">{supporter.email}</p>
                {supporter.phone && <p className="mt-1 text-sm text-muted">{supporter.phone}</p>}
              </div>
            </div>

            <div className="mt-5 rounded-card border border-brand-100 bg-brand-50/60 p-4">
              <p className="font-semibold text-brand-900">{t.payment}</p>
              <p className="mt-1 text-sm text-brand-900">{t.paymentHelp}</p>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
              <button type="button" onClick={() => setStep("supporter")} className="min-h-11 rounded-control border border-line-strong px-4 text-sm font-semibold">
                {t.back}
              </button>
              <button type="button" onClick={() => setStep("complete")} className="min-h-12 rounded-control bg-brand-600 px-5 text-sm font-semibold text-white">
                {t.reserve}
              </button>
            </div>
          </section>
        )}

        {step === "complete" && (
          <section className="mt-6 rounded-[1rem] border border-emerald-200 bg-emerald-50 p-5 shadow-card sm:p-8">
            <h2 className="text-2xl font-bold text-emerald-950">{t.complete}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-emerald-950">{t.completeHelp}</p>
            <button type="button" onClick={() => setStep("review")} className="mt-5 min-h-11 rounded-control border border-emerald-300 bg-white px-4 text-sm font-semibold text-emerald-950">
              {t.back}
            </button>
          </section>
        )}
      </div>
    </main>
  );
}
