import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const overviewSchema = z.object({
  total_players: z.number(),
  active_teams: z.number(),
  households: z.number(),
  unassigned_players: z.number(),
  players_without_guardian: z.number(),
  possible_duplicates: z.number(),
  households_missing_contact: z.number(),
  open_imports: z.number(),
  recent_imports: z.array(
    z.object({
      id: z.string(),
      file_name: z.string(),
      status: z.string(),
      row_count: z.number(),
      created_at: z.string(),
      summary: z.record(z.string(), z.unknown()).nullable(),
    }),
  ),
});

export type RosterOverview = z.infer<typeof overviewSchema>;

export async function getRosterOverview(orgId: string): Promise<RosterOverview> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("roster_overview", { p_organization_id: orgId });
  if (error) throw new Error(`Could not load dashboard: ${error.message}`);
  return overviewSchema.parse(data);
}

export interface ActionItem {
  key: string;
  count: number;
  label: string;
  description: string;
  href: string;
  cta: string;
}

/**
 * Action Needed queue. Each item deep-links to the exact records needing work.
 * Later phases append campaign items (unreconciled funds, correction requests…).
 */
export function buildActionItems(o: RosterOverview, base: string, canImport: boolean): ActionItem[] {
  const items: ActionItem[] = [
    {
      key: "duplicates",
      count: o.possible_duplicates,
      label: o.possible_duplicates === 1 ? "possible duplicate player" : "possible duplicate players",
      description: "Same name with matching or missing date of birth.",
      href: `${base}/people/players?issue=duplicates`,
      cta: "Review",
    },
    {
      key: "unassigned",
      count: o.unassigned_players,
      label: o.unassigned_players === 1 ? "player needs a team" : "players need a team",
      description: "Active players with no current team assignment.",
      href: `${base}/people/players?issue=unassigned`,
      cta: "Assign teams",
    },
    {
      key: "no-contact",
      count: o.households_missing_contact,
      label: o.households_missing_contact === 1 ? "household missing contact information" : "households missing contact information",
      description: "No guardian with an email or phone number.",
      href: `${base}/people/households?issue=no-contact`,
      cta: "Add contacts",
    },
    {
      key: "no-guardian",
      count: o.players_without_guardian,
      label: o.players_without_guardian === 1 ? "player has no guardian" : "players have no guardian",
      description: "Needed later for family invitations and ticket notifications.",
      href: `${base}/people/players?issue=no-guardian`,
      cta: "Add guardians",
    },
  ];
  if (canImport) {
    items.push({
      key: "imports",
      count: o.open_imports,
      label: o.open_imports === 1 ? "import waiting to be finished" : "imports waiting to be finished",
      description: "Uploaded files that haven’t been imported yet.",
      href: `${base}/people/players/import`,
      cta: "Continue",
    });
  }
  return items.filter((i) => i.count > 0);
}
