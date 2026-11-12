"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  allCalendarDays,
  calendarImpactQuote,
  type CalendarMultiplier,
} from "@/lib/calendar/pricing";
import {
  aspireSouthSyntheticPreview,
  syntheticCalendarAtCount,
  syntheticCalendarProgress,
  syntheticCalendarMilestone,
  syntheticCalendarNextMilestone,
} from "@/lib/calendar/synthetic-preview";

type Language = "en" | "es";
type Step = "calendar" | "supporter" | "review" | "complete";
type PreviewScenario = "partial" | "first" | "half" | "final" | "complete";
const previewCounts = { first: 8, half: 16, final: 24, complete: 31 } as const;

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
    nextMilestone: (remaining: number, target: number) =>
      `Next milestone: ${target} sponsored days · ${remaining} ${remaining === 1 ? "day" : "days"} to go`,
    allDaysSponsored: "Every day has a sponsor. Thank you for completing this calendar!",
    syntheticContactHelp: "Demo only: use fictional contact details. Nothing is saved or sent.",
    milestoneFirst: "First milestone reached — the calendar is gaining momentum!",
    milestoneHalf: "Halfway there — thank you for building this together!",
    milestoneFinal: "Final stretch — the calendar is nearly complete!",
    calendarComplete: "Calendar Complete!",
    completionMessage: "All 31 days are sponsored. Thank you for showing up for this player!",
    impactBadge: "Extra Impact",
    scenario: "Synthetic preview scenario",
    scenarioPartial: "In progress",
    scenarioFirst: "8 days",
    scenarioHalf: "16 days",
    scenarioFinal: "24 days",
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
    supporterHelp: "Use fictional details to preview a future confirmation. No receipt will be issued.",
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
    demoBadge: "Demo · fictional player · no payments",
    priceRange: "$1–$31 per day",
    tapHint: "Tap a day to start",
    selectionSummary: (count: number) => `${count} ${count === 1 ? "day" : "days"}`,
    changeImpact: "Change impact",
    progressDetails: "Season progress",
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
    nextMilestone: (remaining: number, target: number) =>
      `Siguiente meta: ${target} días patrocinados · faltan ${remaining} ${remaining === 1 ? "día" : "días"}`,
    allDaysSponsored: "Todos los días tienen patrocinador. ¡Gracias por completar este calendario!",
    syntheticContactHelp: "Solo demostración: usa datos de contacto ficticios. No se guarda ni se envía nada.",
    milestoneFirst: "¡Primera meta alcanzada! El calendario está tomando impulso.",
    milestoneHalf: "¡Llegamos a la mitad! Gracias por construir esto juntos.",
    milestoneFinal: "¡Última etapa! El calendario está casi completo.",
    calendarComplete: "¡Calendario completo!",
    completionMessage: "Los 31 días están patrocinados. ¡Gracias por apoyar a este jugador!",
    impactBadge: "Impacto extra",
    scenario: "Escenario de vista previa ficticia",
    scenarioPartial: "En progreso",
    scenarioFirst: "8 días",
    scenarioHalf: "16 días",
    scenarioFinal: "24 días",
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
    supporterHelp: "Usa datos ficticios para ver una confirmación de ejemplo. No se emitirá ningún recibo.",
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
    demoBadge: "Demostración · jugador ficticio · sin pagos",
    priceRange: "$1–$31 por día",
    tapHint: "Toca un día para empezar",
    selectionSummary: (count: number) => `${count} ${count === 1 ? "día" : "días"}`,
    changeImpact: "Cambiar impacto",
    progressDetails: "Progreso de la temporada",
  },
} as const;

const preview = aspireSouthSyntheticPreview;

