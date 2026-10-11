import { redirect } from "next/navigation";

export default async function PeopleIndex({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  redirect(`/o/${orgSlug}/people/players`);
}
