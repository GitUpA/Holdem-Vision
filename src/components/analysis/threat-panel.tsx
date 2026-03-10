"use client";

import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { cardToDisplay } from "../../../convex/lib/primitives/card";
import type { CardIndex } from "../../../convex/lib/types/cards";

interface ThreatCard {
  cardIndex: CardIndex;
  urgency: number;
  reasons: string[];
  categories: string[];
}

interface ThreatPanelProps {
  threats: ThreatCard[];
  threatCount: number;
  safeCount: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  completes_flush: "Flush",
  completes_straight: "Straight",
  pairs_board: "Pairs Board",
  overcards: "Overcard",
  counterfeit: "Counterfeit",
};

const CATEGORY_COLORS: Record<string, string> = {
  completes_flush: "bg-red-500/20 text-red-400 border-red-500/30",
  completes_straight: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  pairs_board: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  overcards: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  counterfeit: "bg-purple-500/20 text-purple-400 border-purple-500/30",
};

function urgencyLabel(urgency: number): string {
  if (urgency >= 0.7) return "HIGH";
  if (urgency >= 0.4) return "MED";
  return "LOW";
}

function urgencyColor(urgency: number): string {
  if (urgency >= 0.7) return "text-red-400";
  if (urgency >= 0.4) return "text-orange-400";
  return "text-yellow-400";
}

export function ThreatPanel({ threats, threatCount, safeCount }: ThreatPanelProps) {
  const total = threatCount + safeCount;
  const threatPct = total > 0 ? ((threatCount / total) * 100).toFixed(0) : "0";
  const highThreats = threats.filter((t) => t.urgency >= 0.6);
  const otherThreats = threats.filter((t) => t.urgency < 0.6);

  // Group threats by category for summary
  const byCat: Record<string, number> = {};
  for (const t of threats) {
    for (const c of t.categories) {
      byCat[c] = (byCat[c] || 0) + 1;
    }
  }

  return (
    <div className="space-y-3">
      {/* Header stats */}
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-black tabular-nums text-[var(--threat)]">
            {threatCount}
          </span>
          <span className="text-xs text-[var(--muted-foreground)]">
            threats ({threatPct}% of deck)
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-bold tabular-nums text-[var(--equity-win)]">
            {safeCount}
          </span>
          <span className="text-xs text-[var(--muted-foreground)]">safe</span>
        </div>
      </div>

      {/* Category pills */}
      {Object.keys(byCat).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(byCat)
            .sort((a, b) => b[1] - a[1])
            .map(([cat, count]) => (
              <span
                key={cat}
                className={cn(
                  "text-[10px] font-medium px-2 py-0.5 rounded-full border",
                  CATEGORY_COLORS[cat] ?? "bg-gray-500/20 text-gray-400 border-gray-500/30",
                )}
              >
                {CATEGORY_LABELS[cat] ?? cat} ×{count}
              </span>
            ))}
        </div>
      )}

      {/* Threat list */}
      {threatCount > 0 && (
        <div className="space-y-1 max-h-48 overflow-y-auto pr-1 scrollbar-thin">
          <AnimatePresence>
            {highThreats.slice(0, 10).map((t, i) => (
              <ThreatRow key={t.cardIndex} threat={t} index={i} />
            ))}
            {otherThreats.slice(0, 6).map((t, i) => (
              <ThreatRow key={t.cardIndex} threat={t} index={highThreats.length + i} />
            ))}
          </AnimatePresence>
          {threats.length > 16 && (
            <p className="text-[10px] text-[var(--muted-foreground)] pl-2 pt-1">
              +{threats.length - 16} more threats
            </p>
          )}
        </div>
      )}

      {threatCount === 0 && (
        <p className="text-sm text-[var(--equity-win)]">
          No threats detected — board is clean.
        </p>
      )}
    </div>
  );
}

function ThreatRow({ threat, index }: { threat: ThreatCard; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.02 }}
      className="flex items-center gap-2 text-xs py-1 px-2 rounded-md bg-[var(--muted)]/50 hover:bg-[var(--muted)] transition-colors"
    >
      <span className="font-mono font-bold text-sm min-w-[2rem] text-center text-[var(--foreground)]">
        {cardToDisplay(threat.cardIndex)}
      </span>
      <span className={cn("font-bold text-[10px] min-w-[2rem]", urgencyColor(threat.urgency))}>
        {urgencyLabel(threat.urgency)}
      </span>
      <span className="text-[var(--muted-foreground)] truncate flex-1">
        {threat.reasons[0]}
      </span>
    </motion.div>
  );
}
