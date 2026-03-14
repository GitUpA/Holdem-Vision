/**
 * DrawLens — identifies active draws (flush, straight, combo).
 *
 * Detects specific draw types and their outs, rather than generic
 * "does this card improve?" like OutsLens.
 */
import type { AnalysisLens, AnalysisContext, AnalysisResult, ExplanationNode } from "../types/analysis";
import type { VisualDirective, CardHighlight } from "../types/visuals";
import type { CardIndex } from "../types/cards";
import { rankValue, suitValue, createDeck } from "../primitives/card";

export interface Draw {
  type: "flush_draw" | "straight_draw" | "oesd" | "gutshot" | "backdoor_flush" | "backdoor_straight";
  outs: CardIndex[];
  outsCount: number;
  /** Probability of completing the draw by the river (0–1). */
  probability: number;
  description: string;
}

export interface DrawValue {
  draws: Draw[];
  hasFlushDraw: boolean;
  hasStraightDraw: boolean;
  isCombo: boolean;
  totalDrawOuts: number;
}

export const drawLens: AnalysisLens = {
  id: "draws",
  name: "Draw Analysis",
  description: "Flush, straight, and combo draw detection",

  analyze(context: AnalysisContext): AnalysisResult<DrawValue> {
    const { heroCards, communityCards, deadCards } = context;

    if (communityCards.length < 3) {
      return emptyResult(context);
    }

    const allKnown = new Set([...heroCards, ...communityCards, ...deadCards]);
    const remaining = createDeck().filter((c) => !allKnown.has(c));

    const draws: Draw[] = [];

    // Detect flush draws
    const flushDraw = detectFlushDraw(heroCards, communityCards, remaining);
    if (flushDraw) draws.push(flushDraw);

    // Detect backdoor draws (flop only — need 2 cards to complete)
    if (communityCards.length === 3) {
      const backdoorFlush = detectBackdoorFlushDraw(heroCards, communityCards, remaining);
      if (backdoorFlush) draws.push(backdoorFlush);

      const backdoorStraights = detectBackdoorStraightDraws(heroCards, communityCards, remaining);
      draws.push(...backdoorStraights);
    }

    // Detect straight draws (need 1 card)
    const straightDraws = detectStraightDraws(heroCards, communityCards, remaining);
    draws.push(...straightDraws);

    const hasFlushDraw = draws.some((d) => d.type === "flush_draw");
    const hasStraightDraw = draws.some((d) =>
      d.type === "straight_draw" || d.type === "oesd" || d.type === "gutshot",
    );
    const isCombo = hasFlushDraw && hasStraightDraw;

    // Deduplicate outs across draws
    const allOuts = new Set<CardIndex>();
    for (const d of draws) {
      for (const o of d.outs) allOuts.add(o);
    }

    const value: DrawValue = {
      draws,
      hasFlushDraw,
      hasStraightDraw,
      isCombo,
      totalDrawOuts: allOuts.size,
    };

    return {
      value,
      context,
      explanation: buildExplanation(value),
      visuals: buildVisuals(value, allOuts),
      lensId: "draws",
      dependencies: [],
    };
  },
};

// ─── Probability helpers ───

/** Probability of hitting at least 1 out with cardsTocome cards remaining. */
function drawProbability(outs: number, remaining: number, cardsToCome: number): number {
  if (outs <= 0 || remaining <= 0) return 0;
  if (cardsToCome === 1) return outs / remaining;
  // 2 cards to come: 1 - P(miss both)
  const missBoth = ((remaining - outs) / remaining) * ((remaining - 1 - outs) / (remaining - 1));
  return 1 - missBoth;
}

/** Probability of runner-runner: need 1 of outsA then 1 of outsB on next 2 cards. */
function runnerRunnerProbability(outsA: number, outsB: number, remaining: number): number {
  if (remaining < 2) return 0;
  // P = (outsA/R * outsB/(R-1)) + (outsB/R * outsA/(R-1)) — but these overlap when A=B
  // Simplified: 2 * outsA * outsB / (R * (R-1)) when A ≠ B sets
  return (2 * outsA * outsB) / (remaining * (remaining - 1));
}

function pctLabel(p: number): string {
  return `${(p * 100).toFixed(1)}%`;
}

// ─── Draw detection ───

