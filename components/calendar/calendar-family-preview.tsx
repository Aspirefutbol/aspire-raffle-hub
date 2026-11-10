"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import QRCode from "qrcode";
import { calendarPreviewShareContent, calendarTestConfirmationContent, type CalendarLanguage } from "@/lib/calendar/communication-content";
import { aspireSouthSyntheticPreview, syntheticCalendarProgress } from "@/lib/calendar/synthetic-preview";

const copy = {
  en: {
    title: "My calendar", language: "Español", raised: "Raised", sponsored: "days sponsored",
    demoBadge: "Demo preview — fictional player only, nothing is sent",
    demo: "Family tools preview — fictional player only. This does not create or recover a real player link, reserve days, or send donor emails.",
    share: "Share My Calendar", copy: "Copy Link", qr: "Show QR Code", more: "More sharing options",
    email: "Email invitation", whatsapp: "WhatsApp", download: "Download demo QR code",
    qrAlt: "Calendar preview QR code", linkLabel: "Demo calendar link",
    messageLabel: "Demo invitation — select and copy", copied: "Copied. The message and link are for demonstration only.",
    shared: "Sharing completed by your device. This remains a demo link, not a live fundraiser.",
    manual: "Automatic sharing is unavailable. Select and copy the demo invitation below.",
    error: "Sharing could not be prepared. No link was created or replaced.",
    sharingNote: "Use these controls to review sharing with your team, not to ask donors for money. Live player-specific links remain gated by guardian authorization and security review.",
    emailTitle: "Donor confirmation preview", subject: "Subject", emailNote: "Sample only: this message has not been sent. Live delivery needs the approved sender, verified payment integration, and a tested delivery queue.",
    privacy: "Donor contact information is not included in the shared link, QR code, or public calendar.",
  },
  es: {
    title: "Mi calendario", language: "English", raised: "Recaudado", sponsored: "días patrocinados",
    demoBadge: "Vista de demostración — jugador ficticio, no se envía nada",
    demo: "Vista previa familiar: solo un jugador ficticio. No crea ni recupera un enlace real, no reserva días ni envía correos a donantes.",
    share: "Compartir mi calendario", copy: "Copiar enlace", qr: "Mostrar código QR", more: "Más opciones para compartir",
    email: "Invitación por correo", whatsapp: "WhatsApp", download: "Descargar QR de demostración",
    qrAlt: "Código QR del calendario de demostración", linkLabel: "Enlace del calendario de demostración",
    messageLabel: "Invitación de demostración: selecciona y copia", copied: "Copiado. El mensaje y el enlace son solo de demostración.",
    shared: "Tu dispositivo completó la acción de compartir. Este sigue siendo un enlace de demostración, no una campaña activa.",
    manual: "No se puede compartir automáticamente. Selecciona y copia la invitación de demostración.",
    error: "No se pudo preparar el enlace. No se creó ni reemplazó ningún enlace.",
    sharingNote: "Usa estos controles para revisar cómo compartir con tu equipo, no para solicitar dinero. Los enlaces personales requieren autorización del adulto responsable y revisión de seguridad.",
    emailTitle: "Ejemplo de confirmación al donante", subject: "Asunto", emailNote: "Solo un ejemplo: este mensaje no se ha enviado. El envío real requiere un remitente aprobado, integración del pago verificado y una cola de envío probada.",
    privacy: "Los datos de contacto del donante no se incluyen en el enlace, el código QR ni el calendario público.",
  },
} as const;

type ShareContent = ReturnType<typeof calendarPreviewShareContent>;
type Feedback = "copied" | "shared" | "manual" | "error" | null;
const fixture = aspireSouthSyntheticPreview;
const progress = syntheticCalendarProgress(fixture.paidDays, fixture.goalCents);
const actionClass = "min-h-12 rounded-control border border-line-strong bg-surface px-4 py-3 text-sm font-semibold text-ink disabled:opacity-50";

