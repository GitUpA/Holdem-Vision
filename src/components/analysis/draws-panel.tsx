"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface DrawInfo {
  type: string;
  outsCount: number;
  description: string;
}

interface DrawsPanelProps {
  draws: DrawInfo[];
  hasFlushDraw: boolean;
  hasStraightDraw: boolean;
  isCombo: boolean;
  totalDrawOuts: number;
}

const DRAW_ICONS: Record<string, string> = {
  flush_draw: "♠",
  oesd: "⟷",
  gutshot: "·⟶",
  backdoor_flush: "♣",
  backdoor_straight: "···",
  straight_draw: "↔",
};

const DRAW_COLORS: Record<string, string> = {
  flush_draw: "border-blue-500/40 bg-blue-500/10",
  oesd: "border-teal-500/40 bg-teal-500/10",
  gutshot: "border-amber-500/40 bg-amber-500/10",
  backdoor_flush: "border-indigo-500/30 bg-indigo-500/5",
  backdoor_straight: "border-gray-500/30 bg-gray-500/5",
  straight_draw: "border-teal-500/40 bg-teal-500/10",
};

export function DrawsPanel({
  draws,
  hasFlushDraw: _hasFlushDraw,
  hasStraightDraw: _hasStraightDraw,
  isCombo,
  totalDrawOuts,
}: DrawsPanelProps) {
  if (draws.length === 0) {
    return (
      <div className="text-sm text-[var(--muted-foreground)]">
        No active draws detected.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Combo badge */}
      {isCombo && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--equity-win)]/15 border border-[var(--equity-win)]/30 text-[var(--equity-win)] text-xs font-semibold"
        >
          <span>⚡</span>
          <span>COMBO DRAW — {totalDrawOuts} combined outs</span>
        </motion.div>
      )}

      {/* Draw cards */}
      <div className="space-y-2">
        {draws.map((draw, i) => (
          <motion.div
            key={`${draw.type}-${i}`}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg border",
              DRAW_COLORS[draw.type] ?? "border-[var(--border)] bg-[var(--muted)]/30",
            )}
          >
            <span className="text-lg opacity-60 min-w-[1.5rem] text-center">
              {DRAW_ICONS[draw.type] ?? "?"}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-[var(--foreground)]">{draw.description}</p>
            </div>
            <span className="text-sm font-bold tabular-nums text-[var(--out-color)]">
              {draw.outsCount}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
