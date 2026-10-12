// Value normalization for imported cells. Pure functions, unit-tested.

export function cleanText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

/** Title-cases names typed in ALL CAPS or all lowercase; leaves mixed case alone ("McDonald"). */
export function normalizeName(value: unknown): string {
  const text = cleanText(value);
  if (!text) return "";
  if (text !== text.toUpperCase() && text !== text.toLowerCase()) return text;
  return text.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** "Garcia, Maria" → Maria / Garcia; "Maria Elena Garcia" → Maria Elena / Garcia. */
export function splitFullName(value: unknown): { first: string; last: string } {
  const text = normalizeName(value);
  if (!text) return { first: "", last: "" };
  if (text.includes(",")) {
    const [last, ...rest] = text.split(",");
    return { first: cleanText(rest.join(" ")), last: cleanText(last) };
  }
  const parts = text.split(" ");
  if (parts.length === 1) return { first: parts[0] ?? "", last: "" };
  return { first: parts.slice(0, -1).join(" "), last: parts.at(-1) ?? "" };
}

function isoDate(y: number, m: number, d: number): string | null {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export type DateResult = { ok: true; value: string | null } | { ok: false; reason: string };

/**
 * Accepts 2013-04-12, 2013/04/12, 4/12/2013, 04-12-2013, 4/12/13 (US month-first)
 * and Excel serial numbers. Rejects impossible and future dates.
 */
export function parseDate(value: unknown, today = new Date()): DateResult {
  const text = cleanText(value);
  if (!text) return { ok: true, value: null };
  let iso: string | null = null;

  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/.exec(text);
  if (m) iso = isoDate(Number(m[1]), Number(m[2]), Number(m[3]));

  if (!iso && (m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(text))) {
    let year = Number(m[3]);
    if (m[3]!.length === 2) {
      const yy = today.getUTCFullYear() % 100;
      year += year <= yy ? 2000 : 1900;
    }
    iso = isoDate(year, Number(m[1]), Number(m[2]));
  }

  if (!iso && /^\d{5}(\.\d+)?$/.test(text)) {
    const serial = Math.floor(Number(text));
    if (serial > 1 && serial < 80000) {
      const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
      iso = isoDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }
  }

  if (!iso) return { ok: false, reason: `“${text}” isn’t a date we recognize. Use YYYY-MM-DD or MM/DD/YYYY.` };
  if (iso < "1900-01-02") return { ok: false, reason: `${iso} is too far in the past.` };
  if (iso > today.toISOString().slice(0, 10)) return { ok: false, reason: `${iso} is in the future.` };
  return { ok: true, value: iso };
}

export function normalizeGender(value: unknown): { value: "male" | "female" | "nonbinary" | "unspecified" | null; recognized: boolean } {
  const text = cleanText(value).toLowerCase();
  if (!text) return { value: null, recognized: true };
  if (["m", "male", "boy", "b", "man"].includes(text)) return { value: "male", recognized: true };
  if (["f", "female", "girl", "g", "woman", "w"].includes(text)) return { value: "female", recognized: true };
  if (["nb", "non-binary", "nonbinary", "non binary", "x"].includes(text)) return { value: "nonbinary", recognized: true };
  if (["u", "unknown", "unspecified", "prefer not to say", "n/a"].includes(text)) return { value: "unspecified", recognized: true };
  return { value: null, recognized: false };
}

export function normalizeRelationship(value: unknown): string {
  const text = cleanText(value).toLowerCase();
  if (!text) return "parent";
  if (/^(mom|mother|mum|mama)$/.test(text)) return "mother";
  if (/^(dad|father|papa)$/.test(text)) return "father";
  if (/step/.test(text)) return "stepparent";
  if (/grand/.test(text)) return "grandparent";
  if (/guardian/.test(text)) return "guardian";
  if (/parent/.test(text)) return "parent";
  return "other";
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function normalizeEmail(value: unknown): { value: string | null; valid: boolean } {
  const text = cleanText(value).toLowerCase().replace(/^mailto:/, "");
  if (!text) return { value: null, valid: true };
  return { value: text, valid: EMAIL_RE.test(text) };
}

export function phoneDigits(value: unknown): string {
  return cleanText(value).replace(/\D/g, "");
}

/** Keeps the phone as typed (trimmed); flags numbers with too few digits. */
export function normalizePhone(value: unknown): { value: string | null; valid: boolean } {
  const text = cleanText(value);
  if (!text) return { value: null, valid: true };
  return { value: text, valid: phoneDigits(text).length >= 7 };
}

/** Lowercase, accent-free, letters only — for comparing names. */
export function nameKey(value: unknown): string {
  return cleanText(value)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}
