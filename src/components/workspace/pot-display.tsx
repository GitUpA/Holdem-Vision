"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { PotState } from "../../../convex/lib/state/gameState";
import type { BlindStructure } from "../../../convex/lib/types/game";

interface PotDisplayProps {
  pot: PotState;
  blinds: BlindStructure;
}

export function PotDisplay({ pot, blinds }: PotDisplayProps) {
  const bb = blinds.big;
  const formatBB = (chips: number) => {
    const bbs = chips / bb;
    return bbs % 1 === 0 ? `${bbs}` : bbs.toFixed(1);
  };

  if (pot.total <= 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-start gap-0.5"
    >
      <span className="text-[10px] font-medium uppercase tracking-widest text-[var(--gold-dim)]/60">
        Pot
      </span>
      <AnimatePresence mode="wait">
        <motion.span
          key={pot.total}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          className="text-sm font-bold text-[var(--gold)]"
        >
          {formatBB(pot.total)} BB
        </motion.span>
      </AnimatePresence>
      {pot.sidePots.length > 0 && (
        <div className="flex flex-col items-start gap-0.5">
          {pot.sidePots.map((sp, i) => (
            <span
              key={i}
              className="text-[9px] text-[var(--muted-foreground)]"
            >
              Side {i + 1}: {formatBB(sp.amount)} BB
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );
}
