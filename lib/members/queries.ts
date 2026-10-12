import "server-only";
import { z } from "zod";
import { isOrganizationRole, type OrganizationRole } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

export const MEMBERS_PAGE_SIZE = 50;

const memberRowSchema = z.object({
  member_id: z.string(),
  user_id: z.string(),
  status: z.string(),
  created_at: z.string(),
  full_name: z.string().nullable(),
  email: z.string().nullable(),
  roles: z.array(z.string()),
  teams: z.array(z.object({ id: z.string(), name: z.string() })).default([]),
  family_links: z
    .array(z.object({ link_id: z.string(), guardian_id: z.string(), guardian_name: z.string(), household_name: z.string().nullable() }))
    .default([]),
});

export interface MemberRow {
  memberId: string;
  userId: string;
  status: string;
  name: string;
  email: string;
  roles: OrganizationRole[];
  teams: { id: string; name: string }[];
  familyLinks: { linkId: string; guardianId: string; guardianName: string; householdName: string | null }[];
}

export async function listMembers(orgId: string, opts: { q?: string; page?: number }) {
  const supabase = await createClient();
  const page = Math.max(1, opts.page ?? 1);
  const { data, error } = await supabase.rpc("list_org_members", {
    p_organization_id: orgId,
    p_q: opts.q ?? undefined,
    p_limit: MEMBERS_PAGE_SIZE,
    p_offset: (page - 1) * MEMBERS_PAGE_SIZE,
  });
  if (error) throw new Error(`Could not load members: ${error.message}`);
  const parsed = z.object({ total: z.number(), rows: z.array(memberRowSchema) }).parse(data);
  return {
    total: parsed.total,
    page,
    pageSize: MEMBERS_PAGE_SIZE,
    rows: parsed.rows.map<MemberRow>((r) => ({
      memberId: r.member_id,
      userId: r.user_id,
      status: r.status,
      name: r.full_name || r.email || "Unknown user",
      email: r.email ?? "",
      roles: r.roles.filter(isOrganizationRole),
      teams: r.teams,
      familyLinks: r.family_links.map((l) => ({ linkId: l.link_id, guardianId: l.guardian_id, guardianName: l.guardian_name, householdName: l.household_name })),
    })),
  };
}

export async function listPendingInvitations(orgId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_invitations")
    .select("id, email, role_keys, created_at, last_sent_at, send_count, expires_at")
    .eq("organization_id", orgId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .range(0, 199);
  if (error) throw new Error(`Could not load invitations: ${error.message}`);
  return data.map((i) => ({ ...i, roles: i.role_keys.filter(isOrganizationRole), expired: new Date(i.expires_at) < new Date() }));
}
