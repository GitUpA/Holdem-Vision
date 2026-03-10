"use client";

import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import type { UnifiedSeatConfig } from "@/hooks/use-hand-manager";
import type { SelectionTarget } from "@/hooks/use-hand-manager";
import type { OpponentAnalysis } from "../../../convex/lib/analysis/opponentRead";
import type { CardIndex } from "../../../convex/lib/types/cards";
import { rankOf, suitOf } from "../../../convex/lib/primitives/card";
import { ProfilePicker } from "./profile-picker";
import { ExplanationTree } from "../analysis/explanation-tree";

interface OpponentDetailProps {
  seat: UnifiedSeatConfig;
  analysis?: OpponentAnalysis;
  onAssignProfile: (profile: import("../../../convex/lib/types/opponents").OpponentProfile | undefined) => void;
  onClose: () => void;
  /** Card assignment */
  onReveal?: () => void;
  onHide?: () => void;
  onStartCardAssign?: () => void;
  selectionTarget?: SelectionTarget;
  villainCardBuffer?: CardIndex[];
}

const SUIT_SYMBOLS: Record<string, string> = { c: "\u2663", d: "\u2666", h: "\u2665", s: "\u2660" };
const SUIT_COLORS: Record<string, string> = { c: "text-gray-900", d: "text-red-600", h: "text-red-600", s: "text-gray-900" };

function MiniCardSlot({ card, onClick, buffering }: { card?: CardIndex; onClick?: () => void; buffering?: boolean }) {
  if (card !== undefined) {
    const rank = rankOf(card);
    const suit = suitOf(card);
    return (
      <div className="w-10 h-14 rounded-md bg-white flex flex-col items-center justify-center text-sm font-bold border-2 border-[var(--gold-dim)]/40">
        <span className={SUIT_COLORS[suit]}>{rank}</span>
        <span className={cn("text-[10px] -mt-1", SUIT_COLORS[suit])}>{SUIT_SYMBOLS[suit]}</span>
      </div>
    );
  }
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-10 h-14 rounded-md border-2 border-dashed flex items-center justify-center text-sm transition-colors",
        buffering
          ? "border-[var(--gold)] text-[var(--gold)] bg-[var(--gold)]/5"
          : "border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--gold-dim)] hover:text-[var(--gold-dim)]",
      )}
    >
      ?
    </button>
  );
}

