"use client";

import { useMemo } from "react";
import type { CardIndex } from "../../convex/lib/types/cards";
import type { AnalysisResult } from "../../convex/lib/types/analysis";
import type { CardHighlight } from "../../convex/lib/types/visuals";

export type CardStatus = "hero" | "community" | "dead" | "threat" | "out" | "neutral";

export interface DeckVisionCard {
  cardIndex: CardIndex;
  status: CardStatus;
  threatUrgency?: number;
  reason?: string;
}

/**
 * Derives the visual state for each of the 52 cards from the current
 * selection and analysis results.
 */
export function useDeckVision(
  heroCards: CardIndex[],
  communityCards: CardIndex[],
  deadCards: CardIndex[],
  results: Map<string, AnalysisResult>,
): DeckVisionCard[] {
  return useMemo(() => {
    const heroSet = new Set(heroCards);
    const communitySet = new Set(communityCards);
    const deadSet = new Set(deadCards);

    // Gather all card highlights from analysis results
    const threatMap = new Map<number, { urgency: number; reason: string }>();
    const outSet = new Set<number>();

    for (const [, result] of results) {
      for (const visual of result.visuals) {
        if (visual.type === "threat_map") {
          const highlights = (visual.data as { highlights?: CardHighlight[] }).highlights ?? [];
          for (const h of highlights) {
            const existing = threatMap.get(h.cardIndex);
            if (!existing || h.urgency > existing.urgency) {
              threatMap.set(h.cardIndex, { urgency: h.urgency, reason: h.reason });
            }
          }
        }
        if (visual.type === "outs_display") {
          const highlights = (visual.data as { highlights?: CardHighlight[] }).highlights ?? [];
          for (const h of highlights) {
            outSet.add(h.cardIndex);
          }
        }
      }
    }

    const cards: DeckVisionCard[] = [];
    for (let i = 0; i < 52; i++) {
      if (heroSet.has(i)) {
        cards.push({ cardIndex: i, status: "hero" });
      } else if (communitySet.has(i)) {
        cards.push({ cardIndex: i, status: "community" });
      } else if (deadSet.has(i)) {
        cards.push({ cardIndex: i, status: "dead" });
      } else if (threatMap.has(i)) {
        const t = threatMap.get(i)!;
        cards.push({
          cardIndex: i,
          status: "threat",
          threatUrgency: t.urgency,
          reason: t.reason,
        });
      } else if (outSet.has(i)) {
        cards.push({ cardIndex: i, status: "out", reason: "Improves hand" });
      } else {
        cards.push({ cardIndex: i, status: "neutral" });
      }
    }

    return cards;
  }, [heroCards, communityCards, deadCards, results]);
}
