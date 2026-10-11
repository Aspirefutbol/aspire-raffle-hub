import { nameKey, phoneDigits } from "./normalize";
import type { MatchType, RosterPlayer, RowData } from "./types";

// Common nickname ↔ given-name pairs (both directions are checked).
const NICKNAMES: Record<string, string[]> = {
  alex: ["alexander", "alexandra", "alejandro"],
  andy: ["andrew"], drew: ["andrew"],
  ben: ["benjamin"], benny: ["benjamin"],
  bill: ["william"], will: ["william"], liam: ["william"], billy: ["william"],
  bob: ["robert"], rob: ["robert"], robbie: ["robert"], bobby: ["robert"],
  chris: ["christopher", "christian"],
  dan: ["daniel"], danny: ["daniel"],
  eli: ["elijah", "elias"],
  gabe: ["gabriel"],
  jake: ["jacob"],
  jim: ["james"], jimmy: ["james"], jamie: ["james"],
  joe: ["joseph"], joey: ["joseph"],
  josh: ["joshua"],
  kate: ["katherine", "catherine"], katie: ["katherine", "catherine"],
  leo: ["leonardo", "leonel"],
  liz: ["elizabeth"], beth: ["elizabeth"],
  matt: ["matthew", "mateo"],
  max: ["maximilian", "maxwell"],
  mike: ["michael"], mikey: ["michael"],
  nate: ["nathan", "nathaniel"],
  nick: ["nicholas", "nicolas"],
  sam: ["samuel", "samantha"], sammy: ["samuel"],
  tom: ["thomas"], tommy: ["thomas"],
  tony: ["anthony"],
  zach: ["zachary"], zack: ["zachary"],
};

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length]!;
}

