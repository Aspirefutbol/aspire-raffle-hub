"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ArrowLeft, BarChart3, Inbox, Share2 } from "lucide-react";

export type ParentTouchPlayer = {
  id: string;
  playerId: string;
  name: string;
  team: string | null;
  raised: string;
  ticketsSold: number;
  share: ReactNode | null;
  saleButton: ReactNode;
  saleUnavailable: string | null;
  progress: ReactNode;
};

type Task = "home" | "share" | "progress";

/**
 * Presentation-only focus layer. RLS-filtered player data and the existing
 * audited share/sale components are provided by the server. Switching tasks
 * hides rather than unmounts SellerTools, so an already-created share link is
 * not silently discarded or re-created.
 */
export function ParentTouchTasks({ players, requestsHref }: {
  players: ParentTouchPlayer[];
  requestsHref: string;
}) {
  const [selectedId, setSelectedId] = useState(players[0]?.id ?? "");
  const [task, setTask] = useState<Task>("home");
  const selected = players.find((player) => player.id === selectedId) ?? players[0];
  if (!selected) return null;

  return (
    <div data-testid="parent-touch-tasks" className="space-y-4">
      {players.length > 1 && (
        <nav aria-label="Choose player" className="grid grid-cols-2 gap-3">
          {players.map((player) => (
            <button key={player.id} type="button" aria-pressed={selected.id === player.id}
              onClick={() => { setSelectedId(player.id); setTask("home"); }}
              className={`min-h-14 min-w-0 rounded-card border px-3 py-3 text-left text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 ${selected.id === player.id ? "border-brand-400 bg-brand-50 text-brand-800" : "border-line bg-surface text-ink"}`}>
              <span className="block break-words">{player.name}</span>
            </button>
          ))}
        </nav>
      )}
      {players.map((player) => (
        <article key={player.id} hidden={selected.id !== player.id} data-testid="family-player-card"
          data-player-id={player.playerId} className="min-w-0 rounded-card border border-line bg-canvas/40 p-4">
          <header className="mb-4">
            <h3 className="break-words text-lg font-semibold text-ink">{player.name}</h3>
            {player.team && <p className="mt-0.5 text-xs text-muted">{player.team}</p>}
            <p className="mt-2 text-sm font-semibold text-ink">
              <span className="tabular">{player.raised}</span> raised
              <span aria-hidden="true" className="mx-2 text-muted">·</span>
              <span className="tabular">{player.ticketsSold}</span> tickets sold
            </p>
          </header>
          {task === "home" && (
            <nav data-testid="touch-dashboard" aria-label={`Raffle actions for ${player.name}`}
              className="grid grid-cols-2 gap-3">
              <button type="button" disabled={!player.share} onClick={() => setTask("share")}
                className="flex min-h-24 min-w-0 flex-col items-center justify-center gap-2 rounded-card border border-brand-200 bg-brand-50 px-3 py-4 text-center text-base font-semibold text-brand-800 shadow-card disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2">
                <Share2 aria-hidden className="size-6" /> Share raffle
              </button>
              <Link href={requestsHref}
                className="flex min-h-24 min-w-0 flex-col items-center justify-center gap-2 rounded-card border border-line-strong bg-surface px-3 py-4 text-center text-base font-semibold text-ink shadow-card focus-visible:outline-2 focus-visible:outline-offset-2">
                <Inbox aria-hidden className="size-6" /> Requests
              </Link>
              {player.saleButton}
              <button type="button" onClick={() => setTask("progress")}
                className="flex min-h-24 min-w-0 flex-col items-center justify-center gap-2 rounded-card border border-line-strong bg-surface px-3 py-4 text-center text-base font-semibold text-ink shadow-card focus-visible:outline-2 focus-visible:outline-offset-2">
                <BarChart3 aria-hidden className="size-6" /> My progress
              </button>
            </nav>
          )}
          {task === "home" && player.saleUnavailable && <p className="mt-3 text-sm text-muted">{player.saleUnavailable}</p>}
          <section hidden={task !== "share"} data-testid="parent-share-task" className="space-y-3">
            <button type="button" onClick={() => setTask("home")}
              className="inline-flex min-h-12 items-center gap-2 rounded-control px-2 text-sm font-semibold text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2">
              <ArrowLeft aria-hidden className="size-5" /> Back to actions
            </button>
            {player.share}
          </section>
          <section hidden={task !== "progress"} data-testid="parent-progress-task" className="space-y-3">
            <button type="button" onClick={() => setTask("home")}
              className="inline-flex min-h-12 items-center gap-2 rounded-control px-2 text-sm font-semibold text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2">
              <ArrowLeft aria-hidden className="size-5" /> Back to actions
            </button>
            <h4 className="text-base font-semibold text-ink">My progress</h4>
            {player.progress}
          </section>
        </article>
      ))}
    </div>
  );
}
