"use client";

import { cn } from "@/lib/utils";
import type { RangeHighlight } from "../../../convex/lib/types/visuals";

interface RangeGridProps {
  label: string;
  highlights: RangeHighlight[];
  rangePct: number;
}

const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];

/**
 * 13x13 range grid showing which hand classes are in the opponent's range.
 * Upper-right triangle = suited, lower-left = offsuit, diagonal = pairs.
 */
export function RangeGrid({ label, highlights, rangePct }: RangeGridProps) {
  // Build a lookup map from combo string to highlight
  const highlightMap = new Map<string, RangeHighlight>();
  for (const h of highlights) {
    highlightMap.set(h.combo, h);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--muted-foreground)]">{label}</span>
        <span className="text-xs font-bold tabular-nums text-[var(--foreground)]">
          ~{rangePct.toFixed(0)}%
        </span>
      </div>

      <div
        className="grid gap-px"
        style={{ gridTemplateColumns: `repeat(13, 1fr)` }}
      >
        {RANKS.map((row, ri) =>
          RANKS.map((col, ci) => {
            let combo: string;
            if (ri === ci) {
              // Pair (diagonal)
              combo = `${row}${col}`;
            } else if (ri < ci) {
              // Suited (upper-right)
              combo = `${row}${col}s`;
            } else {
              // Offsuit (lower-left)
              combo = `${col}${row}o`;
            }

            const h = highlightMap.get(combo);
            const weight = h?.weight ?? 0;

            return (
              <div
                key={`${ri}-${ci}`}
                className={cn(
                  "aspect-square flex items-center justify-center text-[7px] sm:text-[8px] font-medium rounded-[2px] transition-colors select-none",
                  weight > 0.01
                    ? "text-white/90"
                    : "text-[var(--muted-foreground)]/40 bg-[var(--muted)]/20",
                )}
                style={
                  weight > 0.01
                    ? { backgroundColor: h?.color ?? "#666", opacity: 0.3 + weight * 0.7 }
                    : undefined
                }
                title={`${combo}: ${(weight * 100).toFixed(0)}%`}
              >
                {combo.length <= 3 ? combo : combo.slice(0, 2)}
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}