export function OpponentDetail({
  seat,
  analysis,
  onAssignProfile,
  onClose,
  onReveal,
  onHide,
  onStartCardAssign,
  selectionTarget,
  villainCardBuffer,
}: OpponentDetailProps) {
  const posShort = seat.position.toUpperCase();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)] bg-[var(--muted)]/30">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[var(--foreground)]">
            {seat.label}
          </span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--muted)] text-[var(--muted-foreground)]">
            {posShort}
          </span>
          {seat.profile && (
            <span className="text-xs text-[var(--gold-dim)]">
              {seat.profile.name}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors px-1.5"
        >
          Close
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Profile selector */}
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)] mb-2">
            Profile
          </h4>
          <ProfilePicker
            currentProfile={seat.profile}
            onSelect={onAssignProfile}
          />
        </div>

        {/* Card assignment + visibility */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
              Cards
            </h4>
            <div className="flex gap-1">
              {seat.cardVisibility === "hidden" ? (
                <button
                  onClick={onReveal}
                  className="text-[10px] px-2 py-0.5 rounded bg-[var(--gold)]/10 text-[var(--gold-dim)] hover:bg-[var(--gold)]/20 transition-colors"
                >
                  Reveal
                </button>
              ) : (
                <button
                  onClick={onHide}
                  className="text-[10px] px-2 py-0.5 rounded bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--muted)]/80 transition-colors"
                >
                  Hide
                </button>
              )}
            </div>
          </div>

          {/* Card slots */}
          <div className="flex items-center gap-2">
            {seat.cardVisibility !== "hidden" && seat.holeCards.length === 2 ? (
              <>
                <MiniCardSlot card={seat.holeCards[0]} />
                <MiniCardSlot card={seat.holeCards[1]} />
                <span className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded ml-1",
                  seat.cardVisibility === "revealed"
                    ? "bg-[var(--equity-win)]/10 text-[var(--equity-win)]"
                    : "bg-[var(--gold)]/10 text-[var(--gold-dim)]",
                )}>
                  {seat.cardVisibility === "revealed" ? "Visible" : "Assigned"}
                </span>
              </>
            ) : (
              <>
                <MiniCardSlot
                  card={villainCardBuffer?.[0]}
                  onClick={onStartCardAssign}
                  buffering={selectionTarget === `villain-${seat.seatIndex}`}
                />
                <MiniCardSlot
                  card={villainCardBuffer?.[1]}
                  onClick={onStartCardAssign}
                  buffering={selectionTarget === `villain-${seat.seatIndex}`}
                />
                {selectionTarget === `villain-${seat.seatIndex}` ? (
                  <span className="text-[10px] text-[var(--gold)] ml-1 animate-pulse">
                    Pick from grid {"\u2193"}
                  </span>
                ) : (
                  <button
                    onClick={onStartCardAssign}
                    className="text-[10px] text-[var(--muted-foreground)] hover:text-[var(--gold-dim)] transition-colors ml-1"
                  >
                    Assign cards
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Action history (read-only — actions come from the state machine) */}
        {seat.actions.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)] mb-2">
              History
            </h4>
            <div className="flex flex-wrap gap-1">
              {seat.actions.map((action, i) => (
                <span
                  key={i}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--muted)] text-[var(--muted-foreground)] border border-[var(--border)]"
                >
                  {action.street}: {action.actionType}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Analysis results */}
        <AnimatePresence>
          {analysis && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-3"
            >
              {/* REPRESENTING section */}
              <div className="border-t border-[var(--border)] pt-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--gold-dim)] mb-2">
                  Representing (~{analysis.rangePct.toFixed(0)}% range)
                </h4>
                <ExplanationTree
                  node={analysis.rangeExplanation}
                  defaultOpen={false}
                />
              </div>

              {/* EQUITY section */}
              <div className="border-t border-[var(--border)] pt-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--gold-dim)] mb-2">
                  Your equity vs their range
                </h4>
                <EquityBar equity={analysis.equityAgainst.win} />
              </div>

              {/* FOLD EQUITY section */}
              {analysis.foldEquity && analysis.foldEquity.length > 0 && (
                <div className="border-t border-[var(--border)] pt-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--gold-dim)] mb-2">
                    If you bet
                  </h4>
                  <div className="space-y-1.5">
                    {analysis.foldEquity.map((scenario) => (
                      <FoldEquityRow
                        key={scenario.betSizePct}
                        betSizePct={scenario.betSizePct}
                        betBB={scenario.result.betBB}
                        foldPct={scenario.result.foldProbability * 100}
                        ev={scenario.result.betEV}
                        recommendation={scenario.result.recommendation}
                      />
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </motion.div>
  );
}

function EquityBar({ equity }: { equity: number }) {
  const pct = equity * 100;
  const color =
    pct >= 55 ? "bg-[var(--equity-win)]" : pct >= 45 ? "bg-[var(--equity-tie)]" : "bg-[var(--equity-lose)]";
  const label =
    pct >= 55 ? "Ahead" : pct >= 45 ? "Even" : "Behind";

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2.5 bg-[var(--muted)] rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          className={cn("h-full rounded-full", color)}
        />
      </div>
      <span className="text-xs font-bold tabular-nums min-w-[44px] text-right">
        {pct.toFixed(0)}%
      </span>
      <span className={cn(
        "text-[10px] font-medium",
        pct >= 55 ? "text-[var(--equity-win)]" : pct >= 45 ? "text-[var(--equity-tie)]" : "text-[var(--equity-lose)]",
      )}>
        {label}
      </span>
    </div>
  );
}

const RECOMMENDATION_CONFIG: Record<
  "bet" | "check" | "marginal",
  { bg: string; text: string; border: string; label: string; tooltip: string }
> = {
  bet: {
    bg: "bg-[var(--equity-win)]",
    text: "text-[var(--equity-win)]",
    border: "border-[var(--equity-win)]/40",
    label: "BET",
    tooltip: "Positive EV — betting is profitable here",
  },
  check: {
    bg: "bg-[var(--equity-lose)]",
    text: "text-[var(--equity-lose)]",
    border: "border-[var(--equity-lose)]/40",
    label: "CHECK",
    tooltip: "Negative EV — checking is better here",
  },
  marginal: {
    bg: "bg-[var(--equity-tie)]",
    text: "text-[var(--equity-tie)]",
    border: "border-[var(--equity-tie)]/40",
    label: "CLOSE",
    tooltip: "Marginal EV — close to break-even",
  },
};

function FoldEquityRow({
  betSizePct,
  betBB,
  foldPct,
  ev,
  recommendation,
}: {
  betSizePct: number;
  betBB: number;
  foldPct: number;
  ev: number;
  recommendation: "bet" | "check" | "marginal";
}) {
  const evSign = ev >= 0 ? "+" : "";
  const cfg = RECOMMENDATION_CONFIG[recommendation];

  return (
    <div className={cn(
      "flex items-center gap-2.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors",
      cfg.border,
      `${cfg.bg}/[0.06]`,
    )}>
      {/* Recommendation badge */}
      <span
        className={cn(
          "inline-flex items-center justify-center w-[52px] py-0.5 rounded text-[10px] font-bold tracking-wider text-white shrink-0",
          cfg.bg,
        )}
        title={cfg.tooltip}
      >
        {cfg.label}
      </span>

      <span className="text-[var(--muted-foreground)] min-w-[52px]">
        {betSizePct}% pot
      </span>
      <span className="text-[var(--foreground)] tabular-nums min-w-[44px]">
        {betBB.toFixed(1)}BB
      </span>
      <span className="text-[var(--muted-foreground)] tabular-nums min-w-[52px]">
        fold {foldPct.toFixed(0)}%
      </span>
      <span className={cn("font-bold tabular-nums ml-auto", cfg.text)}>
        {evSign}{ev.toFixed(1)}BB
      </span>
    </div>
  );
}
