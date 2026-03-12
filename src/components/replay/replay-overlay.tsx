"use client";

/**
 * ReplayOverlay — shows engine reasoning for the current replay action.
 *
 * Displays situation key badge, action badge, and reasoning metrics.
 * Falls back to a simple action label for manual/system events.
 */
import { cn } from "@/lib/utils";
import type { HandEvent, DecisionSnapshot } from "../../../convex/lib/audit/types";
import { formatBB, formatSituationKey } from "@/lib/format";

const ACTION_BADGE: Record<string, { bg: string; label: string }> = {
  fold: { bg: "bg-gray-500", label: "Fold" },
  check: { bg: "bg-gray-400", label: "Check" },
  call: { bg: "bg-blue-400", label: "Call" },
  bet: { bg: "bg-amber-400", label: "Bet" },
  raise: { bg: "bg-amber-500", label: "Raise" },
  all_in: { bg: "bg-red-500", label: "All-In" },
};

export interface ReplayOverlayProps {
  event: HandEvent | null;
  decision: DecisionSnapshot | null;
  bigBlind: number;
  seatLabel?: string;
}

export function ReplayOverlay({
  event,
  decision,
  bigBlind,
  seatLabel,
}: ReplayOverlayProps) {
  if (!event) {
    return (
      <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] px-4 py-3 text-center">
        <span className="text-xs text-[var(--muted-foreground)]">
          Initial state — blinds posted
        </span>
      </div>
    );
  }

  const badge = ACTION_BADGE[event.actionType] ?? { bg: "bg-gray-400", label: event.actionType };
  const amountBB = event.amount ? formatBB(event.amount / bigBlind) : null;
  const label = seatLabel ?? `Seat ${event.seatIndex}`;

  return (
    <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden">
      <div className="px-4 py-2 border-b border-[var(--border)] bg-[var(--muted)]/30">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--gold-dim)]">
          Action
        </h3>
      </div>

      <div className="px-4 py-3 space-y-2">
        {/* Action line */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[var(--foreground)]">
            {label}
          </span>
          <span className={cn(
            "text-[10px] font-bold text-white px-2 py-0.5 rounded",
            badge.bg,
          )}>
            {badge.label}
          </span>
          {amountBB && (
            <span className="text-xs text-[var(--gold)] font-semibold tabular-nums">
              {amountBB} BB
            </span>
          )}
          <span className="flex-1" />
          <span className="text-[10px] text-[var(--muted-foreground)]">
            {event.source === "engine" ? "Auto" : event.source === "manual" ? "Manual" : "System"}
          </span>
        </div>

        {/* Engine reasoning */}
        {decision && (
          <div className="space-y-1.5 pt-1 border-t border-[var(--border)]">
            {/* Situation + Engine badges */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40">
                {formatSituationKey(decision.situationKey)}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--muted)]/40 text-[var(--muted-foreground)] border border-[var(--border)]">
                {decision.engineId}
              </span>
              {decision.reasoning.isBluff && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/40 animate-pulse">
                  BLUFF
                </span>
              )}
            </div>

            {/* Reasoning metrics strip */}
            <div className="flex items-center gap-3 text-[10px] text-[var(--muted-foreground)]">
              {decision.reasoning.handStrength !== undefined && (
                <span>
                  Hand: <span className="text-[var(--foreground)] font-medium">{(decision.reasoning.handStrength * 100).toFixed(0)}%</span>
                </span>
              )}
              {decision.reasoning.potOdds !== undefined && (
                <span>
                  Odds: <span className="text-[var(--foreground)] font-medium">{(decision.reasoning.potOdds * 100).toFixed(0)}%</span>
                </span>
              )}
              {decision.reasoning.foldLikelihood !== undefined && (
                <span>
                  FoldEQ: <span className="text-[var(--foreground)] font-medium">{(decision.reasoning.foldLikelihood * 100).toFixed(0)}%</span>
                </span>
              )}
              {decision.reasoning.mdf !== undefined && (
                <span>
                  MDF: <span className="text-[var(--foreground)] font-medium">{(decision.reasoning.mdf * 100).toFixed(0)}%</span>
                </span>
              )}
            </div>

            {/* Draw info */}
            {decision.reasoning.drawInfo && decision.reasoning.drawInfo.totalOuts > 0 && (
              <div className="flex items-center gap-1.5">
                {decision.reasoning.drawInfo.hasFlushDraw && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/40">
                    FLUSH DRAW
                  </span>
                )}
                {decision.reasoning.drawInfo.hasStraightDraw && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-500/20 text-green-300 border border-green-500/40">
                    STR DRAW
                  </span>
                )}
                <span className="text-[10px] text-[var(--muted-foreground)]">
                  {decision.reasoning.drawInfo.totalOuts} outs
                </span>
              </div>
            )}

            {/* Explanation summary */}
            <p className="text-[11px] text-[var(--muted-foreground)] leading-relaxed">
              {decision.explanationSummary}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
