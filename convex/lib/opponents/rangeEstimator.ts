/**
 * Range estimator — narrows an opponent's range based on their profile + actions.
 *
 * The core insight: each action an opponent takes filters their range.
 * A Nit who 3-bets preflop has AA-QQ, AKs. A Fish who calls has top ~50%.
 * A LAG who raises could have anything. The profile defines HOW each action filters.
 *
 * Uses the situation-based profile model: each action is classified into one
 * of 11 standard situations, and the BehavioralParams for that situation drive
 * the range narrowing logic.
 *
 * Pure TypeScript, zero Convex imports.
 */
import type { CardIndex, Position } from "../types/cards";
import type {
  OpponentProfile,
  PlayerAction,
  WeightedRange,
  BehavioralParams,
  SituationKey,
} from "../types/opponents";
import type { ExplanationNode } from "../types/analysis";
import { resolveProfile } from "./profileResolver";
import {
  topPercentRange,
  filterRange,
  rangePct,
  rangeSize,
  HAND_STRENGTH_ORDER,
} from "./combos";
import {
  positionRangeMultiplier,
  positionDisplayName,
} from "../primitives/position";

export interface RangeEstimation {
  range: WeightedRange;
  explanation: ExplanationNode;
  /** What % of all possible hands this range represents */
  rangePctOfAll: number;
}

/**
 * Estimate an opponent's range given their profile and observed actions.
 *
 * Process:
 * 1. Resolve the profile (flatten inheritance)
 * 2. Start with the opening range (preflop.open.continuePct)
 * 3. For each action, classify the situation and apply that situation's params
 * 4. Filter out combos conflicting with known cards
 * 5. Build an explanation tree showing the reasoning at each step
 */
export function estimateRange(
  profile: OpponentProfile,
  actions: PlayerAction[],
  knownCards: CardIndex[],
  position?: Position,
  getBase?: (id: string) => OpponentProfile | undefined,
): RangeEstimation {
  const resolved = resolveProfile(profile, getBase ?? (() => undefined));
  const children: ExplanationNode[] = [];

  const openParams = resolved["preflop.open"];

  // Apply position adjustment to opening range
  const adjustedContinuePct = applyPositionAdjustment(
    openParams.continuePct,
    openParams.positionAwareness,
    position,
  );

  // Step 1: Start with opening range
  let currentRange = topPercentRange(adjustedContinuePct, knownCards);
  let currentPct = adjustedContinuePct;

  const posLabel = position
    ? ` from ${positionDisplayName(position)} (${position.toUpperCase()})`
    : "";

  children.push({
    summary: `Starting range: top ${currentPct.toFixed(0)}% of hands${posLabel}`,
    detail: position
      ? `${profile.name}${posLabel} opens ~${currentPct.toFixed(0)}% of hands (base ${openParams.continuePct}%, position-adjusted). This includes ${describeRangeTop(currentPct)}.`
      : `${profile.name} voluntarily puts money in the pot with ~${openParams.continuePct}% of hands. This includes ${describeRangeTop(currentPct)}.`,
    sentiment: "neutral",
    tags: ["range-start"],
  });

  // Step 2: Apply each action as a filter
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const situationKey = classifyAction(action, actions, i, position);
    const params = resolved[situationKey];

    const result = applyActionWithParams(
      currentRange,
      currentPct,
      action,
      params,
      situationKey,
      profile.name,
      knownCards,
      position,
    );
    currentRange = result.range;
    currentPct = result.newPct;
    children.push(result.explanation);
  }

  // Step 3: Final filter for known cards
  currentRange = filterRange(currentRange, knownCards);
  const finalPct = rangePct(currentRange);

  const sentiment =
    finalPct < 10 ? "warning" : finalPct < 25 ? "neutral" : "positive";

  return {
    range: currentRange,
    explanation: {
      summary: `${profile.name}'s estimated range: ~${finalPct.toFixed(0)}% of hands`,
      detail: `After analyzing ${actions.length} action(s), ${profile.name}'s range is narrowed to approximately ${rangeSize(currentRange).toFixed(0)} combos (~${finalPct.toFixed(1)}% of all starting hands).`,
      sentiment,
      children,
      tags: ["range-estimation"],
    },
    rangePctOfAll: finalPct,
  };
}

