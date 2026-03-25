/**
 * Opponent Story Engine — integration layer that composes range estimation,
 * board texture, threat analysis, and equity into a coherent narrative about
 * what an opponent's actions reveal about their holdings.
 *
 * Two consumers:
 *   1. UI: "What's your opponent's story?" prompt for narrative training
 *   2. Coaching: adjusts GTO recommendations based on opponent's likely range
 *
 * Pure TypeScript, zero Convex imports.
 */
import type { CardIndex, Position, Street } from "../types/cards";
import type { OpponentProfile, PlayerAction, WeightedRange } from "../types/opponents";
import type { ExplanationNode } from "../types/analysis";
import { estimateRange, type RangeEstimation } from "../opponents/rangeEstimator";
import { equityVsRange } from "./opponentRead";
import type { EquityResult } from "./monteCarlo";
import { analyzeBoard, type BoardTexture } from "../opponents/engines/boardTexture";
import { rankOf, rankValue, suitValue, cardToDisplay } from "../primitives/card";
import { evaluateHand } from "../primitives/handEvaluator";
import { rangePct } from "../opponents/combos";

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

export interface OpponentStory {
  /** Street-by-street narrative of what opponent's actions reveal */
  streetNarratives: StreetNarrative[];
  /** Current range assessment in plain language */
  rangeNarrative: string;
  /** How this affects hero's hand strength */
  heroImplication: string;
  /** Adjusted action recommendation given opponent's story */
  adjustedAction: "fold" | "call" | "bet" | "raise" | "check";
  /** Confidence in the read */
  confidence: "strong" | "moderate" | "speculative";
  /** Raw data for coaching consumption */
  data: {
    estimatedRange: WeightedRange;
    equityVsRange: number;
    potOddsNeeded: number;
    rangePercent: number;
    boardTexture: BoardTexture;
    heroHandStrength: number;
  };
  /** Explanation tree for UI rendering */
  explanation: ExplanationNode;
}

export interface StreetNarrative {
  street: Street;
  action: string;
  amount?: number;
  /** What this action reveals */
  interpretation: string;
  /** How the range narrowed */
  rangeUpdate: string;
}

// ═══════════════════════════════════════════════════════
// CORE
// ═══════════════════════════════════════════════════════

/**
 * Build a narrative about what an opponent's actions reveal about their holdings.
 * Composes range estimation + board texture + equity into a coherent story.
 */
export function buildOpponentStory(
  heroCards: CardIndex[],
  communityCards: CardIndex[],
  opponentActions: PlayerAction[],
  opponentProfile: OpponentProfile,
  opponentPosition: Position | undefined,
  potBB: number,
  callCostBB: number,
  street: Street,
  deadCards: CardIndex[] = [],
  boardTexture?: BoardTexture,
): OpponentStory {
  // 1. Estimate opponent's range from their action sequence
  const knownCards = [...heroCards, ...communityCards, ...deadCards];
  const rangeEst = estimateRange(
    opponentProfile,
    opponentActions,
    knownCards,
    opponentPosition,
  );

  // 2. Analyze board texture (use pre-computed if provided)
  const boardTex = boardTexture ?? (communityCards.length >= 3
    ? analyzeBoard(communityCards)
    : { wetness: 0.5, isMonotone: false, isTwoTone: false, isRainbow: true,
        isPaired: false, isTrips: false, hasConnectors: false, highCard: 12,
        flushPossible: false, straightHeavy: false, cardCount: 0, description: "preflop" } as BoardTexture);

  // 3. Compute equity vs estimated range
  let equityResult: EquityResult;
  if (heroCards.length === 2 && rangeEst.range.size > 0) {
    equityResult = equityVsRange(heroCards, communityCards, rangeEst.range, deadCards, 3000);
  } else {
    equityResult = { win: 0.5, tie: 0, lose: 0.5, trials: 0, handDistribution: {} };
  }

  // 4. Evaluate hero hand strength
  const heroStrength = evaluateHeroStrength(heroCards, communityCards);

  // 5. Build street-by-street narratives
  const streetNarratives = buildStreetNarratives(
    opponentActions,
    opponentProfile,
    communityCards,
    boardTex,
  );

  // 6. Build range narrative
  const rangePctVal = rangeEst.rangePctOfAll;
  const rangeNarrative = buildRangeNarrative(rangePctVal, opponentProfile.name, streetNarratives);

  // 7. Compute hero implication
  const potOddsNeeded = callCostBB > 0 ? callCostBB / (potBB + callCostBB) : 0;
  const heroImplication = buildHeroImplication(
    equityResult.win,
    potOddsNeeded,
    heroStrength,
    rangePctVal,
    communityCards,
    heroCards,
  );

  // 8. Determine adjusted action
  const adjustedAction = computeAdjustedAction(
    equityResult.win,
    potOddsNeeded,
    heroStrength,
    rangePctVal,
    callCostBB,
    street,
  );

  // 9. Determine confidence — consider both action count and range narrowing
  const actionCount = opponentActions.filter(a => a.actionType !== "fold").length;
  const confidence: OpponentStory["confidence"] =
    actionCount >= 3 ? "strong" :
    actionCount >= 2 ? "moderate" :
    rangePctVal < 20 ? "moderate" : "speculative";

  // 10. Build explanation tree
  const explanation = buildExplanationTree(
    streetNarratives,
    rangeNarrative,
    heroImplication,
    equityResult,
    potOddsNeeded,
    confidence,
    opponentProfile.name,
  );

  return {
    streetNarratives,
    rangeNarrative,
    heroImplication,
    adjustedAction,
    confidence,
    data: {
      estimatedRange: rangeEst.range,
      equityVsRange: equityResult.win,
      potOddsNeeded,
      rangePercent: rangePctVal,
      boardTexture: boardTex,
      heroHandStrength: heroStrength,
    },
    explanation,
  };
}