/** Same person's first name written differently: nickname, prefix, or a one-letter typo. */
export function similarFirstName(a: string, b: string): boolean {
  const x = nameKey(a);
  const y = nameKey(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (NICKNAMES[x]?.includes(y) || NICKNAMES[y]?.includes(x)) return true;
  if (x.length >= 3 && y.length >= 3 && (x.startsWith(y) || y.startsWith(x))) return true;
  return Math.min(x.length, y.length) >= 4 && levenshtein(x, y) <= 1;
}

export interface MatchResult {
  type: MatchType;
  playerId: string | null;
  reasons: string[];
}

const RANK: Record<MatchType, number> = { EXACT_MATCH: 3, LIKELY_MATCH: 2, NEEDS_REVIEW: 1, NEW_RECORD: 0 };

interface Comparable {
  first: string;
  preferred: string;
  last: string;
  dob: string | null;
  externalId: string;
  emails: string[];
  phones: string[];
}

export function comparableFromRow(row: RowData): Comparable {
  return {
    first: nameKey(row.first_name),
    preferred: nameKey(row.preferred_name),
    last: nameKey(row.last_name),
    dob: row.date_of_birth && /^\d{4}-\d{2}-\d{2}$/.test(row.date_of_birth) ? row.date_of_birth : null,
    externalId: (row.external_player_id ?? "").trim().toLowerCase(),
    emails: [row.guardian1_email, row.guardian2_email].filter((e): e is string => Boolean(e)).map((e) => e.toLowerCase()),
    phones: [row.guardian1_phone, row.guardian2_phone].map(phoneDigits).filter((p) => p.length >= 7),
  };
}

function comparableFromPlayer(p: RosterPlayer): Comparable {
  return {
    first: nameKey(p.first_name),
    preferred: nameKey(p.preferred_name),
    last: nameKey(p.last_name),
    dob: p.date_of_birth,
    externalId: (p.external_player_id ?? "").trim().toLowerCase(),
    emails: p.guardian_emails.map((e) => e.toLowerCase()),
    phones: p.guardian_phones.filter((x) => x.length >= 7),
  };
}

/** Compares two people. Returns null when they are clearly different. */
export function compare(a: Comparable, b: Comparable): { type: MatchType; reason: string } | null {
  if (a.externalId && b.externalId && a.externalId === b.externalId) return { type: "EXACT_MATCH", reason: "Same external player ID" };

  const firstNames = (c: Comparable) => [c.first, c.preferred].filter(Boolean);
  const sameLast = Boolean(a.last) && a.last === b.last;
  if (!sameLast) return null;
  const sameFirst = firstNames(a).some((x) => firstNames(b).includes(x));
  const similarFirst = sameFirst || firstNames(a).some((x) => firstNames(b).some((y) => similarFirstName(x, y)));
  if (!similarFirst) return null; // siblings / twins: same household, different first names

  const sharedContact = a.emails.some((e) => b.emails.includes(e)) || a.phones.some((p) => b.phones.includes(p));
  const dobKnown = Boolean(a.dob && b.dob);
  const sameDob = dobKnown && a.dob === b.dob;
  const idsConflict = Boolean(a.externalId && b.externalId);

  if (sameFirst && sameDob) {
    return idsConflict
      ? { type: "NEEDS_REVIEW", reason: "Same name and date of birth, but different external IDs" }
      : { type: "EXACT_MATCH", reason: "Same name and date of birth" };
  }
  if (sameFirst && sharedContact && !(dobKnown && !sameDob)) return { type: "LIKELY_MATCH", reason: "Same name and guardian contact" };
  if (sameFirst && !dobKnown) return { type: "LIKELY_MATCH", reason: "Same name, date of birth missing" };
  if (similarFirst && (sameDob || sharedContact)) {
    return { type: "LIKELY_MATCH", reason: sameDob ? "Similar name and same date of birth" : "Similar name and guardian contact" };
  }
  if (sameFirst) return { type: "NEEDS_REVIEW", reason: "Same name, different date of birth" };
  return null;
}

export interface RosterIndex {
  byLast: Map<string, Array<{ player: RosterPlayer; cmp: Comparable }>>;
  byExternalId: Map<string, RosterPlayer>;
}

export function buildRosterIndex(players: RosterPlayer[]): RosterIndex {
  const byLast = new Map<string, Array<{ player: RosterPlayer; cmp: Comparable }>>();
  const byExternalId = new Map<string, RosterPlayer>();
  for (const player of players) {
    const cmp = comparableFromPlayer(player);
    if (cmp.last) byLast.set(cmp.last, [...(byLast.get(cmp.last) ?? []), { player, cmp }]);
    if (cmp.externalId) byExternalId.set(cmp.externalId, player);
  }
  return { byLast, byExternalId };
}

/** Best match for an import row against the existing roster. */
export function matchAgainstRoster(row: RowData, index: RosterIndex): MatchResult {
  const a = comparableFromRow(row);
  let best: MatchResult = { type: "NEW_RECORD", playerId: null, reasons: [] };

  const consider = (player: RosterPlayer, cmp: Comparable) => {
    const r = compare(a, cmp);
    if (r && RANK[r.type] > RANK[best.type]) best = { type: r.type, playerId: player.id, reasons: [r.reason] };
  };

  if (a.externalId) {
    const p = index.byExternalId.get(a.externalId);
    if (p) consider(p, comparableFromPlayer(p));
  }
  for (const { player, cmp } of index.byLast.get(a.last) ?? []) consider(player, cmp);
  return best;
}

/** Index of an earlier row in the same file that looks like the same player, if any. */
export function findInFileDuplicate(row: RowData, earlier: Array<{ rowNumber: number; data: RowData }>): { rowNumber: number; reason: string } | null {
  const a = comparableFromRow(row);
  for (const e of earlier) {
    const r = compare(a, comparableFromRow(e.data));
    if (r && (r.type === "EXACT_MATCH" || r.type === "LIKELY_MATCH")) return { rowNumber: e.rowNumber, reason: `${r.reason} as row ${e.rowNumber}` };
  }
  return null;
}