// ─── Situation classification ───

/**
 * Classify which poker situation an action corresponds to.
 * Uses the action itself + prior actions + position to determine the key.
 */
export function classifyAction(
  action: PlayerAction,
  allActions: PlayerAction[],
  actionIndex: number,
  position?: Position,
): SituationKey {
  const { street, actionType: _actionType } = action;

  if (street === "preflop") {
    return classifyPreflopAction(action, allActions, actionIndex);
  }

  return classifyPostflopAction(action, allActions, actionIndex, position);
}

function classifyPreflopAction(
  action: PlayerAction,
  allActions: PlayerAction[],
  actionIndex: number,
): SituationKey {
  // Count raises/bets from THIS opponent before this action
  const priorRaises = allActions
    .slice(0, actionIndex)
    .filter(
      (a) =>
        a.street === "preflop" &&
        (a.actionType === "raise" || a.actionType === "bet"),
    ).length;

  // If this action is a raise, count how many prior raises existed
  // to determine if this is opening, 3-betting, etc.
  if (
    action.actionType === "raise" ||
    action.actionType === "bet" ||
    action.actionType === "all_in"
  ) {
    if (priorRaises === 0) return "preflop.open";
    if (priorRaises === 1) return "preflop.facing_raise";
    if (priorRaises === 2) return "preflop.facing_3bet";
    return "preflop.facing_4bet";
  }

  // For calls/checks/folds — what were they facing?
  if (action.actionType === "call") {
    if (priorRaises === 0) return "preflop.facing_raise"; // calling a raise
    if (priorRaises === 1) return "preflop.facing_3bet"; // calling a 3-bet
    return "preflop.facing_4bet";
  }

  // Check or fold — use opening context
  return "preflop.open";
}

function classifyPostflopAction(
  action: PlayerAction,
  allActions: PlayerAction[],
  actionIndex: number,
  position?: Position,
): SituationKey {
  const { actionType } = action;

  // Facing all-in
  if (actionType === "all_in") {
    return "postflop.facing_allin";
  }

  // Determine if this opponent was the preflop aggressor
  const wasAggressor = allActions.some(
    (a) =>
      a.street === "preflop" &&
      (a.actionType === "raise" || a.actionType === "bet"),
  );

  // Determine if facing a bet/raise (look at prior postflop actions on same street)
  const priorSameStreet = allActions
    .slice(0, actionIndex)
    .filter((a) => a.street === action.street);
  const facingBet = priorSameStreet.some(
    (a) =>
      a.actionType === "bet" ||
      a.actionType === "raise" ||
      a.actionType === "all_in",
  );
  const facingRaise = priorSameStreet.filter(
    (a) => a.actionType === "raise",
  ).length > 0;

  // If calling/folding and facing a raise
  if (facingRaise && (actionType === "call" || actionType === "fold")) {
    return "postflop.facing_raise";
  }

  // If calling/folding and facing a bet
  if (facingBet && (actionType === "call" || actionType === "fold")) {
    return "postflop.facing_bet";
  }

  // If raising (facing a bet already)
  if (actionType === "raise") {
    return "postflop.facing_bet"; // they're raising a bet
  }

  // Active bet/check — depends on role and position
  const hasPosition = position === "btn" || position === "co" || position === "hj";

  if (actionType === "bet") {
    if (wasAggressor) {
      return hasPosition ? "postflop.aggressor.ip" : "postflop.aggressor.oop";
    }
    return hasPosition ? "postflop.caller.ip" : "postflop.caller.oop";
  }

  // Check
  if (wasAggressor) {
    return hasPosition ? "postflop.aggressor.ip" : "postflop.aggressor.oop";
  }
  return hasPosition ? "postflop.caller.ip" : "postflop.caller.oop";
}

// ─── Position adjustment ───

/**
 * Adjust a percentage based on position and position awareness.
 *
 * Formula: posMultiplier = 1 + (positionRangeMultiplier(pos) - 1) * positionAwareness
 *
 * - Fish (positionAwareness=0.1): barely adjusts
 * - Nit (0.4): slight adjustment
 * - TAG (0.8): significantly position-aware
 * - GTO (1.0): fully adjusts to position
 */
