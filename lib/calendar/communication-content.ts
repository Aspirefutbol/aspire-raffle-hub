export type CalendarLanguage = "en" | "es";
export type CalendarEmailDetails = {
  organizationName: string;
  participantDisplayName: string;
  days: readonly number[];
  multiplier: number;
  baseCents: number;
  additionalImpactCents: number;
  totalCents: number;
};

function languageIsValid(language: CalendarLanguage): void {
  if (language !== "en" && language !== "es") throw new Error("Unsupported calendar language.");
}

/** Content only: never use rendering a message as proof of payment. */
export function calendarTestConfirmationContent(details: CalendarEmailDetails, language: CalendarLanguage) {
  languageIsValid(language);
  for (const name of [details.organizationName, details.participantDisplayName]) {
    if (typeof name !== "string" || !name.trim() || name.length > 120 || (/[\r\n]/.test(name) || name.includes("\0"))) {
      throw new Error("Invalid public calendar display name.");
    }
  }
  const days = [...details.days].sort((a, b) => a - b);
  if (!days.length || days.length > 31 || new Set(days).size !== days.length ||
      days.some(day => !Number.isInteger(day) || day < 1 || day > 31) ||
      !Number.isInteger(details.multiplier) || details.multiplier < 1 || details.multiplier > 5) {
    throw new Error("Invalid calendar sponsorship selection.");
  }
  const baseCents = days.reduce((sum, day) => sum + day * 100, 0);
  if (details.baseCents !== baseCents || details.totalCents !== baseCents * details.multiplier ||
      details.additionalImpactCents !== details.totalCents - baseCents) {
    throw new Error("Calendar confirmation amounts do not reconcile.");
  }
  const money = (cents: number) => new Intl.NumberFormat(language === "es" ? "es-US" : "en-US", {
    style: "currency", currency: "USD",
  }).format(cents / 100);
  const es = language === "es";
  const subject = es
    ? `[PRUEBA] Gracias por apoyar a ${details.organizationName}`
    : `[TEST] Thank you for supporting ${details.organizationName}`;
  const paragraphs = [
    es ? "Mensaje de prueba. No es un recibo de un pago real." : "Test message. This is not a receipt for a real payment.",
    es ? `¡Gracias por apoyar el calendario de ${details.participantDisplayName}!` : `Thank you for supporting ${details.participantDisplayName}'s calendar!`,
    `${es ? "Días patrocinados" : "Sponsored days"}: ${days.join(", ")}`,
    `${es ? "Multiplicador" : "Impact level"}: ${details.multiplier}×`,
    `${es ? "Valor base del calendario" : "Base calendar value"}: ${money(details.baseCents)}`,
    `${es ? "Impacto adicional" : "Additional impact"}: ${money(details.additionalImpactCents)}`,
    `Total: ${money(details.totalCents)}`,
    es ? "Tu apoyo ayuda a hacer posible esta temporada." : "Your support helps make this season possible.",
  ];
  const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const escape = (value: string) => value.replace(/[&<>"']/g, char => entities[char]!);
  return {
    subject,
    text: paragraphs.join("\n\n"),
    html: `<div lang="${language}">${paragraphs.map(text => `<p>${escape(text)}</p>`).join("")}</div>`,
  };
}

/** Synthetic review links only. This does not issue/recover a seller token. */
export function calendarPreviewShareContent(origin: string, language: CalendarLanguage) {
  languageIsValid(language);
  const base = new URL(origin);
  const local = base.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
  const preview = base.protocol === "https:" && !base.port &&
    /^[a-z0-9-]+--aspire-raffle-hub-staging\.netlify\.app$/.test(base.hostname);
  if ((!local && !preview) || base.username || base.password || base.search || base.hash || base.pathname !== "/") {
    throw new Error("An isolated calendar preview origin is required.");
  }
  const donorUrl = new URL("/calendar/aspire-south", base.origin);
  // A Spanish-language synthetic invitation and its QR must open in Spanish.
  // No private guardian token, buyer detail or recipient state is added.
  if (language === "es") donorUrl.searchParams.set("lang", "es");
  const url = donorUrl.toString();
  const title = language === "es" ? "[DEMO] Calendario de Aspire South" : "[DEMO] Aspire South calendar";
  const text = language === "es"
    ? "Mira este calendario ficticio de Aspire South. Solo demostración: no acepta pagos. Puedes cambiar entre inglés y español en la página."
    : "View this fictional Aspire South calendar. Demonstration only: it does not accept payments. You can switch between English and Spanish on the page.";
  const invitation = `${title}\n${text}\n${url}`;
  return {
    url, title, text, invitation,
    emailHref: `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(invitation)}`,
    whatsappHref: `https://wa.me/?text=${encodeURIComponent(invitation)}`,
  };
}
