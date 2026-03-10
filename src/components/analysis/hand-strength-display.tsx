"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface HandStrengthDisplayProps {
  currentHand: {
    name: string;
    description: string;
    tier: number;
  } | null;
  preflopStrength: {
    category: string;
    label: string;
  } | null;
}

const tierColors: Record<number, string> = {
  0: "text-[var(--equity-lose)]",      // High Card
  1: "text-[var(--muted-foreground)]",  // One Pair
  2: "text-[var(--muted-foreground)]",  // Two Pair
  3: "text-[var(--equity-tie)]",        // Three of a Kind
  4: "text-[var(--equity-tie)]",        // Straight
  5: "text-[var(--equity-win)]",        // Flush
  6: "text-[var(--equity-win)]",        // Full House
  7: "text-[var(--equity-win)]",        // Four of a Kind
  8: "text-[var(--equity-win)]",        // Straight Flush
  9: "text-[var(--equity-win)]",        // Royal Flush
};

const categoryColors: Record<string, string> = {
  premium: "text-[var(--equity-win)]",
  strong: "text-[var(--equity-win)]",
  playable: "text-[var(--equity-tie)]",
  marginal: "text-[var(--equity-lose)]",
  weak: "text-[var(--equity-lose)]",
};

export function HandStrengthDisplay({ currentHand, preflopStrength }: HandStrengthDisplayProps) {
  if (currentHand) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
            Current Hand
          </span>
          {/* Tier indicator */}
          <div className="flex gap-0.5">
            {Array.from({ length: 10 }, (_, i) => (
              <span
                key={i}
                className={cn(
                  "w-1.5 h-3 rounded-sm",
                  i <= currentHand.tier
                    ? "bg-[var(--equity-win)] opacity-80"
                    : "bg-[var(--muted)]",
                )}
              />
            ))}
          </div>
        </div>
        <motion.div
          key={currentHand.name}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "text-2xl font-black tracking-tight",
            tierColors[currentHand.tier] ?? "text-[var(--foreground)]",
          )}
        >
          {currentHand.name}
        </motion.div>
        <p className="text-xs text-[var(--muted-foreground)]">
          {currentHand.description}
        </p>
      </div>
    );
  }

  if (preflopStrength) {
    return (
      <div className="space-y-1.5">
        <span className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
          Starting Hand
        </span>
        <motion.div
          key={preflopStrength.label}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "text-2xl font-black tracking-tight",
            categoryColors[preflopStrength.category] ?? "text-[var(--foreground)]",
          )}
        >
          {preflopStrength.label}
        </motion.div>
        <p className="text-xs text-[var(--muted-foreground)] capitalize">
          {preflopStrength.category} starting hand
        </p>
      </div>
    );
  }

  return null;
}
