"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/form-controls";
import { Sheet } from "@/components/ui/sheet";
import { enrollCampaignPlayers } from "@/lib/fundraising/actions";
import { dollarsToCents } from "@/lib/fundraising/money";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { lookupPlayers } from "@/lib/roster/actions";

type Team = { id: string; name: string; player_count: number };
type FoundPlayer = { id: string | null; first_name: string | null; last_name: string | null; preferred_name: string | null; team_name: string | null };

export function EnrollmentButton({ orgSlug, campaignId, teams }: { orgSlug: string; campaignId: string; teams: Team[] }) {
  const [open, setOpen] = useState(false);
  return <><Button onClick={() => setOpen(true)}>Enroll players</Button>{open && <EnrollmentSheet orgSlug={orgSlug} campaignId={campaignId} teams={teams} onClose={() => setOpen(false)} />}</>;
}

function EnrollmentSheet({ orgSlug, campaignId, teams, onClose }: { orgSlug: string; campaignId: string; teams: Team[]; onClose: () => void }) {
  const [mode, setMode] = useState("teams");
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [selectedPlayers, setSelectedPlayers] = useState<Map<string, string>>(new Map());
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoundPlayer[]>([]);
  const [searching, startSearch] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { run, pending } = useActionRunner();
  useEffect(() => {
    if (mode !== "players") return;
    let current = true;
    const timer = setTimeout(() => startSearch(async () => {
      const result = await lookupPlayers(orgSlug, { q: query });
      if (current) { setResults(result.ok ? result.data : []); if (!result.ok) setError(result.error); }
    }), 250);
    return () => { current = false; clearTimeout(timer); };
  }, [mode, orgSlug, query]);

  const selected = mode === "all" || (mode === "teams" ? selectedTeams.length > 0 : selectedPlayers.size > 0);
  return <Sheet open onClose={() => !pending && onClose()} title="Enroll players" description="Use your master roster. Existing active participants will not be duplicated." footer={<div className="flex justify-end gap-2"><Button variant="secondary" disabled={pending} onClick={onClose}>Cancel</Button><Button type="submit" form="campaign-enrollment" disabled={!selected} loading={pending}>Enroll players</Button></div>}>
    <form id="campaign-enrollment" className="space-y-5" onSubmit={(event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const input = String(form.get("goal") ?? "").trim();
      const goal = input ? dollarsToCents(input) : null;
      if (input && goal === null) { setError("Enter a player goal with up to two decimal places."); return; }
      setError(null);
      run(() => enrollCampaignPlayers(orgSlug, { campaign_id: campaignId, all_active: mode === "all", team_ids: mode === "teams" ? selectedTeams : [], player_ids: mode === "players" ? [...selectedPlayers.keys()] : [], goal_amount_cents: goal }), { onSuccess: onClose });
    }}>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <fieldset disabled={pending} className="space-y-3"><legend className="mb-2 text-sm font-semibold text-ink">Who should participate?</legend>{[["all", "All active players"], ["teams", "Selected teams"], ["players", "Selected players"]].map(([value, label]) => <label key={value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control border border-line px-3"><input type="radio" name="enrollment-mode" value={value} checked={mode === value} onChange={() => setMode(value ?? "teams")} className="size-4 accent-brand-600 pointer-coarse:size-5" />{label}</label>)}</fieldset>
      {mode === "teams" && <fieldset disabled={pending} className="rounded-control border border-line"><legend className="sr-only">Teams</legend>{teams.length === 0 && <p className="p-3 text-sm text-muted">No active teams available.</p>}{teams.map((team) => <label key={team.id} className="flex min-h-11 cursor-pointer items-center gap-3 border-b border-line px-3 py-2 last:border-0"><Checkbox checked={selectedTeams.includes(team.id)} onChange={(event) => setSelectedTeams(event.target.checked ? [...selectedTeams, team.id] : selectedTeams.filter((id) => id !== team.id))} /><span className="flex-1 text-sm">{team.name}</span><span className="text-xs text-muted">{team.player_count} players</span></label>)}</fieldset>}
      {mode === "players" && <div className="space-y-3"><Field label="Search players" htmlFor="enrollment-player-search" hint="Only active players can enroll."><Input id="enrollment-player-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search players by name" /></Field><p className="text-xs text-muted">{selectedPlayers.size} selected{selectedPlayers.size ? `: ${[...selectedPlayers.values()].join(", ")}` : ""}</p><ul aria-busy={searching} className="divide-y divide-line rounded-control border border-line">{results.length === 0 && <li className="p-3 text-sm text-muted">{searching ? "Searching…" : "No players found"}</li>}{results.map((player) => player.id && <li key={player.id}><label className="flex min-h-11 cursor-pointer items-center gap-3 p-3"><Checkbox disabled={pending} checked={selectedPlayers.has(player.id)} onChange={(event) => { const next = new Map(selectedPlayers); const name = `${player.preferred_name || player.first_name} ${player.last_name}`; if (event.target.checked) next.set(player.id!, name); else next.delete(player.id!); setSelectedPlayers(next); }} /><span className="text-sm"><span className="block">{player.preferred_name || player.first_name} {player.last_name}</span><span className="text-xs text-muted">{player.team_name ?? "No team"}</span></span></label></li>)}</ul></div>}
      <Field label="Player goal override ($)" htmlFor="enrollment-goal" hint="Optional. Blank uses the campaign’s default player goal."><Input id="enrollment-goal" name="goal" inputMode="decimal" placeholder="Use campaign default" disabled={pending} /></Field>
      <p className="text-xs text-muted">Only active, unarchived players in this organization are enrolled. Team and household are recorded at enrollment.</p>
    </form>
  </Sheet>;
}