function detectFlushDraw(
  heroCards: CardIndex[],
  communityCards: CardIndex[],
  remaining: CardIndex[],
): Draw | null {
  const allCards = [...heroCards, ...communityCards];

  for (let suit = 0; suit < 4; suit++) {
    const suitCards = allCards.filter((c) => suitValue(c) === suit);
    const heroSuitCards = heroCards.filter((c) => suitValue(c) === suit);

    // Need at least 1 hero card of the suit and 4 total cards of the suit
    if (suitCards.length === 4 && heroSuitCards.length >= 1) {
      const outs = remaining.filter((c) => suitValue(c) === suit);
      const suitName = ["clubs", "diamonds", "hearts", "spades"][suit];
      const cardsToCome = communityCards.length === 3 ? 2 : 1;
      const prob = drawProbability(outs.length, remaining.length, cardsToCome);
      return {
        type: "flush_draw",
        outs,
        outsCount: outs.length,
        probability: prob,
        description: `Flush draw in ${suitName} (${outs.length} outs, ${pctLabel(prob)})`,
      };
    }
  }
  return null;
}

function detectBackdoorFlushDraw(
  heroCards: CardIndex[],
  communityCards: CardIndex[],
  remaining: CardIndex[],
): Draw | null {
  const allCards = [...heroCards, ...communityCards];

  for (let suit = 0; suit < 4; suit++) {
    const suitCards = allCards.filter((c) => suitValue(c) === suit);
    const heroSuitCards = heroCards.filter((c) => suitValue(c) === suit);

    // 3 cards of the suit with at least 1 from hero = backdoor flush draw
    if (suitCards.length === 3 && heroSuitCards.length >= 1) {
      const outs = remaining.filter((c) => suitValue(c) === suit);
      const suitName = ["clubs", "diamonds", "hearts", "spades"][suit];
      // Runner-runner: need 2 of the suited outs = C(outs,2) / C(R,2)
      const R = remaining.length;
      const prob = R >= 2 ? (outs.length * (outs.length - 1)) / (R * (R - 1)) : 0;
      return {
        type: "backdoor_flush",
        outs,
        outsCount: outs.length,
        probability: prob,
        description: `Backdoor flush draw in ${suitName} (${pctLabel(prob)})`,
      };
    }
  }
  return null;
}

function detectStraightDraws(
  heroCards: CardIndex[],
  communityCards: CardIndex[],
  remaining: CardIndex[],
): Draw[] {
  const allCards = [...heroCards, ...communityCards];
  const allRanks = [...new Set(allCards.map(rankValue))].sort((a, b) => a - b);
  const heroRanks = new Set(heroCards.map(rankValue));
  const draws: Draw[] = [];

  // Check each 5-rank window for OESD and gutshot
  // Also check ace-low (wheel) windows
  const windows: number[][] = [];
  for (let low = 0; low <= 9; low++) {
    windows.push([low, low + 1, low + 2, low + 3, low + 4]);
  }
  // Wheel window
  windows.push([0, 1, 2, 3, 12]);

  const foundTypes = new Set<string>();

  for (const window of windows) {
    const haveCount = window.filter((r) => allRanks.includes(r)).length;
    const heroContributes = window.some((r) => heroRanks.has(r));

    if (haveCount === 4 && heroContributes) {
      const missing = window.filter((r) => !allRanks.includes(r));

      if (missing.length === 1) {
        // Find actual card outs for the missing rank
        const outs = remaining.filter((c) => rankValue(c) === missing[0]);

        // Is this an OESD (open-ended) or gutshot?
        const isOpenEnded = isOESD(window, allRanks, missing[0]);
        const drawType = isOpenEnded ? "oesd" : "gutshot";
        const key = `${drawType}-${missing[0]}`;

        if (!foundTypes.has(key)) {
          foundTypes.add(key);
          const missingRank = rankNameFromVal(missing[0]);
          const cardsToCome = communityCards.length === 3 ? 2 : 1;
          const prob = drawProbability(outs.length, remaining.length, cardsToCome);
          draws.push({
            type: drawType,
            outs,
            outsCount: outs.length,
            probability: prob,
            description: isOpenEnded
              ? `Open-ended straight draw (need ${missingRank}, ${outs.length} outs, ${pctLabel(prob)})`
              : `Gutshot straight draw (need ${missingRank}, ${outs.length} outs, ${pctLabel(prob)})`,
          });
        }
      }
    }
  }

  return draws;
}

