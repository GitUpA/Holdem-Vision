"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { cardToDisplay } from "../../../convex/lib/primitives/card";
import type { CardIndex } from "../../../convex/lib/types/cards";

interface OutCard {
  cardIndex: CardIndex;
  currentHandName: string;
  improvedHandName: string;
  improvement: string;
}

interface OutsDisplayProps {
  outs: OutCard[];
  outsCount: number;
  probability: number;
  byImprovement: Record<string, OutCard[]>;
  street: "flop" | "turn" | "river";
}

export function OutsDisplay({
  outs,
  outsCount,
  probability,
  byImprovement,
  street,
}: OutsDisplayProps) {
  const pct = (probability * 100).toFixed(1);
  const remainingStreets = street === "flop" ? 2 : 1;
  const roughPct = outsCount * (remainingStreets === 2 ? 4 : 2);

  return (
    <div className="space-y-3">
      {/* Headline */}
      <div className="flex items-baseline gap-2">
        <motion.span
          key={outsCount}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className={cn(
            "text-2xl font-black tabular-nums",
            outsCount >= 12
              ? "text-[var(--equity-win)]"
              : outsCount >= 6
                ? "text-[var(--out-color)]"
                : outsCount > 0
                  ? "text-[var(--equity-tie)]"
                  : "text-[var(--muted-foreground)]",
          )}
        >
          {outsCount}
        </motion.span>
        <span className="text-xs text-[var(--muted-foreground)]">
          outs ({pct}% next card · ~{roughPct}% rule of {remainingStreets === 2 ? 4 : 2})
        </span>
      </div>

      {/* Improvement groups */}
      {Object.keys(byImprovement).length > 0 && (
        <div className="space-y-2">
          {Object.entries(byImprovement).map(([improvement, cards]) => (
            <div key={improvement} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--out-color)]">
                  {improvement}
                </span>
                <span className="text-[10px] text-[var(--muted-foreground)] tabular-nums">
                  {cards.length} out{cards.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {cards.map((card, i) => (
                  <motion.span
                    key={card.cardIndex}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.02 }}
                    className="text-xs font-mono font-bold px-1.5 py-0.5 rounded bg-[var(--out-glow)] text-[var(--foreground)]"
                  >
                    {cardToDisplay(card.cardIndex)}
                  </motion.span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {outsCount === 0 && (
        <p className="text-sm text-[var(--muted-foreground)]">
          No outs — hand cannot improve on the next card.
        </p>
      )}
    </div>
  );
}
