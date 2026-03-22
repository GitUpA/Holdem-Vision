"use client";

/**
 * NarrativeBoardContext — frames the board as a story before the user acts.
 *
 * Shows a headline (board texture + range advantage), teaching context
 * (from archetype prototypes), and a hand-strength-specific question
 * (in quiz mode) to prime narrative thinking.
 */

import { useMemo, useState } from "react";
import type { ArchetypeClassification } from "../../../convex/lib/gto/archetypeClassifier";
import type { HandCategorization } from "../../../convex/lib/gto/handCategorizer";
import type { CardIndex } from "../../../convex/lib/types/cards";
import { analyzeBoard } from "../../../convex/lib/opponents/engines/boardTexture";
import { buildBoardNarrative } from "../../../convex/lib/gto/narrativeContext";

interface NarrativeBoardContextProps {
  archetype: ArchetypeClassification;
  handCategory: HandCategorization;
  communityCards: CardIndex[];
  isInPosition: boolean;
  drillMode: "learn" | "quiz";
}

export function NarrativeBoardContext({
  archetype,
  handCategory,
  communityCards,
  isInPosition,
  drillMode,
}: NarrativeBoardContextProps) {
  const [expanded, setExpanded] = useState(false);

  const narrative = useMemo(() => {
    const boardTexture = communityCards.length >= 3
      ? analyzeBoard(communityCards)
      : undefined;

    return buildBoardNarrative(archetype, handCategory, boardTexture, isInPosition);
  }, [archetype, handCategory, communityCards, isInPosition]);

  const showContext = drillMode === "learn" || expanded;

  return (
    <div className="border-l-2 border-[var(--gold)]/40 pl-3 space-y-1.5">
      {/* Headline — always visible */}
      <p className="text-xs text-[var(--foreground)] font-medium leading-relaxed">
        {narrative.headline}
      </p>

      {/* Context — always in learn mode, expandable in quiz mode */}
      {showContext && narrative.context && (
        <p className="text-[11px] text-[var(--muted-foreground)] leading-relaxed">
          {narrative.context}
        </p>
      )}

      {/* Expand toggle — quiz mode only, when context is hidden */}
      {drillMode === "quiz" && !expanded && narrative.context && (
        <button
          onClick={() => setExpanded(true)}
          className="text-[10px] text-[var(--gold)]/70 hover:text-[var(--gold)] transition-colors"
        >
          Show context
        </button>
      )}

      {/* Question — quiz mode only, primes narrative thinking */}
      {drillMode === "quiz" && (
        <p className="text-[11px] text-[var(--gold)] italic leading-relaxed">
          {narrative.question}
        </p>
      )}
    </div>
  );
}
