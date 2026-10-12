# Raffle Hub — Master Roster System

The master roster is imported once and reused by every fundraiser. Campaigns
enroll players via `campaign_participants`; they never copy players.

```
Raffle Campaign   → select teams → select players → add participants ┐
Sponsor-a-Day     → select teams → select players → add participants ├─► same players rows
Future fundraiser → select teams → select players → add participants ┘
```

## Entities

| Entity | Required | Optional |
|---|---|---|
| Player | first name, last name | preferred name, DOB, gender, external ID, household, team, notes |
| Team | name | season, age group, gender/division, coach, team code, status |
| Household | name | address, notes |
| Guardian | first name, last name | household, email, phone, relationship (per player), primary flags, communication preferences |

A player can exist with no household or guardian. Missing information shows up in
**Action Needed** instead of blocking data entry.

### Relationship rules

- One household → many players and many guardians.
- One player → many guardians (`player_guardians`), one marked primary.
- Guardians can have different contact info; each is a separate row.
- Siblings on different teams: same household, different `team_memberships`.
- Team changes preserve history (`team_memberships.ended_at`).

## Adding players

| Method | Phase 1 |
|---|---|
| CSV import wizard | ✅ |
| Manual **+ Add Player** | ✅ |
| Family self-registration / invitation | Prepared (`guardians.profile_id`, `players.source = 'self_registration'`, `PARTICIPANT_FAMILY` role) — not built |

### Manual Add Player

Side sheet, opened from the directory or dashboard. Required: first name, last
name, team. "More details" expands DOB, external ID, household (select existing
or create new), primary guardian (name, email, phone, relationship) and notes.
**Save Player** or **Save & Add Another** (keeps team + household for fast
entry of siblings/teammates). One transaction (`create_player`).

## Player directory

Columns: Player · Team · Household · Primary guardian · Contact · Status.
Search (name), filters (team, season, status, issue), pagination, bulk select →
**Assign team**, **Archive**, **Restore**, *Add to campaign (later phase)*.
Issue filters back the Action Needed links: `unassigned`, `no-guardian`,
`duplicates`.

## Player profile

Player information (edit in a sheet) · current team + team history ·
household · guardians (add, link, set primary, unlink) · campaign participation
(placeholder) · fundraising history (placeholder) · activity (audit events).

## CSV import wizard

```
UPLOAD → MAP COLUMNS → VALIDATE → REVIEW → RESOLVE ISSUES → IMPORT → SUMMARY
```

Nothing touches the roster until the final step, which runs as one database
transaction (`commit_player_import`).

### 1. Upload
CSV (comma, semicolon or tab; UTF-8 with or without BOM), up to 5,000 rows /
5 MB. Parsed on the server; every row is stored in `import_rows.raw`.

### 2. Map columns
Each header is auto-mapped with an alias dictionary
(`lib/roster/import/fields.ts`), e.g. *Player First*, *First Name*,
*Player First Name* → `first_name`; *Parent Email*, *Guardian 1 Email* →
`guardian1_email`; *Parent Name* → `guardian1_name` (split into first/last).
If a saved mapping has the same header signature it is applied instead. The admin
can remap any column or ignore it, and save the mapping by source name for
future imports.

Target fields: player (first/last/full name, preferred name, DOB, gender,
external ID, team, notes), household name, guardian 1 and 2 (name or
first/last, email, phone, relationship).

### 3. Validate
Per row (`lib/roster/import/validate.ts`):
- normalize whitespace, names, gender (M/F/Boy/Girl…), dates (ISO, M/D/YYYY,
  M/D/YY), emails, phones;
- required: first + last name;
- team: matched by name or team code (case-insensitive, current season first);
  unknown or missing → **needs team** (fix in-app or allow unassigned);
- errors: invalid DOB, invalid email, guardian with contact but no name.

### 4. Duplicate detection
`lib/roster/import/duplicates.ts` compares each row with the roster **and**
earlier rows of the same file. Signals: first/last name, preferred name,
nickname-prefix (Alex/Alexander), small typos, DOB, guardian email, guardian
phone, external ID.

| Classification | Rule (strongest match wins) |
|---|---|
| `EXACT_MATCH` | same external ID; or same first + last name and same DOB (and no conflicting external IDs) |
| `LIKELY_MATCH` | same name and a shared guardian email/phone (DOBs not conflicting); same name with a DOB missing on either side; or similar first name + same last name + (same DOB or shared guardian contact) |
| `NEEDS_REVIEW` | same name but different DOB; same name + DOB but different external IDs; or a duplicate of an earlier row in the same file |
| `NEW_RECORD` | none of the above |

Archived players are not matched (restore them first if they are returning).

Siblings and twins (same household/DOB, different first name) are **not**
flagged: the first name must match or be similar.

Uncertain duplicates are never merged automatically. Rows that match are put in
the **duplicate** bucket until the admin chooses:

| Choice | Effect at commit |
|---|---|
| **Use existing** | No roster change; row records the matched player |
| **Merge / link** | Fill blank fields on the existing player, apply team, add guardians |
| **Create new** | Insert a new player |
| **Skip** | Nothing |

Bulk shortcut: *Use existing for all exact matches*.

### 5. Review & resolve
Summary chips (e.g. **126 detected · 118 ready · 5 possible duplicates · 3
missing team**) filter the row table. Rows can be edited inline (names, DOB,
team, guardian fields); the import re-validates immediately. Bulk fixes:
*Assign team to all rows missing a team*, *Import missing-team rows as unassigned*.

### 6. Households (planned at validation)
Rows are grouped into households by shared guardian email or phone (within the
file). A guardian email/phone that already exists in the organization reuses
that guardian's household. Rows linked to an existing player reuse that player's
household. Each row stores its `household_key`.

### 7. Import & summary
`commit_player_import` executes the plan in one transaction: creates households,
players, team memberships, guardians (re-using guardians matched by email/phone),
links, and writes audit events (`PLAYER_IMPORTED`, `PLAYER_TEAM_CHANGED`,
`IMPORT_COMPLETED`). Error rows are skipped, never partially imported. The
summary shows created / linked / matched / skipped counts and links to the new
players.

## Action Needed

`roster_overview()` returns the counts behind the dashboard:

| Item | Links to |
|---|---|
| Players missing team assignment | Players `?issue=unassigned` |
| Possible duplicate players | Players `?issue=duplicates` (pairs with *Not a duplicate* / *Archive*) |
| Households missing contact information | Households `?issue=no-contact` |
| Players without a guardian | Players `?issue=no-guardian` |
| Unfinished imports | Import list |

This structure will expand to campaign items (unreconciled funds, correction
requests, inventory requests) in later phases.
