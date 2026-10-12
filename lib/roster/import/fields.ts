// Import target fields and the header-alias dictionary used for auto-mapping.

export type GuardianSlot = 1 | 2;

export const PLAYER_FIELDS = [
  "first_name",
  "last_name",
  "full_name",
  "preferred_name",
  "date_of_birth",
  "gender",
  "external_player_id",
  "team",
  "notes",
] as const;

const GUARDIAN_SUFFIXES = ["first_name", "last_name", "name", "email", "phone", "relationship"] as const;
type GuardianSuffix = (typeof GUARDIAN_SUFFIXES)[number];

export const GUARDIAN_FIELDS = ([1, 2] as const).flatMap((n) => GUARDIAN_SUFFIXES.map((s) => `guardian${n}_${s}` as const));

export const TARGET_FIELDS = [...PLAYER_FIELDS, "household_name", ...GUARDIAN_FIELDS] as const;
export type TargetField = (typeof TARGET_FIELDS)[number];

export function isTargetField(value: unknown): value is TargetField {
  return typeof value === "string" && (TARGET_FIELDS as readonly string[]).includes(value);
}

const PLAYER_LABELS: Record<(typeof PLAYER_FIELDS)[number] | "household_name", string> = {
  first_name: "First name",
  last_name: "Last name",
  full_name: "Full name (split automatically)",
  preferred_name: "Preferred name",
  date_of_birth: "Date of birth",
  gender: "Gender",
  external_player_id: "External player ID",
  team: "Team (name or code)",
  notes: "Notes",
  household_name: "Household name",
};

const GUARDIAN_LABELS: Record<GuardianSuffix, string> = {
  first_name: "first name",
  last_name: "last name",
  name: "full name",
  email: "email",
  phone: "phone",
  relationship: "relationship",
};

export function fieldLabel(field: TargetField): string {
  const m = /^guardian([12])_(.+)$/.exec(field);
  if (m) return `Guardian ${m[1]} ${GUARDIAN_LABELS[m[2] as GuardianSuffix]}`;
  return PLAYER_LABELS[field as keyof typeof PLAYER_LABELS];
}

export const FIELD_GROUPS: Array<{ label: string; fields: TargetField[] }> = [
  { label: "Player", fields: [...PLAYER_FIELDS] },
  { label: "Household", fields: ["household_name"] },
  { label: "Guardian 1", fields: GUARDIAN_SUFFIXES.map((s) => `guardian1_${s}` as TargetField) },
  { label: "Guardian 2", fields: GUARDIAN_SUFFIXES.map((s) => `guardian2_${s}` as TargetField) },
];

/** "Player First-Name:" → "playerfirstname" */
export function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const PLAYER_ALIASES: Record<(typeof PLAYER_FIELDS)[number] | "household_name", string[]> = {
  first_name: ["first name", "firstname", "first", "player first", "player first name", "given name", "fname", "child first name", "athlete first name", "player given name", "student first name"],
  last_name: ["last name", "lastname", "last", "player last", "player last name", "surname", "lname", "child last name", "athlete last name", "student last name"],
  full_name: ["name", "player name", "full name", "player", "athlete", "athlete name", "child name", "player full name", "student name", "participant name"],
  preferred_name: ["preferred name", "nickname", "goes by", "preferred first name"],
  date_of_birth: ["dob", "date of birth", "birth date", "birthdate", "birthday", "player dob", "player birth date", "player date of birth"],
  gender: ["gender", "sex", "player gender"],
  external_player_id: ["player id", "external id", "external player id", "id", "registration id", "registration number", "registration", "reg", "reg #", "reg no", "reg number", "member id", "member number", "league id", "usys id", "player number id"],
  team: ["team", "team name", "squad", "roster", "team code", "assigned team", "current team"],
  notes: ["notes", "note", "comments", "comment"],
  household_name: ["household", "household name", "family"],
};

