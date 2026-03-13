"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { UnifiedSeatConfig } from "@/hooks/use-hand-manager";
import type { AutoPlayDecision } from "../../../convex/lib/opponents/autoPlay";
import { rankOf, suitOf } from "../../../convex/lib/primitives/card";
import type { CardIndex } from "../../../convex/lib/types/cards";
import { formatBB } from "@/lib/format";

interface PlayerListProps {
  seats: UnifiedSeatConfig[];
  selectedSeat: number | null;
  onSeatClick: (seatIndex: number) => void;
  bigBlind?: number;
  activePlayerSeat?: number | null;
  decisions?: ReadonlyMap<number, AutoPlayDecision>;
}

const POSITION_COLORS: Record<string, string> = {
  btn: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  sb: "bg-blue-500/20 text-blue-300 border-blue-500/40",
  bb: "bg-blue-500/20 text-blue-300 border-blue-500/40",
  utg: "bg-red-500/20 text-red-300 border-red-500/40",
  utg1: "bg-red-500/20 text-red-300 border-red-500/40",
  utg2: "bg-orange-500/20 text-orange-300 border-orange-500/40",
  mp: "bg-purple-500/20 text-purple-300 border-purple-500/40",
  mp1: "bg-purple-500/20 text-purple-300 border-purple-500/40",
  hj: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40",
  co: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
};

const POSITION_SHORT: Record<string, string> = {
  btn: "BTN", sb: "SB", bb: "BB", utg: "UTG", utg1: "UTG1",
  utg2: "UTG2", mp: "MP", mp1: "MP1", hj: "HJ", co: "CO",
};

const ACTION_BADGE: Record<string, { bg: string; label: string; short: string }> = {
  fold: { bg: "bg-gray-500", label: "Fold", short: "F" },
  check: { bg: "bg-gray-400", label: "Check", short: "\u2713" },
  call: { bg: "bg-blue-400", label: "Call", short: "C" },
  bet: { bg: "bg-amber-400", label: "Bet", short: "B" },
  raise: { bg: "bg-amber-500", label: "Raise", short: "R" },
  all_in: { bg: "bg-red-500", label: "All-In", short: "A" },
};

const SUIT_SYMBOLS: Record<string, string> = {
  c: "\u2663", d: "\u2666", h: "\u2665", s: "\u2660",
};

const SUIT_COLORS: Record<string, string> = {
  c: "text-gray-900",
  d: "text-red-600",
  h: "text-red-600",
  s: "text-gray-900",
};

function CardText({ card }: { card: CardIndex }) {
  const rank = rankOf(card);
  const suit = suitOf(card);
  return (
    <span className={cn("font-bold px-1 py-0.5 rounded bg-white/90", SUIT_COLORS[suit])}>
      {rank}{SUIT_SYMBOLS[suit]}
    </span>
  );
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  folded: { label: "FOLD", cls: "text-gray-500" },
  all_in: { label: "ALL-IN", cls: "text-red-400" },
  sitting_out: { label: "SIT", cls: "text-gray-600" },
};

