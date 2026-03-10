"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface EquityDisplayProps {
  win: number;
  tie: number;
  lose: number;
}

export function EquityDisplay({ win, tie, lose }: EquityDisplayProps) {
  const winPct = (win * 100).toFixed(1);
  const tiePct = (tie * 100).toFixed(1);
  const losePct = (lose * 100).toFixed(1);

  // Dominant sentiment
  const sentiment = win > 0.6 ? "strong" : win > 0.45 ? "ahead" : win > 0.35 ? "coinflip" : "behind";

  return (
    <div className="space-y-2">
      {/* Big equity number */}
      <div className="flex items-baseline gap-2">
        <motion.span
          key={winPct}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "text-3xl font-black tabular-nums tracking-tight",
            sentiment === "strong" && "text-[var(--equity-win)]",
            sentiment === "ahead" && "text-[var(--equity-win)]",
            sentiment === "coinflip" && "text-[var(--equity-tie)]",
            sentiment === "behind" && "text-[var(--equity-lose)]",
          )}
        >
          {winPct}%
        </motion.span>
        <span className="text-xs text-[var(--muted-foreground)]">equity</span>
      </div>

      {/* Equity bar */}
      <div className="relative h-5 rounded-full overflow-hidden bg-[var(--muted)] flex">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${win * 100}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="h-full bg-[var(--equity-win)] relative"
          title={`Win: ${winPct}%`}
        >
          {win > 0.08 && (
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-[var(--primary-foreground)]">
              {winPct}
            </span>
          )}
        </motion.div>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${tie * 100}%` }}
          transition={{ duration: 0.5, ease: "easeOut", delay: 0.1 }}
          className="h-full bg-[var(--equity-tie)] relative"
          title={`Tie: ${tiePct}%`}
        >
          {tie > 0.05 && (
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-[var(--primary-foreground)]">
              {tiePct}
            </span>
          )}
        </motion.div>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${lose * 100}%` }}
          transition={{ duration: 0.5, ease: "easeOut", delay: 0.2 }}
          className="h-full bg-[var(--equity-lose)] relative"
          title={`Lose: ${losePct}%`}
        >
          {lose > 0.08 && (
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white/90">
              {losePct}
            </span>
          )}
        </motion.div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-[var(--equity-win)]" />
          <span className="text-[var(--muted-foreground)]">Win {winPct}%</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-[var(--equity-tie)]" />
          <span className="text-[var(--muted-foreground)]">Tie {tiePct}%</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-[var(--equity-lose)]" />
          <span className="text-[var(--muted-foreground)]">Lose {losePct}%</span>
        </span>
      </div>
    </div>
  );
}
