"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { UnifiedSeatConfig } from "@/hooks/use-hand-manager";
import type { AutoPlayDecision } from "../../../convex/lib/opponents/autoPlay";
import { rankOf, suitOf } from "../../../convex/lib/primitives/card";
import type { CardIndex } from "../../../convex/lib/types/cards";
import { formatBB } from "@/lib/format";
import { Term } from "../ui/term";

interface PlayerListProps {
  seats: UnifiedSeatConfig[];
  selectedSeat: number | null;
  onSeatClick: (seatIndex: number) => void;
  bigBlind?: number;
  activePlayerSeat?: number | null;
  decisions?: ReadonlyMap<number, AutoPlayDecision>;
  /** Set all villain seats to a preset profile */
  onSetAllProfiles?: (profileId: string) => void;
  /** Randomize all villain profiles */
  onRandomizeProfiles?: () => void;
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

/** Extract short profile code (max 3 chars) from full profile name. */
function shortProfileName(name: string): string {
  if (name.startsWith("GTO")) return "GTO";
  if (name.startsWith("TAG")) return "TAG";
  if (name.startsWith("LAG")) return "LAG";
  if (name.startsWith("Nit") || name.startsWith("NIT")) return "NIT";
  if (name.startsWith("Fish") || name.startsWith("FISH")) return "FSH";
  // Unknown profile — take first 3 chars uppercase
  return name.slice(0, 3).toUpperCase();
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  folded: { label: "FOLD", cls: "text-gray-500" },
  all_in: { label: "ALL-IN", cls: "text-red-400" },
  sitting_out: { label: "SIT", cls: "text-gray-600" },
};

const PROFILE_PRESETS = [
  { id: "gto", label: "All GTO" },
  { id: "tag", label: "All TAG" },
  { id: "lag", label: "All LAG" },
  { id: "nit", label: "All NIT" },
  { id: "fish", label: "All FISH" },
] as const;

export function PlayerList({
  seats,
  selectedSeat,
  onSeatClick,
  bigBlind = 2,
  activePlayerSeat,
  decisions,
  onSetAllProfiles,
  onRandomizeProfiles,
}: PlayerListProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  return (
    <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden">
      <div className="px-4 py-2 border-b border-[var(--border)] bg-[var(--muted)]/30 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--gold-dim)]">
          Players
        </h3>
        {(onSetAllProfiles || onRandomizeProfiles) && (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="text-[10px] px-2 py-0.5 rounded border border-[var(--border)] bg-[var(--muted)]/40 text-[var(--muted-foreground)] hover:text-[var(--gold)] hover:border-[var(--gold-dim)]/40 transition-colors font-medium"
              title="Set all villain profiles"
            >
              Profiles ▾
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-lg shadow-black/30 py-1 min-w-[120px]">
                {onRandomizeProfiles && (
                  <button
                    onClick={() => { onRandomizeProfiles(); setMenuOpen(false); }}
                    className="w-full text-left px-3 py-1.5 text-[10px] font-medium text-[var(--muted-foreground)] hover:text-[var(--gold)] hover:bg-[var(--muted)]/40 transition-colors"
                  >
                    Randomize
                  </button>
                )}
                {onRandomizeProfiles && onSetAllProfiles && (
                  <div className="border-t border-[var(--border)]/50 my-0.5" />
                )}
                {onSetAllProfiles && PROFILE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => { onSetAllProfiles(preset.id); setMenuOpen(false); }}
                    className="w-full text-left px-3 py-1.5 text-[10px] font-medium text-[var(--muted-foreground)] hover:text-[var(--gold)] hover:bg-[var(--muted)]/40 transition-colors"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
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
              {/* Col 1: Player (max 4 chars: HERO, V2, V3...) */}
              <span className={cn(
                "text-[11px] font-bold uppercase w-[32px] shrink-0",
                seat.isHero ? "text-[var(--gold)]" : "text-[var(--foreground)]",
              )}>
                {seat.label}
              </span>

              {/* Col 2: Position (max 4 chars: BTN, SB, BB, UTG, HJ, CO) */}
              <Term id="term:positions" position="bottom">
                <span
                  className={cn(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded border w-[36px] text-center shrink-0",
                    posColor,
                  )}
                >
                  {posShort}
                </span>
              </Term>

              {/* Col 3: Profile (always show, max 3 chars: GTO, TAG, LAG, NIT, FSH) */}
              <span className="text-[10px] text-[var(--muted-foreground)] w-[28px] shrink-0">
                {seat.isHero ? "" : seat.profile ? shortProfileName(seat.profile.name) : ""}
              </span>

              {/* Col 4: Stack (max 6 chars: XXX BB) */}
              <span className="text-[10px] text-[var(--muted-foreground)] tabular-nums w-[42px] shrink-0 text-right">
                {formatBB(seat.stack / bigBlind)} BB
              </span>

              {/* Hole cards (visible villains) */}
              {!seat.isHero && seat.cardVisibility !== "hidden" && seat.holeCards.length === 2 && (
                <span className="inline-flex gap-0.5 text-[11px] font-mono shrink-0">
                  <CardText card={seat.holeCards[0]} />
                  <CardText card={seat.holeCards[1]} />
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
