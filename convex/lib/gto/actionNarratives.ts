/**
 * Action Narratives — what each available action TELLS opponents.
 *
 * Instead of "What's your story?" (abstract), this shows the user
 * what each action communicates to the table:
 *   FOLD: "I can't compete at this price."
 *   CALL: "I have something worth seeing a flop with."
 *   RAISE: "I have a monster — or I want you to think I do."
 *
 * When combined with the opponent's story, the user can decide
 * which counter-narrative makes strategic sense.
 *
 * Pure TypeScript, zero Convex imports.
 */
import type { ActionType, LegalActions } from "../state/gameState";
import type { CardIndex, Street } from "../types/cards";
import type { HandCategorization } from "../gto/handCategorizer";
import type { OpponentStory } from "../analysis/opponentStory";

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

export interface ActionStory {
  /** The action this story describes */
  action: ActionType;
  /** Bet/raise amount if applicable */
  amount?: number;
  /** What this action tells opponents about your hand */
  narrative: string;
  /** How this interacts with the opponent's story (if available) */
  counterNarrative?: string;
  /** Whether this action aligns with GTO recommendation */
  gtoAligned?: boolean;
}

// ═══════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════

/**
 * Build narrative descriptions for each available action.
 * Shows the user what each action communicates to opponents.
 */
export function buildActionStories(
  heroCards: CardIndex[],
  communityCards: CardIndex[],
  legal: LegalActions,
  opponentStory: OpponentStory | undefined,
  handCat: HandCategorization | undefined,
  street: Street,
): ActionStory[] {
  const stories: ActionStory[] = [];
  const strength = handCat?.relativeStrength ?? 0.5;
  const hasBoard = communityCards.length >= 3;

  // FOLD
  if (legal.canFold) {
    stories.push({
      action: "fold",
      narrative: getFoldNarrative(street, legal.callAmount, strength),
      counterNarrative: opponentStory
        ? getFoldCounter(opponentStory, strength)
        : undefined,
    });
  }

  // CHECK
  if (legal.canCheck) {
    stories.push({
      action: "check",
      narrative: getCheckNarrative(street, strength, hasBoard),
      counterNarrative: opponentStory
        ? getCheckCounter(opponentStory, strength)
        : undefined,
    });
  }

  // CALL
  if (legal.canCall && legal.callAmount > 0) {
    stories.push({
      action: "call",
      amount: legal.callAmount,
      narrative: getCallNarrative(street, legal.callAmount, strength),
      counterNarrative: opponentStory
        ? getCallCounter(opponentStory, strength)
        : undefined,
    });
  }

  // BET
  if (legal.canBet) {
    stories.push({
      action: "bet",
      narrative: getBetNarrative(street, strength, hasBoard),
      counterNarrative: opponentStory
        ? getBetCounter(opponentStory, strength)
        : undefined,
    });
  }

  // RAISE
  if (legal.canRaise) {
    stories.push({
      action: "raise",
      narrative: getRaiseNarrative(street, strength, legal.callAmount),
      counterNarrative: opponentStory
        ? getRaiseCounter(opponentStory, strength)
        : undefined,
    });
  }

  return stories;
}

// ═══════════════════════════════════════════════════════
// FOLD NARRATIVES
// ═══════════════════════════════════════════════════════

function getFoldNarrative(street: Street, callAmount: number, strength: number): string {
  if (street === "preflop") {
    if (callAmount > 10) {
      return "I'm not willing to pay this price. My hand isn't strong enough for this pot.";
    }
    return "I'm stepping aside — this hand isn't worth playing from here.";
  }
  if (strength > 0.5) {
    return "I'm giving up despite some showdown value. The risk isn't worth the reward.";
  }
  return "I missed. No reason to put more chips in — I'm done with this hand.";
}

function getFoldCounter(story: OpponentStory, strength: number): string {
  if (story.data.equityVsRange < 0.25) {
    return "Their story says you're dominated. Folding respects the math.";
  }
  if (story.data.equityVsRange < 0.4) {
    return "Their story suggests strength. Without the right odds, folding is disciplined.";
  }
  return "You might be ahead, but folding avoids a tough spot. Is discretion the right play here?";
}

// ═══════════════════════════════════════════════════════
// CHECK NARRATIVES
// ═══════════════════════════════════════════════════════

