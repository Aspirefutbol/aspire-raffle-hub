import { redirect } from "next/navigation";

export default async function OrgIndex({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  redirect(`/o/${orgSlug}/dashboard`);
}