// ═══════════════════════════════════════════════════════
// STREET NARRATIVES
// ═══════════════════════════════════════════════════════

function buildStreetNarratives(
  actions: PlayerAction[],
  profile: OpponentProfile,
  communityCards: CardIndex[],
  boardTexture: BoardTexture,
): StreetNarrative[] {
  const narratives: StreetNarrative[] = [];
  // Track range narrowing across actions
  let prevRangePct = 100;

  // Incrementally estimate range after each action to get street-by-street narrowing
  const knownCards = [...communityCards];
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const actionsUpTo = actions.slice(0, i + 1);
    const rangeAfter = estimateRange(profile, actionsUpTo, knownCards, undefined);
    const newPct = rangeAfter.rangePctOfAll;

    const interpretation = interpretAction(
      action,
      boardTexture,
      communityCards,
      prevRangePct,
      newPct,
      profile.name,
    );

    const narrowing = newPct < prevRangePct
      ? `Range narrowed from ~${prevRangePct.toFixed(0)}% to ~${newPct.toFixed(0)}%`
      : `Range unchanged at ~${newPct.toFixed(0)}%`;

    narratives.push({
      street: action.street,
      action: action.actionType,
      amount: action.amount,
      interpretation,
      rangeUpdate: narrowing,
    });

    prevRangePct = newPct;
  }

  return narratives;
}

