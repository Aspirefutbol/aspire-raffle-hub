"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  allCalendarDays,
  calendarImpactQuote,
  type CalendarMultiplier,
} from "@/lib/calendar/pricing";
import {
  aspireSouthSyntheticPreview,
  completeSyntheticCalendar,
  syntheticCalendarProgress,
  syntheticCalendarMilestone,
} from "@/lib/calendar/synthetic-preview";

type Language = "en" | "es";
type Step = "calendar" | "supporter" | "review" | "complete";

const multiplierLabels = {
  en: { 1: "Support", 2: "Boost", 3: "Impact", 4: "Champion", 5: "Legacy" },
  es: { 1: "Apoyo", 2: "Impulso", 3: "Impacto", 4: "Campeón", 5: "Legado" },
} as const;

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
    daysFunded: "days sponsored",
    milestoneStart: "Every sponsored day moves this season forward.",
    milestoneFirst: "First milestone reached — the calendar is gaining momentum!",
    milestoneHalf: "Halfway there — thank you for building this together!",
    milestoneFinal: "Final stretch — the calendar is nearly complete!",
    calendarComplete: "Calendar Complete!",
    completionMessage: "All 31 days are sponsored. Thank you for showing up for this player!",
    impactBadge: "Extra Impact",
    scenario: "Synthetic preview scenario",
    scenarioPartial: "In progress",
    scenarioFull: "Complete calendar",
    scenarioHelp: "Fictional paid-day examples only. Switching views does not reserve days or process payments.",
    choose: "Choose your day",
    hint: "The day number is the base sponsorship amount. Day 12 = $12. A full 31-day calendar totals $496.",
    impactTitle: "Choose your impact",
    impactHelp: "1x is the standard sponsorship. You can optionally increase your impact while claiming the same day.",
    moreWays: "More ways to help",
    baseValue: "Base calendar value",
    addedImpact: "Additional impact",
    total: "Sponsorship total",
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
    paymentHelp: "This preview shows the future Stripe TEST checkout handoff. No days are reserved and no payment is collected.",
    reserve: "Preview secure checkout handoff",
    complete: "Preview complete",
    completeHelp: "This was a demonstration with synthetic Aspire South data. No reservation was placed and no payment was collected. The 1x-5x calculation keeps the calendar base separate from additional impact.",
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
    daysFunded: "días patrocinados",
    milestoneStart: "Cada día patrocinado impulsa esta temporada.",
    milestoneFirst: "¡Primera meta alcanzada! El calendario está tomando impulso.",
    milestoneHalf: "¡Llegamos a la mitad! Gracias por construir esto juntos.",
    milestoneFinal: "¡Última etapa! El calendario está casi completo.",
    calendarComplete: "¡Calendario completo!",
    completionMessage: "Los 31 días están patrocinados. ¡Gracias por apoyar a este jugador!",
    impactBadge: "Impacto extra",
    scenario: "Escenario de vista previa ficticia",
    scenarioPartial: "En progreso",
    scenarioFull: "Calendario completo",
    scenarioHelp: "Ejemplos ficticios de días pagados. Cambiar la vista no reserva días ni procesa pagos.",
    choose: "Elige tu día",
    hint: "El número del día es la cantidad base del patrocinio. Día 12 = $12. El calendario completo suma $496.",
    impactTitle: "Elige tu impacto",
    impactHelp: "1x es el patrocinio estándar. Puedes aumentar tu impacto y seguir patrocinando el mismo día.",
    moreWays: "Más formas de ayudar",
    baseValue: "Valor base del calendario",
    addedImpact: "Impacto adicional",
    total: "Total del patrocinio",
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
    paymentHelp: "Esta vista previa muestra el futuro paso al pago de Stripe en modo PRUEBA. No reserva días ni cobra ningún pago.",
    reserve: "Ver ejemplo del paso al pago seguro",
    complete: "Vista previa completa",
    completeHelp: "Esta fue una demostración con datos de prueba de Aspire South. No se reservaron días ni se cobró ningún pago. El cálculo de 1x a 5x separa el valor base y el impacto adicional.",
    secure: "Build seguro",
    secureBody: "Solo datos de prueba de Aspire South. Esta vista previa no utiliza datos reales de donantes ni credenciales de pago.",
    required: "Completa tu nombre y correo electrónico antes de continuar.",
    day: "Día",
  },
} as const;