export function CalendarFamilyPreview({ initialLanguage = "en" }: { initialLanguage?: CalendarLanguage }) {
  const [language, setLanguage] = useState<CalendarLanguage>(initialLanguage);
  const [content, setContent] = useState<ShareContent | null>(null);
  const [qr, setQr] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [manualText, setManualText] = useState("");
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const t = copy[language];
  const confirmation = calendarTestConfirmationContent({
    organizationName: fixture.displayName, participantDisplayName: fixture.participant.displayName,
    days: [10], multiplier: 5, baseCents: 1000, additionalImpactCents: 4000, totalCents: 5000,
  }, language);

  function prepare() {
    const next = calendarPreviewShareContent(window.location.origin, language);
    setContent(next);
    return next;
  }

  function changeLanguage() {
    if (working.current) return;
    setLanguage(language === "en" ? "es" : "en");
    setContent(null); setQr(""); setFeedback(null); setManualText(""); setMore(false);
  }

  async function perform(kind: "share" | "copy" | "qr") {
    if (working.current) return;
    working.current = true; setBusy(true); setFeedback(null); setManualText("");
    let prepared: ShareContent | null = null;
    try {
      prepared = prepare();
      if (kind === "qr") {
        setQr(await QRCode.toDataURL(prepared.url, { width: 240, margin: 4, errorCorrectionLevel: "M" }));
      } else if (kind === "share" && typeof navigator.share === "function") {
        // No awaited operation before this: native sharing requires a user gesture.
        await navigator.share({ title: prepared.title, text: prepared.text, url: prepared.url });
        setFeedback("shared");
      } else {
        if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
        await navigator.clipboard.writeText(kind === "copy" ? prepared.url : prepared.invitation);
        setFeedback("copied");
      }
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) {
        setFeedback(prepared && kind !== "qr" ? "manual" : "error");
        if (prepared && kind !== "qr") setManualText(prepared.invitation);
      }
    } finally { working.current = false; setBusy(false); }
  }

  function moreOptions() {
    try { prepare(); setMore(!more); setFeedback(null); }
    catch { setFeedback("error"); }
  }

  return <main lang={language} className="mx-auto max-w-4xl space-y-3 px-3 pb-6 pt-2 sm:px-4" data-testid="calendar-family-preview">
    <section className="rounded-card border border-line bg-surface p-3 shadow-card sm:p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-brand-700">Aspire South · {fixture.participant.displayName} · {fixture.participant.teamName}</p>
          <h1 className="mt-0.5 text-xl font-bold leading-tight sm:text-2xl">{t.title}</h1>
        </div>
        <button type="button" onClick={changeLanguage} disabled={busy} className="min-h-11 shrink-0 rounded-control border border-line-strong bg-surface px-3 text-sm font-semibold text-ink disabled:opacity-50">{t.language}</button>
      </header>
      <details className="mt-2 rounded-control border border-amber-300 bg-amber-50 px-3 text-amber-950" data-testid="calendar-family-demo-warning">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-xs font-semibold"><span aria-hidden="true">ⓘ</span>{t.demoBadge}</summary>
        <p className="pb-3 text-xs leading-5">{t.demo}</p>
      </details>
      <div className="mt-2 flex items-baseline justify-between gap-3">
        <p className="text-sm"><span className="text-xs font-semibold uppercase tracking-wide text-muted">{t.raised}</span> <strong className="text-xl tabular">${progress.raisedCents / 100}</strong></p>
        <p className="text-sm font-semibold">{progress.sponsoredCount} / 31 {t.sponsored}</p>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
        <div className="h-full rounded-full bg-emerald-600" style={{ width: `${progress.dayCompletionPercent}%` }} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <button type="button" onClick={() => void perform("share")} disabled={busy} className="col-span-2 min-h-12 w-full rounded-control bg-brand-600 px-4 py-3 font-semibold text-white disabled:opacity-50 sm:col-span-1">{t.share}</button>
        <button type="button" onClick={() => void perform("copy")} disabled={busy} className={actionClass}>{t.copy}</button>
        <button type="button" onClick={() => void perform("qr")} disabled={busy} className={actionClass}>{t.qr}</button>
      </div>
      <button type="button" onClick={moreOptions} disabled={busy} aria-expanded={more} className="mt-2 min-h-11 text-sm font-semibold text-brand-700 underline">{t.more}</button>
      {more && content && <div className="flex flex-wrap gap-4">
        <a className="inline-flex min-h-11 items-center text-sm underline" href={content.emailHref}>{t.email}</a>
        <a className="inline-flex min-h-11 items-center text-sm underline" href={content.whatsappHref} target="_blank" rel="noopener noreferrer">{t.whatsapp}</a>
      </div>}
      {feedback && <p role="status" className="mt-3 text-sm">{t[feedback]}</p>}
      {manualText && <label className="mt-3 block text-sm">{t.messageLabel}<textarea readOnly value={manualText} onFocus={event => event.currentTarget.select()} className="mt-1 min-h-32 w-full rounded-control border border-line p-3" /></label>}
      {qr && <div className="mt-4 space-y-2">
        <Image src={qr} unoptimized width={240} height={240} alt={t.qrAlt} className="h-auto max-w-full" />
        <a className="inline-flex min-h-11 items-center text-sm underline" href={qr} download="aspire-south-demo-calendar-qr.png">{t.download}</a>
      </div>}
      {content && <p className="mt-3 break-all text-xs text-muted" data-testid="calendar-demo-share-url">{t.linkLabel}: {content.url}</p>}
      <p className="mt-4 text-sm text-muted">{t.sharingNote}</p>
      <p className="mt-2 text-xs text-muted">{t.privacy}</p>
    </section>
    <details className="rounded-card border border-line bg-surface p-4" data-testid="calendar-confirmation-preview">
      <summary className="min-h-11 cursor-pointer py-2 text-lg font-semibold">{t.emailTitle}</summary>
      <p className="mt-2 rounded-control bg-canvas p-3 text-sm">{t.emailNote}</p>
      <p className="mt-4 text-sm font-semibold">{t.subject}: {confirmation.subject}</p>
      <p className="mt-3 whitespace-pre-line break-words text-sm leading-6" data-testid="calendar-confirmation-text">{confirmation.text}</p>
    </details>
  </main>;
}
