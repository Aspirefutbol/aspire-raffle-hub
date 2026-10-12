import { z } from "zod";
import { ORGANIZATION_ROLES } from "@/lib/permissions";
import { id, optionalText } from "@/lib/validation";
import { emailSchema } from "./email";

export const rolesSchema = z
  .array(z.enum(ORGANIZATION_ROLES))
  .min(1, "Choose at least one role.")
  .max(ORGANIZATION_ROLES.length)
  .transform((roles) => [...new Set(roles)]);

export const addMemberSchema = z.object({
  email: emailSchema,
  roles: rolesSchema,
  reason: optionalText(300),
});
export type AddMemberInput = z.input<typeof addMemberSchema>;

export const setRolesSchema = z.object({ member_id: id, roles: rolesSchema, reason: optionalText(300) });
export const memberStatusSchema = z.object({ member_id: id, status: z.enum(["active", "suspended"]), reason: optionalText(300) });
export const invitationSchema = z.object({ invitation_id: id, reason: optionalText(300) });

export const memberTeamsSchema = z.object({
  member_id: id,
  team_ids: z.array(id).max(50).transform((ids) => [...new Set(ids)]),
  reason: optionalText(300),
});
export const linkGuardianSchema = z.object({ member_id: id, guardian_id: id, reason: optionalText(300) });
export const unlinkGuardianSchema = z.object({ link_id: id, reason: optionalText(300) });
