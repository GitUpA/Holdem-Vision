"use client";

import { motion } from "framer-motion";
import type { BlindStructure } from "../../../convex/lib/types/game";

interface GameSetupPanelProps {
  blinds: BlindStructure;
  startingStack: number;
  onBlindsChange: (b: BlindStructure) => void;
  onStackChange: (n: number) => void;
  onStart: () => void;
}

export function GameSetupPanel({
  blinds,
  startingStack,
  onBlindsChange,
  onStackChange,
  onStart,
}: GameSetupPanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4 space-y-4"
    >
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--gold-dim)]">
        Hand Setup
      </h3>

      <div className="grid grid-cols-2 gap-3">
        {/* SB ratio — BB is always 1 */}
        <div className="space-y-1">
          <label className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
            SB / BB Ratio
          </label>
          <input
            type="number"
            min={0.1}
            max={1}
            step={0.1}
            value={blinds.small}
            onChange={(e) =>
              onBlindsChange({ ...blinds, small: Math.min(1, Math.max(0.1, Number(e.target.value))) })
            }
            className="w-full text-xs bg-[var(--muted)]/40 border border-[var(--border)] rounded px-2 py-1.5 text-[var(--foreground)]"
          />
        </div>

        {/* Stack in BB */}
        <div className="space-y-1">
          <label className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
            Stack (BB)
          </label>
          <input
            type="number"
            min={1}
            value={startingStack}
            onChange={(e) =>
              onStackChange(Math.max(1, Number(e.target.value)))
            }
            className="w-full text-xs bg-[var(--muted)]/40 border border-[var(--border)] rounded px-2 py-1.5 text-[var(--foreground)]"
          />
        </div>
      </div>

      {/* Deal button */}
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={onStart}
        className="w-full py-2.5 rounded-lg bg-[var(--felt)] text-[var(--gold)] font-semibold text-sm border border-[var(--gold-dim)]/40 hover:border-[var(--gold)]/60 transition-colors"
      >
        Deal Hand
      </motion.button>
    </motion.div>
  );
}
