"use client";

import { Mail } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form-controls";
import { type LoginState, sendMagicLink, signInWithPassword } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [mode, setMode] = useState<"password" | "link">("password");
  const [pwState, pwAction, pwPending] = useActionState<LoginState, FormData>(signInWithPassword, {});
  const [linkState, linkAction, linkPending] = useActionState<LoginState, FormData>(sendMagicLink, {});
  const state = mode === "password" ? pwState : linkState;

  return (
    <form action={mode === "password" ? pwAction : linkAction} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <Field label="Email" htmlFor="email">
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.email}
          aria-invalid={Boolean(state.error) || undefined}
        />
      </Field>
      {mode === "password" && (
        <Field label="Password" htmlFor="password">
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </Field>
      )}

      {state.error && (
        <p role="alert" className="rounded-control bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.info && (
        <p role="status" className="rounded-control bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {state.info}
        </p>
      )}

      {mode === "password" ? (
        <Button type="submit" className="w-full" loading={pwPending}>
          Sign in
        </Button>
      ) : (
        <Button type="submit" className="w-full" loading={linkPending} icon={<Mail className="size-4" />}>
          Email me a sign-in link
        </Button>
      )}

      <button
        type="button"
        onClick={() => setMode(mode === "password" ? "link" : "password")}
        className="w-full text-center text-sm font-medium text-brand-700 hover:underline"
      >
        {mode === "password" ? "Email me a sign-in link instead" : "Sign in with a password instead"}
      </button>
    </form>
  );
}
