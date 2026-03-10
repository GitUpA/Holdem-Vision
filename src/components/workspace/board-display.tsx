"use client";

import { motion, AnimatePresence } from "framer-motion";
import { PlayingCard } from "../cards/playing-card";
import { CardPlaceholder } from "../cards/card-placeholder";
import type { CardIndex } from "../../../convex/lib/types/cards";

interface BoardDisplayProps {
  heroCards: CardIndex[];
  communityCards: CardIndex[];
  onCardClick: (card: CardIndex) => void;
}

export function BoardDisplay({ heroCards, communityCards, onCardClick }: BoardDisplayProps) {
  return (
    <div className="flex flex-col items-center gap-6">
      {/* Community cards */}
      <div className="flex flex-col items-center gap-1.5">
        <span className="text-[10px] font-medium uppercase tracking-widest text-[var(--muted-foreground)]">
          Board
        </span>
        <div className="flex items-center gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <AnimatePresence key={i} mode="wait">
              {communityCards[i] !== undefined ? (
                <motion.div
                  key={`card-${communityCards[i]}`}
                  initial={{ rotateY: 90, opacity: 0 }}
                  animate={{ rotateY: 0, opacity: 1 }}
                  exit={{ rotateY: -90, opacity: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.08 }}
                >
                  <PlayingCard
                    cardIndex={communityCards[i]}
                    status="community"
                    size="lg"
                    onClick={() => onCardClick(communityCards[i])}
                  />
                </motion.div>
              ) : (
                <motion.div key={`placeholder-${i}`}>
                  <CardPlaceholder
                    size="lg"
                    label={i < 3 ? "" : i === 3 ? "T" : "R"}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          ))}
        </div>
      </div>

      {/* Hero cards */}
      <div className="flex flex-col items-center gap-1.5">
        <span className="text-[10px] font-medium uppercase tracking-widest text-[var(--gold-dim)]">
          Hero
        </span>
        <div className="flex items-center gap-2">
          {[0, 1].map((i) => (
            <AnimatePresence key={i} mode="wait">
              {heroCards[i] !== undefined ? (
                <motion.div
                  key={`hero-${heroCards[i]}`}
                  initial={{ rotateY: 90, opacity: 0, scale: 0.8 }}
                  animate={{ rotateY: 0, opacity: 1, scale: 1 }}
                  exit={{ rotateY: -90, opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.25 }}
                >
                  <PlayingCard
                    cardIndex={heroCards[i]}
                    status="hero"
                    size="lg"
                    onClick={() => onCardClick(heroCards[i])}
                  />
                </motion.div>
              ) : (
                <motion.div key={`hero-placeholder-${i}`}>
                  <CardPlaceholder size="lg" label="?" />
                </motion.div>
              )}
            </AnimatePresence>
          ))}
        </div>
      </div>
    </div>
  );
}
