"use client";

import { motion } from "framer-motion";
import { PlayingCard } from "./playing-card";
import type { DeckVisionCard } from "@/hooks/use-deck-vision";
import type { CardIndex } from "../../../convex/lib/types/cards";

const SUIT_LABELS = [
  { suit: 0, label: "\u2663", name: "Clubs" },
  { suit: 1, label: "\u2666", name: "Diamonds" },
  { suit: 2, label: "\u2665", name: "Hearts" },
  { suit: 3, label: "\u2660", name: "Spades" },
];

interface CardGridProps {
  cards: DeckVisionCard[];
  onCardClick: (cardIndex: CardIndex) => void;
  usedCards: Set<CardIndex>;
}

export function CardGrid({ cards, onCardClick, usedCards: _usedCards }: CardGridProps) {
  // Group cards by suit (suit = cardIndex % 4)
  const bySuit = SUIT_LABELS.map(({ suit, label, name }) => ({
    suit,
    label,
    name,
    cards: cards.filter((c) => c.cardIndex % 4 === suit),
  }));

  return (
    <div className="space-y-1.5">
      {bySuit.map(({ suit, label, name, cards: suitCards }) => (
        <div key={suit} className="flex items-center gap-1.5">
          <span
            className={`w-5 text-center text-lg ${suit === 1 || suit === 2 ? "text-[var(--suit-red)]" : "text-gray-400"}`}
            title={name}
          >
            {label}
          </span>
          <motion.div className="flex flex-wrap gap-1" layout>
            {suitCards
              .sort((a, b) => a.cardIndex - b.cardIndex)
              .map((card) => (
                <motion.div
                  key={card.cardIndex}
                  layout
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.15 }}
                >
                  <PlayingCard
                    cardIndex={card.cardIndex}
                    status={card.status}
                    threatUrgency={card.threatUrgency}
                    size="deck"
                    onClick={() => onCardClick(card.cardIndex)}
                  />
                </motion.div>
              ))}
          </motion.div>
        </div>
      ))}
    </div>
  );
}