function interpretAction(
  action: PlayerAction,
  boardTexture: BoardTexture,
  communityCards: CardIndex[],
  prevPct: number,
  newPct: number,
  profileName: string,
): string {
  const { street, actionType, amount } = action;
  const boardDesc = describeBoardBriefly(communityCards);

  switch (actionType) {
    case "fold":
      return `${profileName} folded — giving up on this hand.`;

    case "check":
      if (street === "preflop") {
        return `${profileName} checked from the big blind — could have anything.`;
      }
      return `${profileName} checked${boardDesc ? ` on ${boardDesc}` : ""}. Showing weakness, pot controlling, or setting a trap.`;

    case "call": {
      if (street === "preflop") {
        return `${profileName} called preflop — entered with a playable hand but didn't raise.`;
      }
      const narrowed = prevPct - newPct > 5;
      const boardContext = getBoardThreatContext(communityCards, boardTexture);
      if (narrowed && boardContext) {
        return `${profileName} called${boardDesc ? ` on ${boardDesc}` : ""}. ${boardContext} Their continuing range is weighted toward hands that connect with this board.`;
      }
      return `${profileName} called${amount ? ` ${amount} BB` : ""}${boardDesc ? ` on ${boardDesc}` : ""} — continuing with a hand they like.`;
    }

    case "bet": {
      if (street === "preflop") {
        return `${profileName} opened with a raise — shows confidence preflop.`;
      }
      const sizeLabel = amount && amount > 0 ? describeBetSize(amount, 0) : "";
      return `${profileName} bet${sizeLabel}${boardDesc ? ` on ${boardDesc}` : ""} — representing strength or semi-bluffing.`;
    }

    case "raise": {
      if (street === "preflop") {
        const raiseLevel = prevPct < 30 ? "3-bet" : "raised";
        return `${profileName} ${raiseLevel} preflop — showing a strong hand or applying pressure.`;
      }
      return `${profileName} raised${boardDesc ? ` on ${boardDesc}` : ""} — significant strength signal. Their range narrows to strong made hands and occasional bluffs.`;
    }

    case "all_in":
      return `${profileName} went all-in — maximum commitment. Very narrow range: the nuts, near-nuts, or a desperate bluff.`;

    default:
      return `${profileName} acted (${actionType}).`;
  }
}

// ═══════════════════════════════════════════════════════
// RANGE & HERO NARRATIVES
// ═══════════════════════════════════════════════════════

function buildRangeNarrative(
  rangePct: number,
  profileName: string,
  streetNarratives: StreetNarrative[],
): string {
  const actionCount = streetNarratives.length;

  if (rangePct < 5) {
    return `${profileName}'s range is very narrow (~${rangePct.toFixed(0)}% of hands). After ${actionCount} actions, they almost certainly have a premium hand.`;
  }
  if (rangePct < 15) {
    return `${profileName}'s range is narrow (~${rangePct.toFixed(0)}% of hands). Their actions indicate a strong holding — top pair or better, or a strong draw.`;
  }
  if (rangePct < 30) {
    return `${profileName}'s range is moderate (~${rangePct.toFixed(0)}% of hands). They could have a variety of made hands and draws.`;
  }
  return `${profileName}'s range is still wide (~${rangePct.toFixed(0)}% of hands). Not enough information to narrow down their holdings precisely.`;
}

function buildHeroImplication(
  equityVsRange: number,
  potOddsNeeded: number,
  heroStrength: number,
  oppRangePct: number,
  communityCards: CardIndex[],
  heroCards: CardIndex[],
): string {
  const eqPct = (equityVsRange * 100).toFixed(0);
  const potOddsPct = (potOddsNeeded * 100).toFixed(0);

  if (equityVsRange < 0.25) {
    return `You have only ${eqPct}% equity against their estimated range. You're significantly behind — their story says they have you beat.`;
  }
  if (equityVsRange < potOddsNeeded) {
    return `You have ${eqPct}% equity but need ${potOddsPct}% to call profitably. The math doesn't support continuing against their range.`;
  }
  if (equityVsRange < 0.45) {
    return `You have ${eqPct}% equity against their range — it's close. Consider pot odds and position before committing more chips.`;
  }
  if (equityVsRange < 0.6) {
    return `You have ${eqPct}% equity — slight edge against their range. Value betting is reasonable but be cautious of raises.`;
  }
  return `You have ${eqPct}% equity — strong favorite against their estimated range. Bet for value.`;
}

// ═══════════════════════════════════════════════════════
// ADJUSTED ACTION
// ═══════════════════════════════════════════════════════

function computeAdjustedAction(
  equityVsRange: number,
  potOddsNeeded: number,
  heroStrength: number,
  oppRangePct: number,
  callCostBB: number,
  street: Street,
): OpponentStory["adjustedAction"] {
  // No call needed — check or bet decision
  if (callCostBB === 0) {
    if (equityVsRange > 0.55 && heroStrength > 0.5) return "bet";
    if (equityVsRange > 0.45) return "check"; // marginal — pot control
    return "check"; // behind, don't build pot
  }

  // Facing a bet — fold/call/raise decision
  if (equityVsRange < potOddsNeeded * 0.7) return "fold"; // significantly behind
  if (equityVsRange < potOddsNeeded) return "fold"; // behind, not getting odds
  if (equityVsRange > 0.6 && heroStrength > 0.7) return "raise"; // strong value raise
  return "call"; // getting odds, continue
}