function applyPositionAdjustment(
  basePct: number,
  positionAwareness: number,
  position?: Position,
): number {
  if (!position) return basePct;

  const rawMultiplier = positionRangeMultiplier(position);
  const posMultiplier = 1 + (rawMultiplier - 1) * positionAwareness;

  return Math.min(100, Math.max(0, basePct * posMultiplier));
}

// ─── Action application ───

interface ActionResult {
  range: WeightedRange;
  newPct: number;
  explanation: ExplanationNode;
}

function applyActionWithParams(
  currentRange: WeightedRange,
  currentPct: number,
  action: PlayerAction,
  params: BehavioralParams,
  situationKey: SituationKey,
  profileName: string,
  knownCards: CardIndex[],
  position?: Position,
): ActionResult {
  const { street, actionType: _actionType } = action;

  if (street === "preflop") {
    return applyPreflopAction(
      currentRange,
      currentPct,
      action,
      params,
      profileName,
      knownCards,
      position,
    );
  }

  return applyPostflopAction(
    currentRange,
    currentPct,
    action,
    params,
    profileName,
    knownCards,
  );
}

function applyPreflopAction(
  currentRange: WeightedRange,
  currentPct: number,
  action: PlayerAction,
  params: BehavioralParams,
  profileName: string,
  knownCards: CardIndex[],
  position?: Position,
): ActionResult {
  const { actionType } = action;

  switch (actionType) {
    case "fold": {
      return {
        range: new Map(),
        newPct: 0,
        explanation: {
          summary: `${profileName} folded preflop`,
          detail: "Opponent is out of the hand.",
          sentiment: "neutral",
          tags: ["fold"],
        },
      };
    }

    case "call": {
      // Calling range: continuePct minus raise portion
      const adjustedContinue = applyPositionAdjustment(
        params.continuePct,
        params.positionAwareness,
        position,
      );
      const callRangePct = Math.min(currentPct, adjustedContinue);
      const newRange = topPercentRange(callRangePct, knownCards);

      // Reduce weight on very top hands (those would have raised)
      const raiseFraction = params.raisePct / 100;
      const raiseThreshold = Math.ceil(
        (callRangePct * raiseFraction / 100) * HAND_STRENGTH_ORDER.length,
      );
      const adjustedRange: WeightedRange = new Map();

      for (const [combo, weight] of newRange) {
        const handIdx = getComboStrengthIndex(combo);
        if (handIdx < raiseThreshold) {
          adjustedRange.set(combo, weight * 0.3);
        } else {
          adjustedRange.set(combo, weight);
        }
      }

      return {
        range: adjustedRange,
        newPct: callRangePct,
        explanation: {
          summary: `${profileName} called preflop → range ~${callRangePct.toFixed(0)}%`,
          detail: `A preflop call from ${profileName} suggests medium-strength hands. Their raising hands (top ${(callRangePct * raiseFraction).toFixed(0)}%) are less likely since they would have raised. Expect suited connectors, medium pairs, broadway hands.`,
          sentiment: "neutral",
          tags: ["preflop-call"],
        },
      };
    }

    case "raise":
    case "bet": {
      // Raise range = continuePct * raisePct fraction
      const adjustedContinue = applyPositionAdjustment(
        params.continuePct,
        params.positionAwareness,
        position,
      );
      const raisePct = adjustedContinue * (params.raisePct / 100);
      const newRange = topPercentRange(raisePct, knownCards);

      return {
        range: newRange,
        newPct: raisePct,
        explanation: {
          summary: `${profileName} raised preflop → range ~${raisePct.toFixed(0)}%`,
          detail: `${profileName} raises with top ${raisePct.toFixed(0)}% of hands. This includes ${describeRangeTop(raisePct)}.`,
          sentiment: raisePct < 15 ? "warning" : "neutral",
          tags: ["preflop-raise"],
        },
      };
    }

    case "all_in": {
      // All-in preflop is typically very narrow
      const adjustedContinue = applyPositionAdjustment(
        params.continuePct,
        params.positionAwareness,
        position,
      );
      const allInPct = Math.min(adjustedContinue * (params.raisePct / 100) * 0.3, 5);
      const newRange = topPercentRange(allInPct, knownCards);

      return {
        range: newRange,
        newPct: allInPct,
        explanation: {
          summary: `${profileName} went all-in preflop → range ~${allInPct.toFixed(0)}%`,
          detail: `An all-in preflop from ${profileName} screams premium. Expect AA, KK, and possibly QQ or AKs. Very few bluffs here.`,
          sentiment: "warning",
          tags: ["preflop-allin"],
        },
      };
    }

    case "check": {
      return {
        range: currentRange,
        newPct: currentPct,
        explanation: {
          summary: `${profileName} checked preflop (BB)`,
          detail:
            "Checking from the big blind doesn't narrow the range — they get to see a flop with any hand.",
          sentiment: "neutral",
          tags: ["preflop-check"],
        },
      };
    }

    default:
      return {
        range: currentRange,
        newPct: currentPct,
        explanation: { summary: "Unknown action", sentiment: "neutral" },
      };
  }
}