export function PlayerList({
  seats,
  selectedSeat,
  onSeatClick,
  bigBlind = 2,
  activePlayerSeat,
  decisions,
}: PlayerListProps) {
  return (
    <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden">
      <div className="px-4 py-2 border-b border-[var(--border)] bg-[var(--muted)]/30">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--gold-dim)]">
          Players
        </h3>
      </div>
      <div className="divide-y divide-[var(--border)]">
        {seats.map((seat, i) => {
          const isSelected = selectedSeat === seat.seatIndex;
          const posShort = POSITION_SHORT[seat.position] ?? seat.position.toUpperCase();
          const posColor = POSITION_COLORS[seat.position] ?? "bg-gray-500/20 text-gray-300 border-gray-500/40";
          const isActive = activePlayerSeat === seat.seatIndex;
          const statusInfo = STATUS_BADGE[seat.status];

          return (
            <motion.button
              key={seat.seatIndex}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              onClick={() => !seat.isHero && onSeatClick(seat.seatIndex)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 text-left transition-all",
                seat.isHero
                  ? "bg-[var(--gold)]/5 cursor-default"
                  : isSelected
                    ? "bg-[var(--accent)] cursor-pointer"
                    : "hover:bg-[var(--muted)]/40 cursor-pointer",
                isActive && "ring-1 ring-[var(--gold)]/60",
              )}
            >
              {/* Position badge */}
              <span
                className={cn(
                  "text-[10px] font-bold px-1.5 py-0.5 rounded border min-w-[36px] text-center",
                  posColor,
                )}
              >
                {posShort}
              </span>

              {/* Label */}
              <span className={cn(
                "text-xs font-medium min-w-[40px]",
                seat.isHero ? "text-[var(--gold)]" : "text-[var(--foreground)]",
              )}>
                {seat.label}
              </span>

              {/* Stack (in BB) */}
              <span className="text-[10px] text-[var(--muted-foreground)] tabular-nums min-w-[40px]">
                {formatBB(seat.stack / bigBlind)} BB
              </span>

              {/* Hole cards (visible villains) */}
              {!seat.isHero && seat.cardVisibility !== "hidden" && seat.holeCards.length === 2 && (
                <span className="inline-flex gap-0.5 text-[11px] font-mono">
                  <CardText card={seat.holeCards[0]} />
                  <CardText card={seat.holeCards[1]} />
                </span>
              )}

              {/* Status badge */}
              {statusInfo && (
                <span className={cn("text-[9px] font-bold", statusInfo.cls)}>
                  {statusInfo.label}
                </span>
              )}

              {/* Profile name */}
              {seat.profile && (
                <span className="text-[10px] text-[var(--muted-foreground)] truncate max-w-[60px]">
                  {seat.profile.name}
                </span>
              )}

              {/* Spacer */}
              <span className="flex-1" />

              {/* Current street bet amount */}
              {seat.streetCommitted > 0 && (
                <span className="text-[10px] font-semibold tabular-nums text-amber-300">
                  {formatBB(seat.streetCommitted / bigBlind)}
                </span>
              )}

              {/* Action badges + reasoning indicator */}
              {seat.actions.length > 0 && (() => {
                const decision = decisions?.get(seat.seatIndex);
                return (
                  <div className="flex items-center gap-0.5">
                    {seat.actions.slice(0, 4).map((action, j) => {
                      const badge = ACTION_BADGE[action.actionType] ?? { bg: "bg-gray-400", label: action.actionType, short: "?" };
                      const amountLabel = action.amount && action.amount > 0
                        ? ` ${formatBB(action.amount / bigBlind)}`
                        : "";
                      return (
                        <span
                          key={j}
                          className={cn(
                            "h-4 rounded-sm flex items-center justify-center text-[8px] font-bold text-white leading-none px-1",
                            badge.bg,
                          )}
                          title={`${action.street}: ${badge.label}${amountLabel}`}
                        >
                          {badge.short}{amountLabel && <span className="ml-0.5 font-mono">{amountLabel}</span>}
                        </span>
                      );
                    })}
                    {seat.actions.length > 4 && (
                      <span className="text-[9px] text-[var(--muted-foreground)] ml-0.5">
                        +{seat.actions.length - 4}
                      </span>
                    )}
                    {/* Reasoning indicator — shows when engine decision is available */}
                    {decision?.explanationNode && (
                      <span
                        className="ml-0.5 text-[var(--gold-dim)] opacity-70"
                        title={decision.explanation}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" />
                          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                          <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                      </span>
                    )}
                  </div>
                );
              })()}

              {/* Selection indicator */}
              {!seat.isHero && (
                <span className={cn(
                  "w-1.5 h-1.5 rounded-full transition-colors",
                  isSelected ? "bg-[var(--gold)]" : "bg-[var(--border)]",
                )} />
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
