"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form-controls";
import { completeWelcome, type WelcomeState } from "./actions";

export function WelcomeForm({ defaultName }: { defaultName: string }) {
  const [state, action, pending] = useActionState<WelcomeState, FormData>(completeWelcome, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      <Field label="Your name" htmlFor="full_name" required>
        <Input id="full_name" name="full_name" autoComplete="name" defaultValue={defaultName} required />
      </Field>
      <Field label="Password (optional)" htmlFor="password" hint="Set one to sign in with a password. Otherwise use email sign-in links.">
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} />
      </Field>
      {state.error && (
        <p role="alert" className="rounded-control bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}
      <Button type="submit" size="lg" className="w-full" loading={pending}>Continue</Button>
    </form>
  );
}
