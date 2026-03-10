"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface EquityComparisonProps {
  vacuum: { win: number; tie: number; lose: number };
  reads: { win: number; tie: number; lose: number };
  delta: number;
}

/**
 * Side-by-side equity bars showing vacuum equity vs equity against opponent reads.
 * The delta tells the hero how much the opponents' actions have changed their equity.
 */
export function EquityComparison({ vacuum, reads, delta }: EquityComparisonProps) {
  const vacuumPct = (vacuum.win * 100).toFixed(1);
  const readsPct = (reads.win * 100).toFixed(1);
  const deltaPct = (delta * 100).toFixed(1);
  const deltaSign = delta >= 0 ? "+" : "";
  const deltaColor =
    delta > 0.02 ? "text-[var(--equity-win)]" : delta < -0.02 ? "text-[var(--equity-lose)]" : "text-[var(--equity-tie)]";

  return (
    <div className="space-y-3">
      {/* Vacuum equity */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-[var(--muted-foreground)]">Vacuum (random hands)</span>
          <span className="font-bold tabular-nums">{vacuumPct}%</span>
        </div>
        <div className="relative h-3 rounded-full overflow-hidden bg-[var(--muted)] flex">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${vacuum.win * 100}%` }}
            transition={{ duration: 0.4 }}
            className="h-full bg-[var(--equity-win)]/60"
          />
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${vacuum.tie * 100}%` }}
            transition={{ duration: 0.4, delay: 0.05 }}
            className="h-full bg-[var(--equity-tie)]/60"
          />
        </div>
      </div>

      {/* Reads equity */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-[var(--muted-foreground)]">vs Opponent Reads</span>
          <span className="font-bold tabular-nums">{readsPct}%</span>
        </div>
        <div className="relative h-3 rounded-full overflow-hidden bg-[var(--muted)] flex">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${reads.win * 100}%` }}
            transition={{ duration: 0.4 }}
            className="h-full bg-[var(--equity-win)]"
          />
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${reads.tie * 100}%` }}
            transition={{ duration: 0.4, delay: 0.05 }}
            className="h-full bg-[var(--equity-tie)]"
          />
        </div>
      </div>

      {/* Delta */}
      <div className="flex items-center justify-center gap-2 pt-1">
        <span className="text-xs text-[var(--muted-foreground)]">Delta:</span>
        <span className={cn("text-sm font-bold tabular-nums", deltaColor)}>
          {deltaSign}{deltaPct}%
        </span>
        <span className="text-[10px] text-[var(--muted-foreground)]">
          {delta > 0.02 ? "Opponents strengthen you" : delta < -0.02 ? "Opponents narrow your edge" : "Minimal change"}
        </span>
      </div>
    </div>
  );
}
