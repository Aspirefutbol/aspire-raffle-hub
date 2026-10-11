"use client";

import { CalendarRange, Plus, Star } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, Input } from "@/components/ui/form-controls";
import { Sheet } from "@/components/ui/sheet";
import { formatDate } from "@/lib/format";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { createSeason, setCurrentSeason } from "@/lib/settings/actions";

export function SeasonsCard({ orgSlug, seasons, canEdit }: {
  orgSlug: string;
  seasons: Array<{ id: string; name: string; is_current: boolean; starts_on: string | null; ends_on: string | null }>;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", starts_on: "", ends_on: "", make_current: true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { run, pending } = useActionRunner();

  return (
    <Card>
      <CardHeader
        title="Seasons"
        description="Teams belong to a season, so team history is kept year to year."
        action={canEdit && <Button size="sm" variant="subtle" icon={<Plus className="size-3.5" />} onClick={() => { setForm({ name: "", starts_on: "", ends_on: "", make_current: true }); setErrors({}); setOpen(true); }}>New season</Button>}
      />
      {seasons.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted">No seasons yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {seasons.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-4 py-2.5">
              <CalendarRange aria-hidden className="size-4 text-muted" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{s.name}</p>
                <p className="text-xs text-muted">{s.starts_on || s.ends_on ? `${formatDate(s.starts_on)} – ${formatDate(s.ends_on)}` : "No dates"}</p>
              </div>
              {s.is_current ? (
                <Badge tone="success">Current</Badge>
              ) : (
                canEdit && (
                  <Button size="sm" variant="ghost" icon={<Star className="size-3.5" />} disabled={pending} onClick={() => run(() => setCurrentSeason(orgSlug, s.id))}>
                    Make current
                  </Button>
                )
              )}
            </li>
          ))}
        </ul>
      )}
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="New season"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button loading={pending} onClick={() => run(() => createSeason(orgSlug, form), { onSuccess: () => setOpen(false), onError: (fe) => setErrors(fe ?? {}) })}>
              Create season
            </Button>
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name" htmlFor="season_name" required error={errors.name} className="col-span-2" hint="e.g. 2027–28">
            <Input id="season_name" autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Starts" htmlFor="season_start">
            <Input id="season_start" type="date" value={form.starts_on} onChange={(e) => setForm({ ...form, starts_on: e.target.value })} />
          </Field>
          <Field label="Ends" htmlFor="season_end" error={errors.ends_on}>
            <Input id="season_end" type="date" value={form.ends_on} onChange={(e) => setForm({ ...form, ends_on: e.target.value })} />
          </Field>
          <label className="col-span-2 flex items-center gap-2 text-sm text-ink-soft">
            <Checkbox checked={form.make_current} onChange={(e) => setForm({ ...form, make_current: e.target.checked })} />
            Make this the current season
          </label>
        </div>
      </Sheet>
    </Card>
  );
}
