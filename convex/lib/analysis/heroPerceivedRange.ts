/**
 * Hero Perceived Range — what opponents think hero has.
 *
 * Layer 3 thinking: "Given my actions, what range does villain assign me?"
 *
 * This reverses the range estimation: instead of estimating what villain has
 * from villain's actions, we estimate what villain THINKS hero has from
 * hero's actions. Same function, reversed perspective.
 *
 * The key insight: every action hero takes narrows how opponents perceive
 * hero's range. A preflop raise says "I have a hand worth raising." A c-bet
 * says "I still like my hand (or I'm bluffing)." A check says "I'm weak or
 * trapping." Opponents read these chapters of hero's story.
 *
 * Pure TypeScript, zero Convex imports.
 */

import type { CardIndex, Position, Street } from "../types/cards";
import type { OpponentProfile, PlayerAction } from "../types/opponents";
import { estimateRange, type RangeEstimation } from "../opponents/rangeEstimator";
import { GTO_PROFILE } from "../opponents/presets";
import { rangePct } from "../opponents/combos";

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

export interface HeroPerceivedRange {
  /** Estimated range as % of all hands (e.g., 15% = top 15%) */
  rangePercent: number;
  /** Human-readable description of what villain thinks hero has */
  narrative: string;
  /** What this perceived range means for villain's decision */
  implication: string;
  /** The raw range estimation (for detailed analysis) */
  estimation: RangeEstimation;
}

// ═══════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════

/**
 * Compute what opponents think hero's range is, based on hero's actions.
 *
 * Uses the GTO profile as the "model" opponents use to interpret hero —
 * opponents assume hero is playing reasonably unless they have specific reads.
 */
export function computeHeroPerceivedRange(
  heroActions: PlayerAction[],
  heroPosition: Position | undefined,
  knownCards: CardIndex[],
  street: Street,
): HeroPerceivedRange {
  if (heroActions.length === 0) {
    return {
      rangePercent: 100,
      narrative: "You haven't acted yet — opponents have no read on your range.",
      implication: "Your range is wide open. Any hand is possible.",
      estimation: {
        range: new Map(),
        explanation: { summary: "No actions yet", children: [] },
        rangePctOfAll: 100,
      },
    };
  }

  // Estimate what a GTO player would assign to someone taking hero's actions
  const estimation = estimateRange(
    GTO_PROFILE,
    heroActions,
    knownCards,
    heroPosition,
  );

  const pct = estimation.rangePctOfAll;
  const narrative = buildPerceivedNarrative(heroActions, pct, heroPosition, street);
  const implication = buildImplication(pct, heroActions, street);

  return {
    rangePercent: pct,
    narrative,
    implication,
    estimation,
  };
}

// ═══════════════════════════════════════════════════════
// NARRATIVE BUILDERS
// ═══════════════════════════════════════════════════════

function buildPerceivedNarrative(
  actions: PlayerAction[],
  rangePct: number,
  position: Position | undefined,
  street: Street,
): string {
  const posLabel = position ? positionLabel(position) : "your position";
  const actionSummary = summarizeActions(actions);

  if (rangePct > 50) {
    return `Your actions (${actionSummary}) from ${posLabel} leave your range wide (~${Math.round(rangePct)}% of hands). Opponents can't narrow you down much yet.`;
  }
  if (rangePct > 25) {
    return `Your actions (${actionSummary}) from ${posLabel} tell a clear story — opponents put you on a medium-strength range (~${Math.round(rangePct)}% of hands). They see you as having something but not necessarily a monster.`;
  }
  if (rangePct > 10) {
    return `Your actions (${actionSummary}) from ${posLabel} have narrowed your perceived range to ~${Math.round(rangePct)}% of hands. Opponents think you're strong — premium pairs, top pair with good kickers, or strong draws.`;
  }
  return `Your actions (${actionSummary}) from ${posLabel} scream strength — opponents put you on a very narrow range (~${Math.round(rangePct)}% of hands). They think you have a monster or a very strong bluff.`;
}

function buildImplication(
  rangePct: number,
  actions: PlayerAction[],
  street: Street,
): string {
  const lastAction = actions[actions.length - 1];
  const wasAggressive = lastAction && (lastAction.actionType === "bet" || lastAction.actionType === "raise");
  const wasPassive = lastAction && (lastAction.actionType === "check" || lastAction.actionType === "call");

  if (rangePct > 50) {
    return "With such a wide perceived range, opponents may attack with bluffs — they don't fear your hand.";
  }
  if (rangePct > 25) {
    if (wasAggressive) {
      return "Opponents respect your aggression but may test you with raises to see if you're committed or bluffing.";
    }
    return "Your passive line suggests medium strength. Opponents may bet for value with better hands or bluff to push you off.";
  }
  if (rangePct > 10) {
    if (wasAggressive) {
      return "Opponents believe you're strong. Weaker hands will fold — only better hands or stubborn bluff-catchers will continue.";
    }
    return "Despite passive play, your range is perceived as strong. Opponents may slow down rather than risk running into a trap.";
  }
  // Very narrow
  if (wasAggressive) {
    return "Opponents think you have a near-unbeatable hand. They will only continue with monsters. If they call or raise — believe them.";
  }
  return "Your range is perceived as extremely strong. Any opponent action here represents real strength — they're not bluffing into what they think is the nuts.";
}

function summarizeActions(actions: PlayerAction[]): string {
  const labels: string[] = [];
  for (const a of actions) {
    const amt = a.amount ? ` ${a.amount}` : "";
    labels.push(`${a.actionType}${amt}`);
  }
  // Deduplicate consecutive streets
  if (labels.length <= 3) return labels.join(", ");
  return labels.slice(0, 2).join(", ") + ` ... ${labels[labels.length - 1]}`;
}

function positionLabel(pos: Position): string {
  const labels: Record<string, string> = {
    sb: "the Small Blind",
    bb: "the Big Blind",
    utg: "Under the Gun",
    hj: "the Hijack",
    co: "the Cutoff",
    btn: "the Button",
  };
  return labels[pos] ?? pos;
}
