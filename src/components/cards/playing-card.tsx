"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { rankOf, suitOf } from "../../../convex/lib/primitives/card";
import type { CardIndex } from "../../../convex/lib/types/cards";
import type { CardStatus } from "@/hooks/use-deck-vision";

const SUIT_SYMBOLS: Record<string, string> = {
  c: "\u2663",
  d: "\u2666",
  h: "\u2665",
  s: "\u2660",
};

const SUIT_COLORS: Record<string, string> = {
  c: "text-[var(--suit-black)]",
  d: "text-[var(--suit-red)]",
  h: "text-[var(--suit-red)]",
  s: "text-[var(--suit-black)]",
};

interface PlayingCardProps {
  cardIndex: CardIndex;
  status?: CardStatus;
  threatUrgency?: number;
  size?: "sm" | "md" | "deck" | "lg";
  onClick?: () => void;
  disabled?: boolean;
}

export function PlayingCard({
  cardIndex,
  status = "neutral",
  threatUrgency,
  size = "sm",
  onClick,
  disabled,
}: PlayingCardProps) {
  const rank = rankOf(cardIndex);
  const suit = suitOf(cardIndex);
  const symbol = SUIT_SYMBOLS[suit];
  const colorClass = SUIT_COLORS[suit];

  const sizeClasses = {
    sm: "w-10 h-14 text-xs",
    md: "w-14 h-[78px] text-sm",
    deck: "w-[66px] h-[92px] text-base",
    lg: "w-20 h-28 text-lg",
  };

  const statusClass =
    status === "hero" ? "bg-amber-100"
    : status === "community" ? "bg-blue-100"
    : status === "threat" && (threatUrgency ?? 0) >= 0.5 ? "bg-red-200"
    : status === "threat" ? "bg-red-100"
    : status === "out" ? "bg-emerald-100"
    : status === "dead" ? "card-dead"
    : "";

  return (
    <motion.button
      whileHover={!disabled ? { scale: 1.08, y: -2 } : undefined}
      whileTap={!disabled ? { scale: 0.95 } : undefined}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "playing-card relative rounded-lg bg-white flex flex-col items-center justify-center gap-0.5 cursor-pointer select-none transition-colors",
        sizeClasses[size],
        colorClass,
        statusClass,
        disabled && "cursor-default",
        status === "neutral" && "hover:bg-gray-50",
      )}
    >
      <span className="leading-none text-[2.8em]">{symbol}</span>
      <span className="font-black leading-none text-[1.6em]">{rank}</span>
    </motion.button>
  );
}