function detectBackdoorStraightDraws(
  heroCards: CardIndex[],
  communityCards: CardIndex[],
  remaining: CardIndex[],
): Draw[] {
  const allCards = [...heroCards, ...communityCards];
  const allRanks = [...new Set(allCards.map(rankValue))].sort((a, b) => a - b);
  const heroRanks = new Set(heroCards.map(rankValue));
  const draws: Draw[] = [];

  // Check each 5-rank window — need exactly 3 of 5 ranks present with hero contributing
  const windows: number[][] = [];
  for (let low = 0; low <= 9; low++) {
    windows.push([low, low + 1, low + 2, low + 3, low + 4]);
  }
  // Wheel window
  windows.push([0, 1, 2, 3, 12]);

  const found = new Set<string>();

  for (const window of windows) {
    const haveCount = window.filter((r) => allRanks.includes(r)).length;
    const heroContributes = window.some((r) => heroRanks.has(r));

    if (haveCount === 3 && heroContributes) {
      const missing = window.filter((r) => !allRanks.includes(r));
      if (missing.length !== 2) continue;

      // Key by sorted missing ranks to deduplicate
      const key = missing.sort((a, b) => a - b).join("-");
      if (found.has(key)) continue;
      found.add(key);

      // Outs = cards of either missing rank
      const outs = remaining.filter((c) => missing.includes(rankValue(c)));
      const need1 = rankNameFromVal(missing[0]);
      const need2 = rankNameFromVal(missing[1]);
      // Runner-runner: need one of rank1 then one of rank2 (in either order)
      const outsA = remaining.filter((c) => rankValue(c) === missing[0]).length;
      const outsB = remaining.filter((c) => rankValue(c) === missing[1]).length;
      const prob = runnerRunnerProbability(outsA, outsB, remaining.length);

      draws.push({
        type: "backdoor_straight",
        outs,
        outsCount: outs.length,
        probability: prob,
        description: `Backdoor straight draw (need ${need1} + ${need2}, ${pctLabel(prob)})`,
      });
    }
  }

  return draws;
}

function isOESD(window: number[], haveRanks: number[], missingRank: number): boolean {
  // OESD = missing card is at either end of the window
  // Wheel is a special case — always considered a gutshot equivalent
  if (window.includes(12) && window.includes(0)) {
    return false; // Wheel draws are never truly "open-ended"
  }
  return missingRank === window[0] || missingRank === window[4];
}

function rankNameFromVal(rankVal: number): string {
  const names = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
  return names[rankVal];
}

function emptyResult(context: AnalysisContext): AnalysisResult<DrawValue> {
  return {
    value: {
      draws: [],
      hasFlushDraw: false,
      hasStraightDraw: false,
      isCombo: false,
      totalDrawOuts: 0,
    },
    context,
    explanation: {
      summary: "Draw analysis requires community cards",
      sentiment: "neutral",
      tags: ["draws"],
    },
    visuals: [],
    lensId: "draws",
    dependencies: [],
  };
}

function buildExplanation(value: DrawValue): ExplanationNode {
  const { draws, isCombo, totalDrawOuts } = value;

  if (draws.length === 0) {
    return {
      summary: "No active draws",
      detail: "Hero has no flush or straight draws.",
      sentiment: "neutral",
      tags: ["draws"],
    };
  }

  const sentiment = isCombo ? "positive"
    : totalDrawOuts >= 8 ? "positive"
    : totalDrawOuts >= 4 ? "neutral"
    : "warning";

  const children: ExplanationNode[] = draws.map((d) => ({
    summary: d.description,
    sentiment: d.probability >= 0.3 ? "positive" as const
      : d.probability >= 0.15 ? "neutral" as const
      : "warning" as const,
    tags: ["draw-type", d.type],
  }));

  const hasBackdoorOnly = draws.every((d) => d.type === "backdoor_flush" || d.type === "backdoor_straight");
  const mainDraw = hasBackdoorOnly ? "Backdoor draw(s)"
    : isCombo ? "Combo draw"
    : value.hasFlushDraw ? "Flush draw"
    : value.hasStraightDraw ? "Straight draw"
    : "Draw";

  return {
    summary: `${mainDraw} — ${totalDrawOuts} combined outs`,
    detail: `${draws.length} active draw(s) detected.`,
    sentiment,
    children,
    tags: ["draws"],
  };
}

function buildVisuals(value: DrawValue, allOuts: Set<CardIndex>): VisualDirective[] {
  if (value.draws.length === 0) return [];

  const highlights: CardHighlight[] = [...allOuts].map((cardIndex) => {
    const draw = value.draws.find((d) => d.outs.includes(cardIndex));
    return {
      cardIndex,
      status: "out" as const,
      reason: draw?.description ?? "Draw out",
      urgency: 0.6,
    };
  });

  return [
    {
      type: "outs_display",
      data: {
        highlights,
        draws: value.draws.map((d) => ({
          type: d.type,
          outsCount: d.outsCount,
          probability: d.probability,
          description: d.description,
        })),
        isCombo: value.isCombo,
        totalDrawOuts: value.totalDrawOuts,
      },
      priority: 5,
      lensId: "draws",
    },
  ];
}