function applyPostflopAction(
  currentRange: WeightedRange,
  currentPct: number,
  action: PlayerAction,
  params: BehavioralParams,
  profileName: string,
  knownCards: CardIndex[],
): ActionResult {
  const { street, actionType } = action;

  switch (actionType) {
    case "fold": {
      return {
        range: new Map(),
        newPct: 0,
        explanation: {
          summary: `${profileName} folded on the ${street}`,
          detail: `Opponent gave up. Their range contained too many weak hands for the current board.`,
          sentiment: "positive",
          tags: ["postflop-fold"],
        },
      };
    }

    case "check": {
      // Checking removes the strongest hands from range (they would bet)
      const betLikelihood = params.continuePct / 100;
      const adjustedRange: WeightedRange = new Map();

      for (const [combo, weight] of currentRange) {
        const handIdx = getComboStrengthIndex(combo);
        const strengthPct = handIdx / HAND_STRENGTH_ORDER.length;

        if (strengthPct < 0.1) {
          adjustedRange.set(combo, weight * (1 - betLikelihood * 0.8));
        } else if (strengthPct < 0.3) {
          adjustedRange.set(combo, weight * (1 - betLikelihood * 0.3));
        } else {
          adjustedRange.set(combo, weight);
        }
      }

      const newPct = rangePct(adjustedRange);

      return {
        range: adjustedRange,
        newPct,
        explanation: {
          summary: `${profileName} checked on the ${street}`,
          detail: `A check from ${profileName} (who bets ${params.continuePct}% of the time in this spot) suggests weaker holdings. Strong hands are discounted. Their range shifts toward draws, weak pairs, and air.`,
          sentiment: "positive",
          tags: ["postflop-check"],
        },
      };
    }

    case "call": {
      // Calling keeps medium-strength hands, removes air (would fold) and monsters (would raise)
      const foldRate = (100 - params.continuePct) / 100;
      const adjustedRange: WeightedRange = new Map();

      for (const [combo, weight] of currentRange) {
        const handIdx = getComboStrengthIndex(combo);
        const strengthPct = handIdx / HAND_STRENGTH_ORDER.length;

        if (strengthPct > 0.7) {
          adjustedRange.set(combo, weight * (1 - foldRate));
        } else if (strengthPct < 0.05) {
          adjustedRange.set(combo, weight * 0.5);
        } else {
          adjustedRange.set(combo, weight);
        }
      }

      const newPct = rangePct(adjustedRange);

      return {
        range: adjustedRange,
        newPct,
        explanation: {
          summary: `${profileName} called on the ${street} → medium-strength range`,
          detail: `Calling suggests ${profileName} has something but not a monster. Expect draws, medium pairs, or top pair with a weak kicker. Pure air would fold; monsters would raise.`,
          sentiment: "neutral",
          tags: ["postflop-call"],
        },
      };
    }

    case "bet":
    case "raise": {
      // Betting/raising: polarized — strong value + bluffs
      const bluffFreq = params.bluffFrequency;

      // Narrow to strong value hands + some bluffs
      const valuePct = currentPct * 0.4;
      const valueRange = topPercentRange(valuePct, knownCards);

      const adjustedRange: WeightedRange = new Map(valueRange);

      for (const [combo, weight] of currentRange) {
        if (!adjustedRange.has(combo)) {
          adjustedRange.set(combo, weight * bluffFreq);
        }
      }

      const newPct = rangePct(adjustedRange);
      const actionLabel = actionType === "raise" ? "raised" : "bet";

      return {
        range: adjustedRange,
        newPct,
        explanation: {
          summary: `${profileName} ${actionLabel} on the ${street} → polarized range`,
          detail: `A ${actionLabel} from ${profileName} (bluff frequency: ${(bluffFreq * 100).toFixed(0)}%) polarizes their range. They either have a strong value hand or they're bluffing. Medium-strength hands would check or call.`,
          sentiment: "warning",
          children: [
            {
              summary: `Value portion: top ~${valuePct.toFixed(0)}% of previous range`,
              sentiment: "negative",
              tags: ["value-range"],
            },
            {
              summary: `Bluff portion: ~${(bluffFreq * 100).toFixed(0)}% of remaining combos`,
              detail: `Based on ${profileName}'s bluff frequency of ${(bluffFreq * 100).toFixed(0)}% in this situation`,
              sentiment: "neutral",
              tags: ["bluff-range"],
            },
          ],
          tags: ["postflop-bet"],
        },
      };
    }

    case "all_in": {
      // All-in postflop: very polarized — nuts or desperation
      const nutsRange = topPercentRange(currentPct * 0.15, knownCards);
      const bluffWeight = params.bluffFrequency > 0.2 ? 0.15 : 0.05;

      const adjustedRange: WeightedRange = new Map(nutsRange);
      for (const [combo, weight] of currentRange) {
        if (!adjustedRange.has(combo)) {
          adjustedRange.set(combo, weight * bluffWeight);
        }
      }

      const newPct = rangePct(adjustedRange);

      return {
        range: adjustedRange,
        newPct,
        explanation: {
          summary: `${profileName} went all-in on the ${street}`,
          detail: `All-in on the ${street} is maximally polarized. ${profileName} has either the nuts or is making a desperate bluff. Most of their range is the absolute strongest hands they could have.`,
          sentiment: "warning",
          tags: ["postflop-allin"],
        },
      };
    }

    default:
      return {
        range: currentRange,
        newPct: currentPct,
        explanation: { summary: "Unknown action", sentiment: "neutral" },
      };
  }
}