const preview = aspireSouthSyntheticPreview;
const completePreviewDays = completeSyntheticCalendar(preview.paidDays);

export function AspireSouthCalendarPreview() {
  const [language, setLanguage] = useState<Language>("en");
  const [scenario, setScenario] = useState<"partial" | "complete">("partial");
  const [step, setStep] = useState<Step>("calendar");
  const [selected, setSelected] = useState<number[]>([]);
  const [multiplier, setMultiplier] = useState<CalendarMultiplier>(1);
  const [supporter, setSupporter] = useState({ name: "", email: "", phone: "" });
  const [error, setError] = useState("");
  const t = copy[language];
  const progress = useMemo(
    () => syntheticCalendarProgress(
      scenario === "complete" ? completePreviewDays : preview.paidDays,
      preview.goalCents,
    ),
    [scenario],
  );
  const sponsoredDays = progress.sponsoredDays;
  const quote = useMemo(() => calendarImpactQuote(selected, multiplier), [selected, multiplier]);
  const milestone = {
    start: t.milestoneStart,
    first: t.milestoneFirst,
    half: t.milestoneHalf,
    final: t.milestoneFinal,
    complete: t.completionMessage,
  }[syntheticCalendarMilestone(progress.sponsoredCount)];

  function showScenario(next: "partial" | "complete") {
    setScenario(next);
    // The preview is never a checkout or payment system. Reset unsent fields
    // when changing fictional paid-day examples, so no stale selection is shown.
    setSelected([]);
    setMultiplier(1);
    setSupporter({ name: "", email: "", phone: "" });
    setError("");
    setStep("calendar");
  }

  function money(cents: number) {
    return "$" + (cents / 100).toFixed(0);
  }

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

  function multiplierButton(value: CalendarMultiplier) {
    const active = multiplier === value;
    return (
      <button
        key={value}
        type="button"
        onClick={() => setMultiplier(value)}
        aria-pressed={active}
        className={[
          "min-h-16 rounded-card border p-3 text-left transition",
          active
            ? "border-brand-400 bg-brand-50 text-brand-900 ring-2 ring-brand-200"
            : "border-line bg-surface text-ink hover:border-brand-300",
        ].join(" ")}
      >
        <span className="block text-sm font-bold">{value}x · {multiplierLabels[language][value]}</span>
        <span className="mt-1 block text-xs text-muted">{money(quote.baseCents * value)}</span>
      </button>
    );
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
            <p className="text-sm font-semibold text-brand-200">{t.player}: {preview.participant.displayName} · {t.team}: {preview.participant.teamName}</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{t.title}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-brand-100 sm:text-base">{t.subtitle}</p>
          </div>
          <div className="grid gap-5 p-5 sm:grid-cols-[1fr_auto] sm:p-8">
            <div>
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t.raised}</p>
                  <p className="mt-1 text-2xl font-bold tabular text-ink">{money(progress.raisedCents)}</p>
                </div>
                <p className="text-sm text-muted">{t.goal}: {money(preview.goalCents)}</p>
              </div>
              <div
                className="mt-3 h-2 overflow-hidden rounded-full bg-line"
                role="progressbar"
                aria-label={t.raised}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress.percentOfGoal)}
              >
                <div className="h-full rounded-full bg-brand-600" style={{ width: `${progress.percentOfGoal}%` }} />
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <p data-testid="sponsored-day-progress" className="text-sm font-semibold text-ink">
                  {progress.sponsoredCount} / 31 {t.daysFunded}
                </p>
                <p className="text-xs text-muted">{Math.round(progress.dayCompletionPercent)}%</p>
              </div>
              <div
                className="mt-2 h-2 overflow-hidden rounded-full bg-line"
                role="progressbar"
                aria-label={t.daysFunded}
                aria-valuemin={0}
                aria-valuemax={31}
                aria-valuenow={progress.sponsoredCount}
              >
                <div className="h-full rounded-full bg-emerald-600 transition-[width]" style={{ width: `${progress.dayCompletionPercent}%` }} />
              </div>
              {progress.isComplete ? (
                <div data-testid="calendar-complete" role="status" className="mt-4 rounded-card border border-emerald-300 bg-emerald-50 px-4 py-3 text-emerald-950">
                  <p className="font-bold">✓ {t.calendarComplete}</p>
                  <p className="mt-1 text-sm">{t.completionMessage}</p>
                </div>
              ) : (
                <p data-testid="calendar-milestone" className="mt-3 text-sm text-ink-soft">{milestone}</p>
              )}
            </div>
            <div className="rounded-control border border-line bg-canvas px-4 py-3 text-sm text-ink-soft">
              <p className="font-semibold text-ink">{t.secure}</p>
              <p className="mt-1 max-w-xs text-xs leading-5">{t.secureBody}</p>
              <div className="mt-3 border-t border-line pt-3">
                <p className="text-xs font-semibold text-ink">{t.scenario}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" data-testid="scenario-partial" aria-pressed={scenario === "partial"}
                    onClick={() => showScenario("partial")}
                    className={`min-h-11 rounded-control border px-3 text-xs font-semibold ${scenario === "partial" ? "border-brand-500 bg-brand-50 text-brand-900" : "border-line bg-surface text-ink"}`}>
                    {t.scenarioPartial}
                  </button>
                  <button type="button" data-testid="scenario-complete" aria-pressed={scenario === "complete"}
                    onClick={() => showScenario("complete")}
                    className={`min-h-11 rounded-control border px-3 text-xs font-semibold ${scenario === "complete" ? "border-brand-500 bg-brand-50 text-brand-900" : "border-line bg-surface text-ink"}`}>
                    {t.scenarioFull}
                  </button>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted">{t.scenarioHelp}</p>
              </div>
            </div>
          </div>
        </section>

        {step === "calendar" && (
          <section className="mt-6 rounded-[1rem] border border-line bg-surface p-5 shadow-card sm:p-8">
            <h2 className="text-xl font-bold text-ink">{t.choose}</h2>
            <p className="mt-1 text-sm text-muted">{t.hint}</p>

            <div className="mt-6 grid grid-cols-3 gap-2 min-[360px]:grid-cols-4 sm:grid-cols-7 sm:gap-3">
              {allCalendarDays().map((day) => {
                const isSponsored = sponsoredDays.has(day);
                const paidMultiplier = progress.paidMultiplierByDay.get(day);
                const impactLabel = isSponsored && paidMultiplier && paidMultiplier > 1
                  ? paidMultiplier >= 4
                    ? `${paidMultiplier}× · ${multiplierLabels[language][paidMultiplier]}`
                    : `${paidMultiplier}× · ${t.impactBadge}`
                  : null;
                const isSelected = selected.includes(day);
                return (
                  <button
                    key={day}
                    data-testid={`calendar-day-${day}`}
                    aria-label={`${t.day} ${day}, ${day}, ${isSponsored ? t.sponsored : isSelected ? t.selected : t.available}${impactLabel ? `, ${impactLabel}` : ""}`}
                    type="button"
                    disabled={isSponsored}
                    onClick={() => toggleDay(day)}
                    aria-pressed={isSelected}
                    className={[
                      "min-h-20 rounded-card border p-2 text-left transition sm:min-h-24",
                      isSponsored
                        ? "cursor-not-allowed border-emerald-300 bg-emerald-50 text-emerald-950"
                        : isSelected
                          ? "border-brand-400 bg-brand-50 text-brand-900 ring-2 ring-brand-200"
                          : "border-line bg-surface text-ink hover:border-brand-300 hover:bg-brand-50/40",
                    ].join(" ")}
                  >
                    <span className="block break-words text-[10px] font-semibold leading-4 sm:text-xs">
                      {isSponsored && <span aria-hidden="true">✓ </span>}
                      {isSponsored ? t.sponsored : isSelected ? t.selected : t.available}
                    </span>
                    <span className="mt-2 block text-2xl font-bold tabular">{day}</span>
                    <span className="block text-xs">{"$" + day}</span>
                    {impactLabel && (
                      <span data-testid={`day-impact-${day}`} className="mt-1 block break-words rounded border border-amber-300 bg-amber-50 px-1 py-0.5 text-[10px] font-bold leading-3 text-amber-950">
                        {impactLabel}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {selected.length > 0 && (
              <div className="mt-6 rounded-card border border-line bg-canvas p-4">
                <h3 className="text-base font-bold text-ink">{t.impactTitle}</h3>
                <p className="mt-1 text-sm text-muted">{t.impactHelp}</p>

                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  {([1, 2, 3] as CalendarMultiplier[]).map(multiplierButton)}
                </div>

                <details className="mt-3 rounded-control border border-line bg-surface px-3">
                  <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-ink">{t.moreWays}</summary>
                  <div className="grid gap-2 pb-3 sm:grid-cols-2">
                    {([4, 5] as CalendarMultiplier[]).map(multiplierButton)}
                  </div>
                </details>

                <div className="mt-4 grid gap-3 rounded-control border border-line bg-surface p-4 sm:grid-cols-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t.baseValue}</p>
                    <p className="mt-1 text-lg font-bold tabular text-ink">{money(quote.baseCents)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t.addedImpact}</p>
                    <p className="mt-1 text-lg font-bold tabular text-ink">{money(quote.additionalImpactCents)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t.total}</p>
                    <p className="mt-1 text-2xl font-bold tabular text-brand-800">{money(quote.totalCents)}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
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
                <input value={supporter.name} onChange={(event) => setSupporter((current) => ({ ...current, name: event.target.value }))} className="mt-1 min-h-11 w-full rounded-control border border-line-strong bg-surface px-3" autoComplete="name" maxLength={200} required />
              </label>
              <label className="block text-sm font-medium text-ink">
                {t.email}
                <input type="email" value={supporter.email} onChange={(event) => setSupporter((current) => ({ ...current, email: event.target.value }))} className="mt-1 min-h-11 w-full rounded-control border border-line-strong bg-surface px-3" autoComplete="email" maxLength={254} required />
              </label>
              <label className="block text-sm font-medium text-ink">
                {t.phone}
                <input type="tel" value={supporter.phone} onChange={(event) => setSupporter((current) => ({ ...current, phone: event.target.value }))} className="mt-1 min-h-11 w-full rounded-control border border-line-strong bg-surface px-3" autoComplete="tel" maxLength={50} />
              </label>

              {error && <p role="alert" className="rounded-control border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                <button type="button" onClick={() => setStep("calendar")} className="min-h-11 rounded-control border border-line-strong px-4 text-sm font-semibold">{t.back}</button>
                <button type="submit" className="min-h-12 rounded-control bg-brand-600 px-5 text-sm font-semibold text-white">{t.continue}</button>
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
                <p className="mt-3 text-sm font-semibold text-brand-800">{multiplier}x · {multiplierLabels[language][multiplier]}</p>
              </div>
              <div className="rounded-card border border-line bg-canvas p-4">
                <p className="font-semibold text-ink">{supporter.name}</p>
                <p className="mt-1 break-all text-sm text-muted">{supporter.email}</p>
                {supporter.phone && <p className="mt-1 text-sm text-muted">{supporter.phone}</p>}
              </div>
            </div>

            <dl className="mt-4 grid gap-3 rounded-card border border-line bg-surface p-4 sm:grid-cols-3">
              <div><dt className="text-xs text-muted">{t.baseValue}</dt><dd className="mt-1 font-bold">{money(quote.baseCents)}</dd></div>
              <div><dt className="text-xs text-muted">{t.addedImpact}</dt><dd className="mt-1 font-bold">{money(quote.additionalImpactCents)}</dd></div>
              <div><dt className="text-xs text-muted">{t.total}</dt><dd className="mt-1 text-xl font-bold text-brand-800">{money(quote.totalCents)}</dd></div>
            </dl>

            <div className="mt-5 rounded-card border border-brand-100 bg-brand-50/60 p-4">
              <p className="font-semibold text-brand-900">{t.payment}</p>
              <p className="mt-1 text-sm text-brand-900">{t.paymentHelp}</p>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
              <button type="button" onClick={() => setStep("supporter")} className="min-h-11 rounded-control border border-line-strong px-4 text-sm font-semibold">{t.back}</button>
              <button type="button" onClick={() => setStep("complete")} className="min-h-12 rounded-control bg-brand-600 px-5 text-sm font-semibold text-white">{t.reserve}</button>
            </div>
          </section>
        )}

        {step === "complete" && (
          <section className="mt-6 rounded-[1rem] border border-emerald-200 bg-emerald-50 p-5 shadow-card sm:p-8">
            <h2 className="text-2xl font-bold text-emerald-950">{t.complete}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-emerald-950">{t.completeHelp}</p>
            <button type="button" onClick={() => setStep("review")} className="mt-5 min-h-11 rounded-control border border-emerald-300 bg-white px-4 text-sm font-semibold text-emerald-950">{t.back}</button>
          </section>
        )}
      </div>
    </main>
  );
}
