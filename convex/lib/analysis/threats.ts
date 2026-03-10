/**
 * ThreatLens — identifies which remaining cards are dangerous for the hero.
 *
 * For each card that could come on the next street, determines:
 * - Does it complete a flush for opponents?
 * - Does it complete a straight for opponents?
 * - Does it pair the board (giving opponents trips/full house)?
 * - Does it give opponents a higher pair?
 * - How much does it hurt hero's equity?
 *
 * Returns CardHighlight[] with urgency levels and explanations.
 */
import type { AnalysisLens, AnalysisContext, AnalysisResult, ExplanationNode } from "../types/analysis";
import type { VisualDirective, CardHighlight } from "../types/visuals";
import type { CardIndex } from "../types/cards";
import { rankOf, suitOf, rankValue, suitValue, cardToDisplay, createDeck } from "../primitives/card";

export interface ThreatCard {
  cardIndex: CardIndex;
  urgency: number;       // 0-1 (1 = most dangerous)
  reasons: string[];
  categories: ThreatCategory[];
}

export type ThreatCategory =
  | "completes_flush"
  | "completes_straight"
  | "pairs_board"
  | "overcards"
  | "counterfeit";

export interface ThreatValue {
  threats: ThreatCard[];
  safeCards: CardIndex[];
  threatCount: number;
  safeCount: number;
}

export const threatLens: AnalysisLens = {
  id: "threats",
  name: "Threat Analysis",
  description: "Identifies which remaining cards are dangerous",

  analyze(context: AnalysisContext): AnalysisResult<ThreatValue> {
    const { heroCards, communityCards, deadCards } = context;

    // Need community cards for threat analysis
    if (communityCards.length < 3) {
      return emptyResult(context);
    }

    const allKnown = new Set([...heroCards, ...communityCards, ...deadCards]);
    const remaining = createDeck().filter((c) => !allKnown.has(c));

    const allCards = [...heroCards, ...communityCards];
    const heroRanks = heroCards.map(rankValue);
    const communityRanks = communityCards.map(rankValue);
    const communitySuits = communityCards.map(suitValue);

    const threats: ThreatCard[] = [];
    const safeCards: CardIndex[] = [];

    for (const card of remaining) {
      const reasons: string[] = [];
      const categories: ThreatCategory[] = [];
      let urgency = 0;

      // Check: completes a flush?
      const cardSuit = suitValue(card);
      const suitCount = communitySuits.filter((s) => s === cardSuit).length;
      // If 2 of this suit on board, a 3rd makes flush possible for anyone holding 2 of the suit
      if (suitCount >= 2) {
        const heroHasSuit = heroCards.some((c) => suitValue(c) === cardSuit);
        if (!heroHasSuit) {
          // Dangerous — opponent could have the flush
          const threatLevel = suitCount === 3 ? 0.9 : suitCount === 2 ? 0.6 : 0.3;
          urgency = Math.max(urgency, threatLevel);
          reasons.push(
            suitCount === 3
              ? `4th ${suitName(cardSuit)} — flush very likely for opponents`
              : `3rd ${suitName(cardSuit)} — flush draw completes for opponents`,
          );
          categories.push("completes_flush");
        } else if (suitCount >= 3) {
          // Even if hero has one of the suit, 4 on board means opponents with one high card of suit win
          urgency = Math.max(urgency, 0.4);
          reasons.push(`4th ${suitName(cardSuit)} — opponents with a high ${suitName(cardSuit)} threaten a flush`);
          categories.push("completes_flush");
        }
      }

      // Check: completes a straight?
      const straightThreat = checkStraightThreat(card, communityRanks, heroRanks);
      if (straightThreat) {
        urgency = Math.max(urgency, straightThreat.urgency);
        reasons.push(straightThreat.reason);
        categories.push("completes_straight");
      }

      // Check: pairs the board?
      const cardRank = rankValue(card);
      const boardPairCount = communityRanks.filter((r) => r === cardRank).length;
      if (boardPairCount >= 1) {
        const heroHasRank = heroRanks.includes(cardRank);
        if (!heroHasRank) {
          const pairUrgency = boardPairCount >= 2 ? 0.5 : 0.35;
          urgency = Math.max(urgency, pairUrgency);
          reasons.push(
            boardPairCount >= 2
              ? `Trips the ${rankOf(card)} on the board — full house possible for opponents`
              : `Pairs the ${rankOf(card)} — opponents with a ${rankOf(card)} make trips`,
          );
          categories.push("pairs_board");
        }
      }

      // Check: overcard to hero's pair?
      if (communityCards.length >= 3) {
        const heroPairRank = findHeroPairRank(heroRanks, communityRanks);
        if (heroPairRank !== null && cardRank > heroPairRank) {
          const overcardUrgency = 0.3;
          urgency = Math.max(urgency, overcardUrgency);
          reasons.push(`Overcard ${rankOf(card)} threatens hero's pair of ${rankName(heroPairRank)}s`);
          categories.push("overcards");
        }
      }

      if (reasons.length > 0) {
        threats.push({ cardIndex: card, urgency, reasons, categories });
      } else {
        safeCards.push(card);
      }
    }

    // Sort threats by urgency (most dangerous first)
    threats.sort((a, b) => b.urgency - a.urgency);

    const value: ThreatValue = {
      threats,
      safeCards,
      threatCount: threats.length,
      safeCount: safeCards.length,
    };

    return {
      value,
      context,
      explanation: buildExplanation(context, value),
      visuals: buildVisuals(value),
      lensId: "threats",
      dependencies: [],
    };
  },
};