const GUARDIAN_PREFIXES: Record<GuardianSlot, string[]> = {
  1: ["parent", "guardian", "parent 1", "guardian 1", "parent1", "guardian1", "primary parent", "primary guardian", "primary contact", "contact", "parent guardian", "parent/guardian"],
  2: ["parent 2", "guardian 2", "parent2", "guardian2", "secondary parent", "second parent", "secondary guardian", "secondary contact", "other parent"],
};

const GUARDIAN_SUFFIX_ALIASES: Record<GuardianSuffix, string[]> = {
  first_name: ["first name", "first", "firstname"],
  last_name: ["last name", "last", "lastname", "surname"],
  name: ["name", "full name", ""],
  email: ["email", "e-mail", "email address"],
  phone: ["phone", "cell", "mobile", "phone number", "cell phone", "mobile phone"],
  relationship: ["relationship", "relation", "relationship to player"],
};

/** Bare contact headers in a youth roster almost always mean the primary parent. */
const BARE_GUARDIAN1: Partial<Record<GuardianSuffix, string[]>> = {
  email: ["email", "e-mail", "email address", "primary email", "home email"],
  phone: ["phone", "phone number", "cell", "cell phone", "mobile", "home phone", "primary phone"],
  relationship: ["relationship"],
};

const ALIAS_INDEX: Map<string, TargetField> = (() => {
  const index = new Map<string, TargetField>();
  const add = (alias: string, field: TargetField) => {
    const key = normalizeHeader(alias);
    if (key && !index.has(key)) index.set(key, field);
  };
  for (const [field, aliases] of Object.entries(PLAYER_ALIASES)) for (const a of aliases) add(a, field as TargetField);
  for (const slot of [1, 2] as const) {
    for (const suffix of GUARDIAN_SUFFIXES) {
      for (const prefix of GUARDIAN_PREFIXES[slot]) {
        for (const s of GUARDIAN_SUFFIX_ALIASES[suffix]) add(`${prefix} ${s}`, `guardian${slot}_${suffix}`);
      }
    }
  }
  for (const [suffix, aliases] of Object.entries(BARE_GUARDIAN1)) for (const a of aliases ?? []) add(a, `guardian1_${suffix as GuardianSuffix}`);
  return index;
})();

export type ColumnMapping = Record<string, TargetField | null>;

/** Best-guess mapping for a set of headers. Each target is used at most once. */
export function suggestMapping(headers: string[]): ColumnMapping {
  const used = new Set<TargetField>();
  const mapping: ColumnMapping = {};
  for (const header of headers) {
    const field = ALIAS_INDEX.get(normalizeHeader(header)) ?? null;
    if (field && !used.has(field)) {
      mapping[header] = field;
      used.add(field);
    } else {
      mapping[header] = null;
    }
  }
  return mapping;
}

/** Order-independent fingerprint of a file's headers, used to reuse saved mappings. */
export function headerSignature(headers: string[]): string {
  return [...new Set(headers.map(normalizeHeader).filter(Boolean))].sort().join("|");
}

export interface MappingProblem {
  kind: "missing_name" | "duplicate_target";
  message: string;
}

export function checkMapping(mapping: ColumnMapping): MappingProblem[] {
  const problems: MappingProblem[] = [];
  const targets = Object.values(mapping).filter((v): v is TargetField => Boolean(v));
  const has = (f: TargetField) => targets.includes(f);
  if (!(has("full_name") || (has("first_name") && has("last_name")))) {
    problems.push({ kind: "missing_name", message: "Map player First name and Last name (or a single Full name column)." });
  }
  const counts = new Map<TargetField, number>();
  for (const t of targets) counts.set(t, (counts.get(t) ?? 0) + 1);
  for (const [field, n] of counts) {
    if (n > 1) problems.push({ kind: "duplicate_target", message: `${fieldLabel(field)} is mapped from ${n} columns. Choose one.` });
  }
  return problems;
}