// ═══════════════════════════════════════════════════════
// EXPLANATION TREE
// ═══════════════════════════════════════════════════════

function buildExplanationTree(
  streetNarratives: StreetNarrative[],
  rangeNarrative: string,
  heroImplication: string,
  equityResult: EquityResult,
  potOddsNeeded: number,
  confidence: OpponentStory["confidence"],
  profileName: string,
): ExplanationNode {
  const streetChildren: ExplanationNode[] = streetNarratives.map((sn) => ({
    summary: `${sn.street}: ${sn.action}${sn.amount ? ` ${sn.amount} BB` : ""}`,
    detail: sn.interpretation,
    sentiment: sn.action === "fold" ? "negative" as const :
      sn.action === "raise" || sn.action === "all_in" ? "warning" as const : "neutral" as const,
    children: [{
      summary: sn.rangeUpdate,
      sentiment: "neutral" as const,
    }],
    tags: ["opponent-action"],
  }));

  return {
    summary: `${profileName}'s story (${confidence} read)`,
    detail: rangeNarrative,
    sentiment: equityResult.win < potOddsNeeded ? "warning" : "neutral",
    children: [
      {
        summary: "Action sequence",
        children: streetChildren,
        tags: ["opponent-actions"],
      },
      {
        summary: `Your equity: ${(equityResult.win * 100).toFixed(0)}% vs their range`,
        detail: heroImplication,
        sentiment: equityResult.win < potOddsNeeded ? "negative" :
          equityResult.win > 0.55 ? "positive" : "neutral",
        tags: ["equity-vs-range"],
      },
    ],
    tags: ["opponent-story"],
  };
}

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

function evaluateHeroStrength(heroCards: CardIndex[], communityCards: CardIndex[]): number {
  if (heroCards.length < 2) return 0.5;
  if (communityCards.length < 3) {
    // Preflop strength heuristic
    const r1 = rankValue(heroCards[0]);
    const r2 = rankValue(heroCards[1]);
    const high = Math.max(r1, r2);
    const low = Math.min(r1, r2);
    const paired = r1 === r2;
    const suited = suitValue(heroCards[0]) === suitValue(heroCards[1]);
    let strength = (high + low) / 24; // 0-1 scale
    if (paired) strength += 0.2;
    if (suited) strength += 0.05;
    return Math.min(strength, 1);
  }

  // Postflop — use hand evaluator
  const allCards = [...heroCards, ...communityCards];
  const evaluated = evaluateHand(allCards);
  // Map tier to strength: high_card=0.1, pair=0.3, two_pair=0.5, trips=0.65, straight=0.75, flush=0.8, full_house=0.9, quads=0.95, straight_flush=1.0
  const tierMap: Record<string, number> = {
    high_card: 0.1, one_pair: 0.35, two_pair: 0.55,
    three_of_a_kind: 0.7, straight: 0.8, flush: 0.85,
    full_house: 0.92, four_of_a_kind: 0.97, straight_flush: 1.0,
  };
  return tierMap[evaluated.rank.tier] ?? 0.3;
}

function describeBoardBriefly(communityCards: CardIndex[]): string {
  if (communityCards.length < 3) return "";
  const cards = communityCards.map(c => cardToDisplay(c));
  return cards.join(" ");
}

function getBoardThreatContext(communityCards: CardIndex[], texture: BoardTexture): string | null {
  if (communityCards.length < 3) return null;

  const highRank = rankValue(communityCards.reduce((a, b) => rankValue(a) > rankValue(b) ? a : b));

  const parts: string[] = [];
  if (highRank >= 12) parts.push("With an ace on the board, they likely hold Ax.");
  else if (highRank >= 11) parts.push("High board — they probably connect with a king or queen.");
  if (texture.flushPossible) parts.push("Flush draw possible — they could be on a draw.");
  if (texture.straightHeavy) parts.push("Connected board — straight draws are likely.");

  return parts.length > 0 ? parts.join(" ") : null;
}

function describeBetSize(amount: number, _potSize: number): string {
  return ` ${amount} BB`;
}