// ─── Helpers ───

function checkStraightThreat(
  card: CardIndex,
  communityRanks: number[],
  heroRanks: number[],
): { urgency: number; reason: string } | null {
  const cardRank = rankValue(card);
  const allRanks = [...communityRanks, cardRank];

  // Check all possible 5-card straight windows
  // A straight needs 5 consecutive ranks. Check if adding this card
  // creates 4+ consecutive ranks on the board (meaning any opponent
  // with the right card completes a straight).
  for (let low = 0; low <= 9; low++) {
    const window = [low, low + 1, low + 2, low + 3, low + 4];
    // Handle ace-low (wheel): [0,1,2,3,12]
    if (low === 0) {
      const wheelWindow = [0, 1, 2, 3, 12];
      const boardHits = wheelWindow.filter((r) => allRanks.includes(r)).length;
      const heroHits = wheelWindow.filter((r) => heroRanks.includes(r)).length;
      if (boardHits >= 4 && heroHits < 2) {
        return {
          urgency: 0.55,
          reason: `${rankOf(card)} creates straight possibility (wheel)`,
        };
      }
    }

    const boardHits = window.filter((r) => allRanks.includes(r)).length;
    if (boardHits >= 4) {
      // 4 of 5 consecutive on board+card — opponent needs just 1 card
      const heroHits = window.filter((r) => heroRanks.includes(r)).length;
      if (heroHits < 2) {
        // Hero doesn't have both ends — dangerous
        return {
          urgency: boardHits === 5 ? 0.75 : 0.55,
          reason: boardHits === 5
            ? `${cardToDisplay(card)} puts a straight on the board`
            : `${cardToDisplay(card)} creates a straight draw for opponents`,
        };
      }
    }
  }

  return null;
}

function findHeroPairRank(heroRanks: number[], communityRanks: number[]): number | null {
  for (const hr of heroRanks) {
    if (communityRanks.includes(hr)) return hr;
  }
  return null;
}

function suitName(suitVal: number): string {
  return ["club", "diamond", "heart", "spade"][suitVal];
}

function rankName(rankVal: number): string {
  const names = ["Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Jack", "Queen", "King", "Ace"];
  return names[rankVal];
}

function emptyResult(context: AnalysisContext): AnalysisResult<ThreatValue> {
  return {
    value: { threats: [], safeCards: [], threatCount: 0, safeCount: 0 },
    context,
    explanation: {
      summary: "Threat analysis requires community cards",
      detail: "Deal the flop to see which remaining cards are dangerous.",
      sentiment: "neutral",
      tags: ["threats"],
    },
    visuals: [],
    lensId: "threats",
    dependencies: [],
  };
}

function buildExplanation(context: AnalysisContext, value: ThreatValue): ExplanationNode {
  const { threats, safeCount, threatCount } = value;
  const total = threatCount + safeCount;
  const pct = total > 0 ? ((threatCount / total) * 100).toFixed(0) : "0";

  const highThreats = threats.filter((t) => t.urgency >= 0.6);
  const medThreats = threats.filter((t) => t.urgency >= 0.3 && t.urgency < 0.6);

  const sentiment = highThreats.length > 5 ? "negative"
    : highThreats.length > 2 ? "warning"
    : "neutral";

  const children: ExplanationNode[] = [];

  if (highThreats.length > 0) {
    children.push({
      summary: `${highThreats.length} high-danger cards`,
      sentiment: "negative",
      children: highThreats.slice(0, 8).map((t) => ({
        summary: `${cardToDisplay(t.cardIndex)}: ${t.reasons[0]}`,
        detail: t.reasons.length > 1 ? t.reasons.join(". ") : undefined,
        sentiment: "negative" as const,
        tags: ["threat-card"],
      })),
      tags: ["threat-high"],
    });
  }

  if (medThreats.length > 0) {
    children.push({
      summary: `${medThreats.length} moderate-danger cards`,
      sentiment: "warning",
      children: medThreats.slice(0, 6).map((t) => ({
        summary: `${cardToDisplay(t.cardIndex)}: ${t.reasons[0]}`,
        sentiment: "warning" as const,
        tags: ["threat-card"],
      })),
      tags: ["threat-medium"],
    });
  }

  children.push({
    summary: `${safeCount} safe cards remaining`,
    sentiment: "positive",
    tags: ["threat-safe"],
  });

  return {
    summary: `${threatCount} threat cards (${pct}% of remaining deck)`,
    detail: `Of ${total} unseen cards, ${threatCount} could worsen hero's position.`,
    sentiment,
    children,
    tags: ["threats"],
  };
}

function buildVisuals(value: ThreatValue): VisualDirective[] {
  const highlights: CardHighlight[] = value.threats.map((t) => ({
    cardIndex: t.cardIndex,
    status: "threat" as const,
    reason: t.reasons[0],
    urgency: t.urgency,
  }));

  return [
    {
      type: "threat_map",
      data: {
        highlights,
        threatCount: value.threatCount,
        safeCount: value.safeCount,
      },
      priority: 7,
      lensId: "threats",
    },
  ];
}
