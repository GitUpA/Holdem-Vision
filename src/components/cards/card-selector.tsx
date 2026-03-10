"use client";

import { CardGrid } from "./card-grid";
import { cn } from "@/lib/utils";
import type { CardIndex } from "../../../convex/lib/types/cards";
import type { DeckVisionCard } from "@/hooks/use-deck-vision";

export type SelectionMode = "hero" | "community" | "dead";

interface CardSelectorProps {
  cards: DeckVisionCard[];
  usedCards: Set<CardIndex>;
  selectionMode: SelectionMode;
  onCardClick: (cardIndex: CardIndex) => void;
  onModeChange: (mode: SelectionMode) => void;
  /** When true, hide mode buttons and disable card clicks */
  readOnly?: boolean;
}

const MODE_LABELS: Record<SelectionMode, { label: string; color: string }> = {
  hero: { label: "Select Hero Cards", color: "text-[var(--gold)]" },
  community: { label: "Select Community Cards", color: "text-blue-400" },
  dead: { label: "Mark Dead Cards", color: "text-[var(--muted-foreground)]" },
};

export function CardSelector({
  cards,
  usedCards,
  selectionMode,
  onCardClick,
  onModeChange,
  readOnly,
}: CardSelectorProps) {
  return (
    <div className="space-y-2">
      {/* Mode selector */}
      {!readOnly && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium uppercase tracking-widest text-[var(--muted-foreground)]">
              Deck Vision
            </span>
            <span
              className={cn(
                "text-[10px] font-semibold uppercase tracking-wider",
                MODE_LABELS[selectionMode].color,
              )}
            >
              — {MODE_LABELS[selectionMode].label}
            </span>
          </div>
          <div className="flex gap-1">
            {(["hero", "community", "dead"] as SelectionMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => onModeChange(mode)}
                className={cn(
                  "text-[10px] font-medium px-2 py-0.5 rounded transition-colors capitalize",
                  selectionMode === mode
                    ? "bg-[var(--felt)] text-[var(--foreground)]"
                    : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
                )}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
      )}

      {readOnly && (
        <span className="text-[10px] font-medium uppercase tracking-widest text-[var(--muted-foreground)]">
          Deck Vision
        </span>
      )}

      {/* 52-card grid */}
      <CardGrid
        cards={cards}
        onCardClick={readOnly ? () => {} : onCardClick}
        usedCards={usedCards}
      />
    </div>
  );
}
