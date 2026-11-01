"use client";

import Link from "next/link";
import { createContext, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, BarChart3, Inbox, Share2 } from "lucide-react";

export type QuickShareAction = (onCopied: (feedback: string) => void, onFallback: () => void) => boolean;
export const ParentQuickShareContext = createContext<((participantId: string, action: QuickShareAction | null) => void) | null>(null);

export type ParentTouchPlayer = {
  id: string;
  playerId: string;
  name: string;
  team: string | null;
  raised: string;
  ticketsSold: number;
  goal: ReactNode | null;
  share: ReactNode | null;
  saleButton: ReactNode;
  saleUnavailable: string | null;
  progress: ReactNode;
};

type Task = "home" | "share" | "progress";

/**
 * Presentation-only focus layer. RLS-filtered player data and the existing
 * audited share/sale components are provided by the server. Switching tasks
 * hides rather than unmounts SellerTools or RecordSaleButton, so an already-created share link is
 * not silently discarded or re-created.
 */
export function ParentTouchTasks({ players, requestsHref }: {
  players: ParentTouchPlayer[];
  requestsHref: string;
}) {
  const [selectedId, setSelectedId] = useState(players[0]?.id ?? "");
  const [task, setTask] = useState<Task>("home");
  const containerRef = useRef<HTMLDivElement>(null);
  const articles = useRef(new Map<string, HTMLElement>());
  const hasMounted = useRef(false);
  const shareActions = useRef(new Map<string, QuickShareAction>());
  const [shareFeedback, setShareFeedback] = useState("");
  const registerQuickShare = useCallback((id: string, action: QuickShareAction | null) => {
    if (action) shareActions.current.set(id, action);
    else shareActions.current.delete(id);
  }, []);
  const returnFocusTask = useRef<"share" | "progress" | null>(null);
  const selected = players.find((player) => player.id === selectedId) ?? players[0];
  const storageKey = `aspire:parent-selected-player:${requestsHref}`;

  // Remember only an authorized participant ID within this browser tab and
  // fundraiser. Never store a seller token, sharing URL, or financial record.
  useEffect(() => {
    try {
      const remembered = window.sessionStorage.getItem(storageKey);
      if (remembered && players.some((player) => player.id === remembered)) {
        // Hydrate the remembered choice after mount, not during the effect.
        const timer = window.setTimeout(() => setSelectedId(remembered), 0);
        return () => window.clearTimeout(timer);
      }
    } catch {
      // Private browsing can block storage; the chooser still works.
    }
  }, [players, storageKey]);

  function selectPlayer(id: string) {
    setShareFeedback("");
    returnFocusTask.current = null;
    setSelectedId(id);
    setTask("home");
    try { window.sessionStorage.setItem(storageKey, id); } catch {
      // An unavailable browser store must never block navigation.
    }
  }

  function backToActions() {
    returnFocusTask.current = task === "share" || task === "progress" ? task : null;
    setTask("home");
  }

  // Keep focus on a visible control after the home tiles disappear. Also move
  // the task back into view if the parent was scrolled down in the previous task.
  // Do neither on initial render (including a direct link to the fundraiser).
  useEffect(() => {
    if (!hasMounted.current) { hasMounted.current = true; return; }
    const article = articles.current.get(selectedId);
    if (!article) return;
    const focusTarget = task === "home"
      ? article.querySelector<HTMLElement>(returnFocusTask.current
        ? `[data-parent-${returnFocusTask.current}-trigger]`
        : "[data-parent-player-heading]")
      : article.querySelector<HTMLElement>(`[data-testid="parent-${task}-task"] [data-parent-back]`);
    containerRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
    focusTarget?.focus({ preventScroll: true });
    if (task === "home") returnFocusTask.current = null;
  }, [selectedId, task]);
  if (!selected) return null;

  return (
    <ParentQuickShareContext.Provider value={registerQuickShare}>
    <div ref={containerRef} data-testid="parent-touch-tasks" className="scroll-mt-24 space-y-4">
      {players.length > 1 && (
        <nav aria-label="Choose player" className="grid grid-cols-2 gap-3">
          {players.map((player) => (
            <button key={player.id} type="button" aria-pressed={selected.id === player.id}
              onClick={() => selectPlayer(player.id)}
              className={`min-h-14 min-w-0 rounded-card border px-3 py-3 text-left text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 ${selected.id === player.id ? "border-brand-400 bg-brand-50 text-brand-800" : "border-line bg-surface text-ink"}`}>
              <span className="block break-words">{player.name}</span>
            </button>
          ))}
        </nav>
      )}
      {players.map((player) => (
        <article key={player.id} hidden={selected.id !== player.id} data-testid="family-player-card"
          ref={(node) => { if (node) articles.current.set(player.id, node); else articles.current.delete(player.id); }}
          data-player-id={player.playerId} className="min-w-0 rounded-card border border-line bg-canvas/40 p-4">
          <header className="mb-3">
            <h3 tabIndex={-1} data-parent-player-heading className="break-words text-lg font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-2">{player.name}</h3>
            {player.team && <p className="mt-0.5 text-xs text-muted">{player.team}</p>}
          </header>
          <section hidden={task !== "home"} data-testid="parent-progress-summary" aria-label={`My progress for ${player.name}`}
            className="mb-4 min-w-0 rounded-card border border-brand-200 bg-brand-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-800">My progress</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="min-w-0">
                <p className="text-xs text-ink-soft">Raised</p>
                <p data-testid="parent-amount-raised" className="mt-1 break-words text-2xl font-bold tabular text-ink">{player.raised}</p>
              </div>
              <div className="min-w-0">
                <p className="text-xs text-ink-soft">Tickets</p>
                <p data-testid="parent-tickets-sold" className="mt-1 text-2xl font-bold tabular text-ink">{player.ticketsSold}</p>
              </div>
            </div>
            {player.goal && (
              <div data-testid="parent-goal-meter" className="mt-4 border-t border-brand-200 pt-3">
                <p className="mb-1 text-xs font-semibold text-ink-soft">Personal fundraising goal</p>
                {player.goal}
              </div>
            )}
          </section>
          <div hidden={task !== "home"} className="space-y-3">
            <p className="text-sm font-semibold text-ink-soft">How would you like to sell tickets?</p>
            <nav data-testid="touch-dashboard" aria-label={`Raffle actions for ${player.name}`}
              className="grid grid-cols-2 gap-3">
              <button type="button" aria-label="Share raffle" data-parent-share-trigger disabled={!player.share}
                onClick={() => {
                  setShareFeedback("");
                  const action = shareActions.current.get(player.id);
                  if (!action || !action((feedback) => setShareFeedback(feedback), () => setTask("share"))) setTask("share");
                }}
                className="col-span-2 flex min-h-24 min-w-0 items-center justify-center gap-3 rounded-card border border-brand-400 bg-brand-50 px-4 py-4 text-center text-base font-semibold text-brand-800 shadow-card disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2">
                <Share2 aria-hidden className="size-6 shrink-0" />
                <span><span className="block">Share raffle</span>
                  <span className="mt-1 block text-xs font-normal">Friends and family request tickets; no online payment.</span>
                </span>
              </button>
              <Link href={requestsHref} aria-label="Requests"
                className="flex min-h-24 min-w-0 flex-col items-center justify-center gap-2 rounded-card border border-line-strong bg-surface px-3 py-4 text-center text-base font-semibold text-ink shadow-card focus-visible:outline-2 focus-visible:outline-offset-2">
                <Inbox aria-hidden className="size-6" /> Requests
                <span className="text-xs font-normal">Follow up with supporters</span>
              </Link>
              <div className="min-w-0 space-y-2">
                <p className="text-center text-sm font-semibold text-ink">Sell In Person</p>
                {player.saleButton}
                <p className="text-xs text-muted">Record the sale after approved cash or check payment.</p>
              </div>
            </nav>
            {shareFeedback && <p role="status" className="text-sm text-brand-800">{shareFeedback}</p>}
            {player.share && (
              <button type="button" onClick={() => setTask("share")}
                className="inline-flex min-h-11 items-center rounded-control px-2 py-2 text-sm font-medium text-brand-700 underline focus-visible:outline-2 focus-visible:outline-offset-2">
                Sharing link settings
              </button>
            )}
            <button type="button" data-parent-progress-trigger onClick={() => setTask("progress")}
              className="inline-flex min-h-11 items-center gap-2 rounded-control px-2 py-2 text-sm font-semibold text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2">
              <BarChart3 aria-hidden className="size-4" /> View full progress
            </button>
          </div>
          {task === "home" && player.saleUnavailable && <p className="mt-3 text-sm text-muted">{player.saleUnavailable}</p>}
          <section hidden={task !== "share"} data-testid="parent-share-task" className="space-y-3">
            <button type="button" data-parent-back onClick={backToActions}
              className="inline-flex min-h-12 items-center gap-2 rounded-control px-2 text-sm font-semibold text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2">
              <ArrowLeft aria-hidden className="size-5" /> Back to actions
            </button>
            {player.share}
          </section>
          <section hidden={task !== "progress"} data-testid="parent-progress-task" className="space-y-3">
            <button type="button" data-parent-back onClick={backToActions}
              className="inline-flex min-h-12 items-center gap-2 rounded-control px-2 text-sm font-semibold text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2">
              <ArrowLeft aria-hidden className="size-5" /> Back to actions
            </button>
            <h4 className="text-base font-semibold text-ink">My progress</h4>
            {player.progress}
          </section>
        </article>
      ))}
    </div>
    </ParentQuickShareContext.Provider>
  );
}