function getCheckNarrative(street: Street, strength: number, hasBoard: boolean): string {
  if (!hasBoard) {
    return "I'm seeing a free card from the big blind. No information given away.";
  }
  if (strength > 0.7) {
    return "I'm showing weakness — but maybe I'm trapping with a strong hand.";
  }
  if (strength > 0.4) {
    return "I'm controlling the pot. I have showdown value but don't want to build a big pot.";
  }
  return "I'm giving up on this street without investing more. Maybe I'll improve.";
}

function getCheckCounter(story: OpponentStory, strength: number): string {
  if (story.data.equityVsRange > 0.55) {
    return "You're ahead of their range — checking might miss value but controls the pot.";
  }
  return "Their story says they're strong. Checking avoids bloating a pot where you're behind.";
}

// ═══════════════════════════════════════════════════════
// CALL NARRATIVES
// ═══════════════════════════════════════════════════════

function getCallNarrative(street: Street, callAmount: number, strength: number): string {
  if (street === "preflop") {
    if (callAmount > 15) {
      return "I'm flatting a big raise. My hand is strong enough to continue but not to escalate.";
    }
    return "I'm calling to see a flop. My hand plays well postflop but raising reveals too much.";
  }
  if (strength > 0.6) {
    return "I'm calling with a strong hand — keeping the pot controlled and disguising my strength.";
  }
  if (strength > 0.35) {
    return "I have a hand worth continuing with. The price is right to see another card.";
  }
  return "I'm calling light — maybe on a draw or hoping to improve. The odds justify it.";
}

function getCallCounter(story: OpponentStory, strength: number): string {
  const eq = story.data.equityVsRange;
  const needed = story.data.potOddsNeeded;
  if (eq > needed + 0.1) {
    return "The math supports calling — you have enough equity against their estimated range.";
  }
  if (eq > needed) {
    return "Borderline call. You barely have the odds, but position or implied odds might tip it.";
  }
  return "Their story says you're not getting the right price. Calling costs more than it's worth.";
}

// ═══════════════════════════════════════════════════════
// BET NARRATIVES
// ═══════════════════════════════════════════════════════

function getBetNarrative(street: Street, strength: number, hasBoard: boolean): string {
  if (!hasBoard) {
    return "I'm opening the betting — telling everyone I want this pot.";
  }
  if (strength > 0.7) {
    return "I'm betting for value. I believe I have the best hand and want to get paid.";
  }
  if (strength > 0.4) {
    return "I'm betting to protect my hand and deny free cards. Also extracting thin value.";
  }
  return "I'm telling a story of strength I may not have. Can they afford to call?";
}

function getBetCounter(story: OpponentStory, strength: number): string {
  if (story.data.equityVsRange > 0.55) {
    return "You're likely ahead — betting builds the pot when you have the edge.";
  }
  if (story.confidence === "strong" && story.data.equityVsRange < 0.4) {
    return "Their story says they're strong. Betting into strength is risky — are you turning your hand into a bluff?";
  }
  return "Their range is mixed. A bet tests their story and puts the decision back on them.";
}

// ═══════════════════════════════════════════════════════
// RAISE NARRATIVES
// ═══════════════════════════════════════════════════════

function getRaiseNarrative(street: Street, strength: number, callAmount: number): string {
  if (street === "preflop") {
    if (callAmount > 10) {
      return "I'm re-raising big. My story says I have a premium hand — or a fearless bluff.";
    }
    return "I'm raising to thin the field and build the pot with position or a strong hand.";
  }
  if (strength > 0.7) {
    return "I'm raising for value. I believe my hand is best and I want maximum chips in the middle.";
  }
  if (strength > 0.35) {
    return "I'm raising to take control. This puts pressure on and tells a story of strength.";
  }
  return "I'm representing a monster. If they believe my story, they'll fold better hands.";
}

function getRaiseCounter(story: OpponentStory, strength: number): string {
  if (story.confidence === "strong" && story.data.equityVsRange < 0.35) {
    return "Raising into a strong range is bold — you're saying your story beats theirs. Make sure it does.";
  }
  if (story.data.equityVsRange > 0.6) {
    return "You dominate their range. Raising extracts maximum value from a weaker story.";
  }
  return "Raising changes the narrative. Their response will reveal whether their story was real.";
}