export function AspireSouthCalendarPreview({ initialLanguage = "en" }: { initialLanguage?: Language }) {
  const [language, setLanguage] = useState<Language>(initialLanguage);
  const [scenario, setScenario] = useState<PreviewScenario>("partial");
  const [step, setStep] = useState<Step>("calendar");
  const [selected, setSelected] = useState<number[]>([]);
  const [multiplier, setMultiplier] = useState<CalendarMultiplier>(1);
  const [supporter, setSupporter] = useState({ name: "", email: "", phone: "" });
  const [error, setError] = useState("");
  const t = copy[language];
  const progress = useMemo(() => {
    const fictionalPaidDays = scenario === "partial"
      ? preview.paidDays
      : syntheticCalendarAtCount(preview.paidDays, previewCounts[scenario]);
    return syntheticCalendarProgress(fictionalPaidDays, preview.goalCents);
  }, [scenario]);
  const scenarioLabels = {
    partial: t.scenarioPartial,
    first: t.scenarioFirst,
    half: t.scenarioHalf,
    final: t.scenarioFinal,
    complete: t.scenarioFull,
  };
  const sponsoredDays = progress.sponsoredDays;
  const nextMilestone = syntheticCalendarNextMilestone(progress.sponsoredCount);
  const quote = useMemo(() => calendarImpactQuote(selected, multiplier), [selected, multiplier]);
  const milestone = {
    start: t.milestoneStart,
    first: t.milestoneFirst,
    half: t.milestoneHalf,
    final: t.milestoneFinal,
    complete: t.completionMessage,
  }[syntheticCalendarMilestone(progress.sponsoredCount)];

  function showScenario(next: PreviewScenario) {
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

  function showImpactChoices() {
    // Instant scroll respects reduced-motion preferences; focus moves to the choices.
    const target = document.getElementById("calendar-impact");
    target?.scrollIntoView({ block: "center" });
    target?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  }

  return (
    <main lang={language} className="min-h-screen bg-canvas">
      <div className="mx-auto max-w-4xl px-3 pb-6 pt-2 sm:px-4 sm:pt-3 sm:[@media(max-height:380px)]:grid sm:[@media(max-height:380px)]:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] sm:[@media(max-height:380px)]:items-start sm:[@media(max-height:380px)]:gap-x-2">
        <nav aria-label="Preview views / Vistas de demostración" className="mb-1 flex h-11 items-center gap-2 text-sm sm:[@media(max-height:380px)]:col-span-2">
          <Link href={`/calendar/aspire-south${language === "es" ? "?lang=es" : ""}`} aria-current="page" className="inline-flex min-h-11 items-center rounded-control bg-brand-50 px-3 font-semibold text-brand-800 underline">{language === "es" ? "Calendario" : "Calendar"}</Link>
          <Link href={`/calendar/aspire-south?view=family${language === "es" ? "&lang=es" : ""}`} data-testid="calendar-family-preview-link" className="inline-flex min-h-11 items-center rounded-control px-3 font-semibold text-brand-700 underline">{language === "es" ? "Compartir" : "Family sharing"}</Link>
        </nav>
        {/* Compact identity + progress: everything a parent or donor needs above the calendar. */}
        <section data-testid="calendar-summary" className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[1rem] border border-line bg-surface px-3 py-2.5 shadow-card sm:flex-nowrap sm:gap-4 sm:p-4 sm:[@media(max-height:380px)]:flex sm:[@media(max-height:380px)]:flex-col sm:[@media(max-height:380px)]:items-stretch sm:[@media(max-height:380px)]:gap-1 sm:[@media(max-height:380px)]:p-2 sm:[@media(max-height:380px)]:col-start-1 sm:[@media(max-height:380px)]:min-w-0">
          <div className="order-1 min-w-0 flex-1 sm:[@media(max-height:380px)]:flex-none">
            <p data-testid="calendar-identity" className="break-words text-xs font-semibold leading-4 text-brand-700">
              {t.player}: {preview.participant.displayName} · {t.team}: {preview.participant.teamName}
            </p>
            <h1 className="mt-0.5 text-xl font-bold leading-tight tracking-tight text-ink lg:text-2xl">{t.title}</h1>
          </div>
          <button
            type="button"
            onClick={() => setLanguage(language === "en" ? "es" : "en")}
            className="order-2 min-h-11 shrink-0 rounded-control border border-line-strong bg-surface px-3 text-sm font-semibold text-ink sm:order-4 sm:[@media(max-height:380px)]:order-4 sm:[@media(max-height:380px)]:w-full"
          >
            {t.language}
          </button>
          <details data-testid="calendar-demo-badge" className="order-3 basis-full rounded-control border border-amber-300 bg-amber-50 px-3 text-amber-950 sm:basis-auto sm:max-w-[13rem] sm:[@media(max-height:380px)]:order-3 sm:[@media(max-height:380px)]:max-w-none sm:[@media(max-height:380px)]:basis-auto">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-xs font-semibold">
              <span aria-hidden="true">ⓘ</span>{t.demoBadge}
            </summary>
            <div className="pb-3 text-xs leading-5">
              <p className="font-semibold">{t.secure}</p>
              <p className="mt-1">{t.secureBody}</p>
            </div>
          </details>
          <div data-testid="calendar-progress" className="order-4 basis-full sm:order-2 sm:basis-56 sm:shrink-0 sm:[@media(max-height:380px)]:order-2 sm:[@media(max-height:380px)]:w-full sm:[@media(max-height:380px)]:basis-auto">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <p className="text-xs text-ink min-[360px]:text-sm">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">{t.raised}</span>{" "}
                <strong className="tabular">{money(progress.raisedCents)}</strong>{" "}
                <span className="text-xs text-muted"><span className="sr-only">{t.goal} </span>/ {money(preview.goalCents)}</span>
              </p>
              <p data-testid="sponsored-day-progress" className="text-xs font-semibold text-ink min-[360px]:text-sm">
                {progress.sponsoredCount} / 31 {t.daysFunded}
              </p>
            </div>
            <div className="mt-1.5 grid gap-1">
              <div
                className="h-1.5 overflow-hidden rounded-full bg-line"
                role="progressbar"
                aria-label={t.raised}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress.percentOfGoal)}
                aria-valuetext={`${money(progress.raisedCents)} / ${money(preview.goalCents)}`}
              >
                <div className="h-full rounded-full bg-brand-600" style={{ width: `${progress.percentOfGoal}%` }} />
              </div>
              <div
                className="h-1.5 overflow-hidden rounded-full bg-line"
                role="progressbar"
                aria-label={t.daysFunded}
                aria-valuemin={0}
                aria-valuemax={31}
                aria-valuenow={progress.sponsoredCount}
                aria-valuetext={`${progress.sponsoredCount} / 31 ${t.daysFunded}`}
              >
                <div className="h-full rounded-full bg-emerald-600" style={{ width: `${progress.dayCompletionPercent}%` }} />
              </div>
            </div>
          </div>
        </section>

        {step === "calendar" && (
          <section aria-labelledby="calendar-choose-heading" className="mt-1.5 rounded-[1rem] border border-line bg-surface px-3 pb-3 pt-2.5 shadow-card sm:mt-2 sm:p-4 sm:[@media(max-height:380px)]:col-start-2 sm:[@media(max-height:380px)]:row-start-2 sm:[@media(max-height:380px)]:mt-0 sm:[@media(max-height:380px)]:min-w-0 sm:[@media(max-height:380px)]:p-2">
            {progress.isComplete && (
              <p data-testid="calendar-complete-alert" role="status" className="mb-2 rounded-control bg-emerald-50 px-2 py-1.5 text-sm font-bold text-emerald-950">✓ {t.calendarComplete}</p>
            )}
            <div className="flex items-baseline justify-between gap-2">
              <h2 id="calendar-choose-heading" className="text-sm font-bold text-ink sm:text-base">{t.choose}</h2>
              <p className="text-xs text-muted">{t.priceRange}</p>
            </div>

            <div data-testid="calendar-day-grid" className="mt-1.5 grid grid-cols-5 gap-1 min-[360px]:grid-cols-6 min-[390px]:grid-cols-7 sm:mt-2 sm:gap-2">
              {allCalendarDays().map((day) => {
                const isSponsored = sponsoredDays.has(day);
                const paidMultiplier = progress.paidMultiplierByDay.get(day);
                const impactName = isSponsored && paidMultiplier && paidMultiplier > 1
                  ? paidMultiplier >= 4 ? multiplierLabels[language][paidMultiplier] : t.impactBadge
                  : null;
                const impactLabel = impactName ? `${paidMultiplier}× · ${impactName}` : null;
                const isSelected = selected.includes(day);
                return (
                  <button
                    key={day}
                    data-testid={`calendar-day-${day}`}
                    aria-label={`${t.day} ${day}, ${money(day * 100)}, ${isSponsored ? t.sponsored : isSelected ? t.selected : t.available}${impactLabel ? `, ${impactLabel}` : ""}`}
                    type="button"
                    disabled={isSponsored}
                    onClick={() => toggleDay(day)}
                    aria-pressed={isSelected}
                    className={[
                      "relative flex h-11 min-w-0 scroll-mb-16 flex-col items-center justify-center rounded-card border text-center transition sm:h-12 lg:h-16",
                      isSponsored
                        ? "cursor-not-allowed border-emerald-300 bg-emerald-50 text-emerald-950"
                        : isSelected
                          ? "border-2 border-brand-700 bg-brand-700 text-white"
                          : "border-line bg-surface text-ink hover:border-brand-300 hover:bg-brand-50/40",
                    ].join(" ")}
                  >
                    {isSponsored && <span aria-hidden="true" className="absolute left-1 top-0.5 text-[10px] font-bold leading-3">✓</span>}
                    <span className="text-base font-bold leading-5 tabular sm:text-lg lg:text-xl">{day}</span>
                    <span className="flex max-w-full items-center justify-center gap-0.5 text-[11px] leading-3">
                      <span>{"$" + day}</span>
                      {isSelected && <span aria-hidden="true" className="font-bold">✓</span>}
                      {impactLabel && (
                        <span data-testid={`day-impact-${day}`} className="rounded border border-amber-300 bg-amber-50 px-0.5 text-[9px] font-bold text-amber-950">
                          {paidMultiplier}×<span className="sr-only"> · {impactName}</span>
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>

            {progress.isComplete && (
              <p data-testid="calendar-sold-out" role="status" className="mt-3 rounded-card border border-emerald-300 bg-emerald-50 p-3 text-sm font-semibold text-emerald-950">
                {t.allDaysSponsored}
              </p>
            )}
            <p className="mt-2 text-xs text-muted">{t.hint}</p>

            {selected.length > 0 && (
              <div id="calendar-impact" className="mt-3 rounded-card border border-line bg-canvas p-3 sm:p-4">
                <h3 className="text-base font-bold text-ink">{t.impactTitle}</h3>
                <p className="mt-1 text-sm text-muted">{t.impactHelp}</p>

                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {([1, 2, 3] as CalendarMultiplier[]).map(multiplierButton)}
                </div>

                <details className="mt-3 rounded-control border border-line bg-surface px-3">
                  <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-ink">{t.moreWays}</summary>
                  <div className="grid gap-2 pb-3 sm:grid-cols-2">
                    {([4, 5] as CalendarMultiplier[]).map(multiplierButton)}
                  </div>
                </details>

                <div className="mt-3 grid gap-3 rounded-control border border-line bg-surface p-3 sm:grid-cols-3 sm:p-4">
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

            {/* Sticky inside this card only: it follows the calendar on small screens and never covers content below the card. */}
            <div
              data-testid="calendar-action-bar"
              className="sticky bottom-0 z-10 -mx-3 -mb-3 mt-3 flex items-center gap-3 rounded-b-[1rem] border-t border-line bg-surface px-3 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] sm:-mx-4 sm:-mb-4 sm:px-4 sm:pt-2 sm:[@media(max-height:380px)]:fixed sm:[@media(max-height:380px)]:bottom-0 sm:[@media(max-height:380px)]:left-0 sm:[@media(max-height:380px)]:right-0 sm:[@media(max-height:380px)]:mx-0 sm:[@media(max-height:380px)]:mb-0 sm:[@media(max-height:380px)]:z-30 sm:[@media(max-height:380px)]:rounded-none"
            >
              <div className="min-w-0 flex-1" aria-live="polite">
                {progress.isComplete ? (
                  <p className="text-sm font-bold text-emerald-950">✓ {t.calendarComplete}</p>
                ) : selected.length === 0 ? (
                  <p className="text-sm text-muted">{t.tapHint}</p>
                ) : (
                  <button type="button" onClick={showImpactChoices} className="flex min-h-11 w-full flex-col items-start justify-center text-left">
                    <span className="text-sm font-bold tabular text-ink">{t.selectionSummary(selected.length)} · {money(quote.totalCents)}</span>
                    <span className="text-xs text-brand-700 underline">{multiplier}× {multiplierLabels[language][multiplier]} · {t.changeImpact}</span>
                  </button>
                )}
              </div>
              {!progress.isComplete && <button
                type="button"
                disabled={selected.length === 0}
                onClick={() => setStep("supporter")}
                className="min-h-11 shrink-0 rounded-control bg-brand-600 px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-12"
              >
                {t.continue}
              </button>}
            </div>
          </section>
        )}

        {step === "supporter" && (
          <section className="mt-2 rounded-[1rem] border border-line bg-surface p-5 shadow-card sm:p-8">
            <h2 className="text-xl font-bold text-ink">{t.supporter}</h2>
            <p className="mt-1 text-sm text-muted">{t.supporterHelp}</p>
            <p data-testid="synthetic-contact-warning" className="mt-3 rounded-control border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{t.syntheticContactHelp}</p>

            <form className="mt-6 space-y-4" onSubmit={submitSupporter} autoComplete="off">
              <label className="block text-sm font-medium text-ink">
                {t.name}
                <input value={supporter.name} onChange={(event) => setSupporter((current) => ({ ...current, name: event.target.value }))} className="mt-1 min-h-11 w-full rounded-control border border-line-strong bg-surface px-3" autoComplete="off" maxLength={200} required />
              </label>
              <label className="block text-sm font-medium text-ink">
                {t.email}
                <input type="email" value={supporter.email} onChange={(event) => setSupporter((current) => ({ ...current, email: event.target.value }))} className="mt-1 min-h-11 w-full rounded-control border border-line-strong bg-surface px-3" autoComplete="off" maxLength={254} required />
              </label>
              <label className="block text-sm font-medium text-ink">
                {t.phone}
                <input type="tel" value={supporter.phone} onChange={(event) => setSupporter((current) => ({ ...current, phone: event.target.value }))} className="mt-1 min-h-11 w-full rounded-control border border-line-strong bg-surface px-3" autoComplete="off" maxLength={50} />
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
          <section className="mt-2 rounded-[1rem] border border-line bg-surface p-5 shadow-card sm:p-8">
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
          <section className="mt-2 rounded-[1rem] border border-emerald-200 bg-emerald-50 p-5 shadow-card sm:p-8">
            <h2 className="text-2xl font-bold text-emerald-950">{t.complete}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-emerald-950">{t.completeHelp}</p>
            <button type="button" onClick={() => setStep("review")} className="mt-5 min-h-11 rounded-control border border-emerald-300 bg-white px-4 text-sm font-semibold text-emerald-950">{t.back}</button>
          </section>
        )}
        {/* Season details and director demo controls: available on every step, below the main interaction. */}
        <section aria-label={t.progressDetails} className="mt-3 rounded-[1rem] border border-line bg-surface p-3 shadow-card sm:p-4">
          <p className="text-sm text-muted">{t.subtitle}</p>
          <div data-testid="paid-impact-breakdown" className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
            <p>{t.baseValue}: <strong className="font-semibold text-ink">{money(progress.baseCents)}</strong></p>
            <p>{t.addedImpact}: <strong className="font-semibold text-ink">{money(progress.additionalImpactCents)}</strong></p>
          </div>
          {progress.isComplete ? (
            <div data-testid="calendar-complete" role="status" className="mt-3 rounded-card border border-emerald-300 bg-emerald-50 px-4 py-3 text-emerald-950">
              <p className="font-bold">✓ {t.calendarComplete}</p>
              <p className="mt-1 text-sm">{t.completionMessage}</p>
            </div>
          ) : (
            <p
              data-testid="calendar-milestone"
              role="status"
              aria-live="polite"
              className={["mt-3 rounded-card border px-4 py-3 text-sm font-medium",
                progress.sponsoredCount >= 8
                  ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                  : "border-line bg-canvas text-ink-soft",
              ].join(" ")}
            >
              {progress.sponsoredCount >= 8 && <span aria-hidden="true">✓ </span>}
              {milestone}
            </p>
          )}
          {nextMilestone && (
            <p data-testid="calendar-next-milestone" className="mt-2 text-xs font-semibold text-emerald-900" aria-live="polite">
              {t.nextMilestone(nextMilestone.remaining, nextMilestone.target)}
            </p>
          )}
          <div className="mt-3 border-t border-line pt-3">
            <p className="text-xs font-semibold text-ink">{t.scenario}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(["partial", "first", "half", "final", "complete"] as const).map(option => (
                <button key={option} type="button" data-testid={`scenario-${option}`}
                  aria-pressed={scenario === option}
                  onClick={() => showScenario(option)}
                  className={`min-h-11 rounded-control border px-3 text-xs font-semibold ${scenario === option ? "border-brand-500 bg-brand-50 text-brand-900" : "border-line bg-surface text-ink"}`}>
                  {scenarioLabels[option]}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs leading-5 text-muted">{t.scenarioHelp}</p>
          </div>
        </section>
      </div>
    </main>
  );
}