// ─── Helpers ───

/**
 * Get rough strength index for a combo based on its hand class position
 * in the standard strength order. Lower = stronger.
 */
function getComboStrengthIndex(combo: string): number {
  const r1 = combo[0];
  const s1 = combo[1];
  const r2 = combo[2];
  const s2 = combo[3];

  const rv1 = "23456789TJQKA".indexOf(r1);
  const rv2 = "23456789TJQKA".indexOf(r2);

  const high = rv1 >= rv2 ? r1 : r2;
  const low = rv1 >= rv2 ? r2 : r1;

  let handClass: string;
  if (r1 === r2) {
    handClass = `${high}${low}`;
  } else if (s1 === s2) {
    handClass = `${high}${low}s`;
  } else {
    handClass = `${high}${low}o`;
  }

  const idx = HAND_STRENGTH_ORDER.indexOf(handClass);
  return idx === -1 ? HAND_STRENGTH_ORDER.length : idx;
}

/**
 * Human-readable description of what the top N% of hands includes.
 */
function describeRangeTop(pct: number): string {
  if (pct <= 3) return "AA, KK, QQ, AKs";
  if (pct <= 5) return "AA-QQ, AKs, AKo, JJ";
  if (pct <= 10) return "premium pairs (AA-TT), AK, AQs, KQs";
  if (pct <= 15) return "pairs TT+, AK, AQ, AJs, KQs, and similar broadways";
  if (pct <= 22) return "pairs 77+, suited broadways, AK-AT, KQ-KJ";
  if (pct <= 30) return "pairs 55+, suited connectors, most broadways";
  if (pct <= 45) return "most pairs, suited connectors, broadways, suited aces";
  return "a very wide range including speculative hands";
}
