/**
 * Board Narrative Context — frames each drill hand as a story.
 *
 * Generates a narrative paragraph that sets the scene before the user
 * makes a decision. Pulls from archetype prototypes (teaching, feeling),
 * board texture analysis, and hand categorization.
 *
 * Pure TypeScript, zero Convex imports.
 */
import type { ArchetypeClassification, ArchetypeId } from "./archetypeClassifier";
import type { HandCategorization, HandCategory } from "./handCategorizer";
import type { BoardTexture } from "../opponents/engines/boardTexture";

import { getPrototype } from "./archetypePrototypes";

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

export interface BoardNarrative {
  /** 1-sentence scene-setter: "Ace-high, dry, rainbow — this board favors the preflop raiser." */
  headline: string;
  /** 2-3 sentences of board-texture teaching. From archetype prototype. */
  context: string;
  /** The key question this board poses to the user (varies by hand strength). */
  question: string;
}

// ═══════════════════════════════════════════════════════
// RANGE ADVANTAGE — who does the board favor?
// ═══════════════════════════════════════════════════════

const RANGE_ADVANTAGE: Partial<Record<ArchetypeId, string>> = {
  // Preflop
  rfi_opening: "Your opening range should be position-dependent.",
  bb_defense_vs_rfi: "You have a discount from the big blind but will be out of position.",
  three_bet_pots: "Both ranges are narrow — hand strength matters more than board texture.",
  blind_vs_blind: "Both players have wide ranges — almost anything is possible.",
  four_bet_five_bet: "Ranges are extremely narrow — premium hands dominate.",

  // Flop textures
  ace_high_dry_rainbow: "This board heavily favors the preflop raiser's range.",
  kq_high_dry_rainbow: "High cards favor the raiser, but the defender has more middle-card hands.",
  mid_low_dry_rainbow: "The defender connects more with this board — the raiser should be cautious.",
  monotone: "Flush draws dominate — anyone without the suit is in trouble.",
  paired_boards: "A paired board means fewer hands connect. Bluffs gain leverage.",
  two_tone_connected: "Lots of draws possible — this is a dynamic, high-action board.",
  two_tone_disconnected: "The flush draw is the main feature. Position matters a lot here.",
  rainbow_connected: "Straight draws are the key factor. Connected hands shine.",

  // Postflop principles
  cbet_sizing_frequency: "As the preflop aggressor, you have a range advantage — but should you use it?",
  turn_barreling: "The story continues. Does the turn card strengthen or weaken your position?",
  river_bluff_catching_mdf: "Final street. Are they bluffing or do they have it? Math meets narrative.",
  thin_value_river: "Your hand is good but not great. Can you squeeze one more bet of value?",
  overbet_river: "A massive bet tells a polarized story — you either have the nuts or nothing.",
  three_bet_pot_postflop: "Both ranges are strong in a 3-bet pot. Who has the board advantage?",
  exploitative_overrides: "Pure GTO isn't always best. What adjustments does this opponent warrant?",
};

// ═══════════════════════════════════════════════════════
// QUESTION GENERATION — based on hand strength tier
// ═══════════════════════════════════════════════════════

/** Strong made hands → value extraction questions */
const VALUE_QUESTIONS: string[] = [
  "How do you extract the most value from this strong hand?",
  "Should you bet big for value or keep the pot small to keep weaker hands in?",
  "Your hand is strong — but does the board let opponents pay you off?",
];

/** Marginal made hands → pot control / showdown questions */
const MARGINAL_QUESTIONS: string[] = [
  "Your hand has showdown value but isn't strong enough to stack off. How do you play it?",
  "Do you protect this hand with a bet, or check to control the pot?",
  "This is a close spot — your hand is decent but vulnerable. What's the plan?",
];

/** Drawing hands → price / equity questions */
const DRAW_QUESTIONS: string[] = [
  "You're drawing. Is the price right to continue, or do you need fold equity?",
  "With outs to improve, should you play aggressively or wait for the right price?",
  "Your hand could become very strong. How do you build a pot while protecting your equity?",
];

/** Weak / air hands → bluff / fold questions */
const BLUFF_QUESTIONS: string[] = [
  "You have nothing. Is there a story you can tell that makes your opponent fold?",
  "With no made hand, your only weapon is fold equity. Is it enough?",
  "Sometimes the best play is to give up. Is this one of those spots?",
];

const STRONG_CATEGORIES: Set<HandCategory> = new Set([
  "sets_plus", "two_pair", "premium_pair", "overpair", "top_pair_top_kicker",
]);

const MARGINAL_CATEGORIES: Set<HandCategory> = new Set([
  "top_pair_weak_kicker", "middle_pair", "bottom_pair",
]);

const DRAW_CATEGORIES: Set<HandCategory> = new Set([
  "flush_draw", "straight_draw", "combo_draw",
]);

function getQuestion(category: HandCategory, isPreflop: boolean): string {
  if (isPreflop) {
    return "What does your position and hand strength tell you about how to proceed?";
  }

  if (STRONG_CATEGORIES.has(category)) {
    return VALUE_QUESTIONS[Math.floor(Math.random() * VALUE_QUESTIONS.length)];
  }
  if (MARGINAL_CATEGORIES.has(category)) {
    return MARGINAL_QUESTIONS[Math.floor(Math.random() * MARGINAL_QUESTIONS.length)];
  }
  if (DRAW_CATEGORIES.has(category)) {
    return DRAW_QUESTIONS[Math.floor(Math.random() * DRAW_QUESTIONS.length)];
  }
  return BLUFF_QUESTIONS[Math.floor(Math.random() * BLUFF_QUESTIONS.length)];
}

// ═══════════════════════════════════════════════════════
// HEADLINE GENERATION
// ═══════════════════════════════════════════════════════

function buildHeadline(
  archetype: ArchetypeClassification,
  boardTexture: BoardTexture | undefined,
  isInPosition: boolean,
): string {
  const rangeAdvantage = RANGE_ADVANTAGE[archetype.archetypeId] ?? "";
  const positionNote = isInPosition ? "You have position." : "You're out of position.";

  if (archetype.category === "preflop") {
    return `${archetype.description}. ${positionNote}`;
  }

  if (boardTexture) {
    const wetness = boardTexture.wetness > 0.5 ? "wet" : "dry";
    return `${archetype.description} (${wetness} board). ${rangeAdvantage}`;
  }

  return `${archetype.description}. ${rangeAdvantage}`;
}

// ═══════════════════════════════════════════════════════
// CONTEXT — first 2 sentences of teaching
// ═══════════════════════════════════════════════════════

function getTeachingContext(archetypeId: ArchetypeId): string {
  const proto = getPrototype(archetypeId);
  if (!proto) return "";

  // Take first 2 sentences from teaching
  const sentences = proto.teaching.split(/(?<=[.!?])\s+/);
  return sentences.slice(0, 2).join(" ");
}

// ═══════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════

export function buildBoardNarrative(
  archetype: ArchetypeClassification,
  handCat: HandCategorization,
  boardTexture: BoardTexture | undefined,
  isInPosition: boolean,
): BoardNarrative {
  const isPreflop = archetype.category === "preflop";

  return {
    headline: buildHeadline(archetype, boardTexture, isInPosition),
    context: getTeachingContext(archetype.archetypeId),
    question: getQuestion(handCat.category, isPreflop),
  };
}
