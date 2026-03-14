"use client";

import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { cardToDisplay, rankValue } from "../../../convex/lib/primitives/card";
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

function urgencyChipBg(urgency: number): string {
  if (urgency >= 0.7) return "bg-red-500/20 text-red-300";
  if (urgency >= 0.4) return "bg-orange-500/20 text-orange-300";
  return "bg-yellow-500/20 text-yellow-300";
}

/** Group threats that share the same reason into collapsed rows. */
interface ThreatGroup {
  cards: CardIndex[];
  urgency: number;
  reason: string;
  category: string;
}

function groupThreats(threats: ThreatCard[]): ThreatGroup[] {
  const map = new Map<string, ThreatGroup>();

  for (const t of threats) {
    // Group key: same rank + same primary category = same group
    // For flush threats (suit-based), group by category + suit count pattern instead
    const primaryCat = t.categories[0] ?? "unknown";
    const rank = rankValue(t.cardIndex);
    const key =
      primaryCat === "completes_flush"
        ? `flush-${t.reasons[0]}`  // flush reasons already encode suit info
        : `${primaryCat}-${rank}`;

    const existing = map.get(key);
    if (existing) {
      existing.cards.push(t.cardIndex);
      existing.urgency = Math.max(existing.urgency, t.urgency);
    } else {
      map.set(key, {
        cards: [t.cardIndex],
        urgency: t.urgency,
        reason: t.reasons[0],
        category: primaryCat,
      });
    }
  }

  const groups = [...map.values()];
  groups.sort((a, b) => b.urgency - a.urgency);
  return groups;
}

export function ThreatPanel({ threats, threatCount, safeCount }: ThreatPanelProps) {
  const total = threatCount + safeCount;
  const threatPct = total > 0 ? ((threatCount / total) * 100).toFixed(0) : "0";

  // Group threats by category for summary pills
  const byCat: Record<string, number> = {};
  for (const t of threats) {
    for (const c of t.categories) {
      byCat[c] = (byCat[c] || 0) + 1;
    }
  }

  const groups = groupThreats(threats);

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
                {CATEGORY_LABELS[cat] ?? cat} x{count}
              </span>
            ))}
        </div>
      )}

      {/* Grouped threat list */}
      {groups.length > 0 && (
        <div className="space-y-2">
          <AnimatePresence>
            {groups.map((group, i) => (
              <ThreatGroupRow key={`${group.category}-${group.cards[0]}`} group={group} index={i} />
            ))}
          </AnimatePresence>
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

function ThreatGroupRow({ group, index }: { group: ThreatGroup; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.02 }}
      className="space-y-1"
    >
      {/* Header: reason + urgency */}
      <div className="flex items-center justify-between">
        <span className={cn("text-xs font-medium", urgencyColor(group.urgency))}>
          {group.reason}
        </span>
        <span className={cn("text-[10px] font-bold tabular-nums", urgencyColor(group.urgency))}>
          {urgencyLabel(group.urgency)}
        </span>
      </div>
      {/* Card chips */}
      <div className="flex flex-wrap gap-1">
        {group.cards.map((card, i) => (
          <motion.span
            key={card}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.02 }}
            className={cn(
              "text-xs font-mono font-bold px-1.5 py-0.5 rounded",
              urgencyChipBg(group.urgency),
            )}
          >
            {cardToDisplay(card)}
          </motion.span>
        ))}
      </div>
    </motion.div>
  );
}
