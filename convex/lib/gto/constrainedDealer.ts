/**
 * Constrained Dealer — generates hands matching specific archetype constraints.
 *
 * Used by Drill Mode to create practice scenarios. For each archetype,
 * produces hero cards, community cards, and seat configuration that
 * match the archetype's requirements.
 *
 * Pure TypeScript, zero Convex imports.
 */
import type { CardIndex, Position } from "../types/cards";
import type { CardOverride } from "../state/game-state";
import { createShuffledDeck, deal } from "../primitives/deck";
import { categorizeHand, type HandCategorization, type HandCategory } from "./handCategorizer";
import {
  type ArchetypeId,
  type ArchetypeClassification,
  type ArchetypeCategory,
} from "./archetypeClassifier";
import { analyzeBoard, type BoardTexture } from "../opponents/engines/boardTexture";
import { hasTable, getTable, lookupFrequencies } from "./tables/tableRegistry";
import { positionsForTableSize } from "../primitives/position";

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

export interface DrillConstraints {
  archetypeId: ArchetypeId;
  heroPosition?: Position;
  handCategories?: HandCategory[];
}

export interface ConstrainedDeal {
  heroSeatIndex: number;
  dealerSeatIndex: number;
  heroCards: CardIndex[];
  communityCards: CardIndex[];
  numPlayers: number;
  archetype: ArchetypeClassification;
  handCategory: HandCategorization;
  isInPosition: boolean;
  hasFrequencyData: boolean;
  /** CardOverrides ready for initializeHand */
  cardOverrides: CardOverride[];
}

// ═══════════════════════════════════════════════════════
// ARCHETYPE → CATEGORY MAPPING
// ═══════════════════════════════════════════════════════

const ARCHETYPE_CATEGORY: Record<ArchetypeId, ArchetypeCategory> = {
  rfi_opening: "preflop",
  bb_defense_vs_rfi: "preflop",
  three_bet_pots: "preflop",
  blind_vs_blind: "preflop",
  four_bet_five_bet: "preflop",
  ace_high_dry_rainbow: "flop_texture",
  kq_high_dry_rainbow: "flop_texture",
  mid_low_dry_rainbow: "flop_texture",
  paired_boards: "flop_texture",
  two_tone_disconnected: "flop_texture",
  two_tone_connected: "flop_texture",
  monotone: "flop_texture",
  rainbow_connected: "flop_texture",
  cbet_sizing_frequency: "postflop_principle",
  turn_barreling: "postflop_principle",
  river_bluff_catching_mdf: "postflop_principle",
  thin_value_river: "postflop_principle",
  overbet_river: "postflop_principle",
  three_bet_pot_postflop: "postflop_principle",
  exploitative_overrides: "postflop_principle",
};

const ARCHETYPE_DESCRIPTION: Record<ArchetypeId, string> = {
  rfi_opening: "Raise First In — opening ranges by position",
  bb_defense_vs_rfi: "BB defense vs single raise",
  three_bet_pots: "3-bet pot dynamics",
  blind_vs_blind: "SB vs BB — wide-range dynamics",
  four_bet_five_bet: "4-bet/5-bet polarized",
  ace_high_dry_rainbow: "Axx rainbow flop",
  kq_high_dry_rainbow: "K/Q-high dry rainbow",
  mid_low_dry_rainbow: "7xx-Txx rainbow",
  paired_boards: "Paired flop",
  two_tone_disconnected: "Two-tone disconnected",
  two_tone_connected: "Two-tone connected",
  monotone: "Monotone flop",
  rainbow_connected: "Rainbow connected",
  cbet_sizing_frequency: "C-bet sizing and frequency",
  turn_barreling: "Turn barreling",
  river_bluff_catching_mdf: "River bluff-catching (MDF)",
  thin_value_river: "Thin value on river",
  overbet_river: "Overbet river spots",
  three_bet_pot_postflop: "3-bet pot postflop",
  exploitative_overrides: "Exploitative adjustments",
};

// ═══════════════════════════════════════════════════════
// DEFAULT HERO POSITIONS PER ARCHETYPE
// ═══════════════════════════════════════════════════════

/** Positions hero cycles through for each preflop archetype */
const PREFLOP_HERO_POSITIONS: Record<string, Position[]> = {
  rfi_opening: ["co", "btn", "hj", "utg"],
  bb_defense_vs_rfi: ["bb"],
  three_bet_pots: ["btn", "sb"],
  blind_vs_blind: ["sb"],
  four_bet_five_bet: ["btn", "sb"],
};

// ═══════════════════════════════════════════════════════
// TEXTURE MATCHERS
// ═══════════════════════════════════════════════════════

type TextureMatcher = (tex: BoardTexture) => boolean;

const TEXTURE_MATCHERS: Partial<Record<ArchetypeId, TextureMatcher>> = {
  ace_high_dry_rainbow: (t) => t.highCard === 12 && t.isRainbow && !t.hasConnectors && !t.isPaired,
  kq_high_dry_rainbow: (t) => (t.highCard === 10 || t.highCard === 11) && t.isRainbow && !t.isPaired,
  mid_low_dry_rainbow: (t) => t.highCard >= 5 && t.highCard <= 9 && t.isRainbow && !t.isPaired,
  paired_boards: (t) => t.isPaired,
  two_tone_disconnected: (t) => t.isTwoTone && !t.straightHeavy,
  two_tone_connected: (t) => t.isTwoTone && t.straightHeavy,
  monotone: (t) => t.isMonotone,
  rainbow_connected: (t) => t.isRainbow && (t.hasConnectors || t.straightHeavy),
};

/** Hardcoded fallback flops when rejection sampling fails (card indices) */
const FALLBACK_FLOPS: Partial<Record<ArchetypeId, CardIndex[]>> = {
  // A♠7♦2♣ (A=48+3=51 for A♠, 7=5*4+1=21 for 7♦, 2=0*4+0=0 for 2♣)
  ace_high_dry_rainbow: [48, 21, 0],    // A♣ 7♦ 2♣ — close enough, rainbow if suits differ
  kq_high_dry_rainbow: [40, 17, 4],     // K♣ 6♦ 3♣
  mid_low_dry_rainbow: [32, 13, 1],     // T♣ 5♦ 2♦
  paired_boards: [24, 25, 0],           // 8♣ 8♦ 2♣
  two_tone_disconnected: [48, 45, 41],  // A♣ Q♦ K♦
  two_tone_connected: [36, 33, 29],     // J♣ T♦ 9♦
  monotone: [48, 36, 24],              // A♣ J♣ 8♣
  rainbow_connected: [33, 29, 25],     // T♦ 9♦ 8♦ — need different suits
};

// ═══════════════════════════════════════════════════════
// MAIN FUNCTION
// ═══════════════════════════════════════════════════════

/**
 * Deal a hand matching the given archetype constraints.
 */
export function dealForArchetype(
  constraints: DrillConstraints,
  random: () => number,
): ConstrainedDeal {
  const { archetypeId } = constraints;
  const category = ARCHETYPE_CATEGORY[archetypeId];

  switch (category) {
    case "preflop":
      return dealPreflop(constraints, random);
    case "flop_texture":
      return dealFlopTexture(constraints, random);
    case "postflop_principle":
      return dealPostflopPrinciple(constraints, random);
  }
}

// ═══════════════════════════════════════════════════════
// PREFLOP DEALING
// ═══════════════════════════════════════════════════════

function dealPreflop(
  constraints: DrillConstraints,
  random: () => number,
): ConstrainedDeal {
  const numPlayers = 6;
  const { archetypeId } = constraints;

  // Pick hero position
  const positions = PREFLOP_HERO_POSITIONS[archetypeId] ?? ["btn"];
  const heroPosition = constraints.heroPosition
    ?? positions[Math.floor(random() * positions.length)];

  // Compute seat indices
  const { heroSeatIndex, dealerSeatIndex } = seatIndicesForPosition(
    heroPosition, numPlayers,
  );

  // Deal hero hand
  const deck = createShuffledDeck([], random);
  const heroCards = deal(deck, 2);

  // Categorize (preflop — no community cards)
  const handCategory = categorizeHand(heroCards, []);

  // Check if acceptable hand category for constraints
  if (constraints.handCategories && !constraints.handCategories.includes(handCategory.category)) {
    // Retry up to 20 times for matching category
    for (let i = 0; i < 20; i++) {
      const retryDeck = createShuffledDeck([], random);
      const retryCards = deal(retryDeck, 2);
      const retryCat = categorizeHand(retryCards, []);
      if (constraints.handCategories.includes(retryCat.category)) {
        return buildDeal({
          heroSeatIndex,
          dealerSeatIndex,
          heroCards: retryCards,
          communityCards: [],
          numPlayers,
          archetypeId,
          handCategory: retryCat,
          isInPosition: heroPosition === "btn" || heroPosition === "co",
        });
      }
    }
  }

  return buildDeal({
    heroSeatIndex,
    dealerSeatIndex,
    heroCards,
    communityCards: [],
    numPlayers,
    archetypeId,
    handCategory,
    isInPosition: heroPosition === "btn" || heroPosition === "co",
  });
}

// ═══════════════════════════════════════════════════════
// FLOP TEXTURE DEALING
// ═══════════════════════════════════════════════════════

function dealFlopTexture(
  constraints: DrillConstraints,
  random: () => number,
): ConstrainedDeal {
  const numPlayers = 6;
  const { archetypeId } = constraints;
  const heroPosition = constraints.heroPosition ?? "btn";

  const { heroSeatIndex, dealerSeatIndex } = seatIndicesForPosition(
    heroPosition, numPlayers,
  );

  // Generate matching flop
  const flop = generateFlopForTexture(archetypeId, random);

  // Deal hero hand (excluding flop cards)
  const deck = createShuffledDeck(flop, random);
  const heroCards = deal(deck, 2);
  const handCategory = categorizeHand(heroCards, flop);

  // Retry for acceptable hand category
  if (constraints.handCategories && !constraints.handCategories.includes(handCategory.category)) {
    for (let i = 0; i < 20; i++) {
      const retryDeck = createShuffledDeck(flop, random);
      const retryCards = deal(retryDeck, 2);
      const retryCat = categorizeHand(retryCards, flop);
      if (constraints.handCategories.includes(retryCat.category)) {
        return buildDeal({
          heroSeatIndex,
          dealerSeatIndex,
          heroCards: retryCards,
          communityCards: flop,
          numPlayers,
          archetypeId,
          handCategory: retryCat,
          isInPosition: heroPosition === "btn" || heroPosition === "co",
        });
      }
    }
  }

  return buildDeal({
    heroSeatIndex,
    dealerSeatIndex,
    heroCards,
    communityCards: flop,
    numPlayers,
    archetypeId,
    handCategory,
    isInPosition: heroPosition === "btn" || heroPosition === "co",
  });
}

function generateFlopForTexture(
  archetypeId: ArchetypeId,
  random: () => number,
): CardIndex[] {
  const matcher = TEXTURE_MATCHERS[archetypeId];
  if (!matcher) {
    // No texture constraint — deal random flop
    const deck = createShuffledDeck([], random);
    return deal(deck, 3);
  }

  // Rejection sampling: try random 3-card flops until texture matches
  for (let attempt = 0; attempt < 100; attempt++) {
    const deck = createShuffledDeck([], random);
    const flop = deal(deck, 3);
    const texture = analyzeBoard(flop);
    if (matcher(texture)) {
      return flop;
    }
  }

  // Fallback to hardcoded flop
  const fallback = FALLBACK_FLOPS[archetypeId];
  if (fallback) return [...fallback];

  // Last resort: random flop
  const deck = createShuffledDeck([], random);
  return deal(deck, 3);
}

// ═══════════════════════════════════════════════════════
// POSTFLOP PRINCIPLE DEALING
// ═══════════════════════════════════════════════════════

function dealPostflopPrinciple(
  constraints: DrillConstraints,
  random: () => number,
): ConstrainedDeal {
  const numPlayers = 6;
  const { archetypeId } = constraints;

  // Most postflop principles: hero is BTN (IP) in SRP, facing a flop/turn/river decision
  const heroPosition = constraints.heroPosition ?? "btn";
  const { heroSeatIndex, dealerSeatIndex } = seatIndicesForPosition(
    heroPosition, numPlayers,
  );

  // Determine how many community cards we need
  const communityCount = getCommunityCountForPrinciple(archetypeId);

  // Generate a random board of the right size
  const deck = createShuffledDeck([], random);
  const communityCards = deal(deck, communityCount);

  // Deal hero hand
  const heroCards = deal(deck, 2);
  const handCategory = categorizeHand(heroCards, communityCards);

  return buildDeal({
    heroSeatIndex,
    dealerSeatIndex,
    heroCards,
    communityCards,
    numPlayers,
    archetypeId,
    handCategory,
    isInPosition: heroPosition === "btn" || heroPosition === "co",
  });
}

function getCommunityCountForPrinciple(archetypeId: ArchetypeId): number {
  switch (archetypeId) {
    case "cbet_sizing_frequency":
    case "three_bet_pot_postflop":
      return 3; // Flop decision
    case "turn_barreling":
      return 4; // Turn decision
    case "river_bluff_catching_mdf":
    case "thin_value_river":
    case "overbet_river":
      return 5; // River decision
    case "exploitative_overrides":
      return 3; // Default to flop
    default:
      return 3;
  }
}

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

function seatIndicesForPosition(
  heroPosition: Position,
  numPlayers: number,
): { heroSeatIndex: number; dealerSeatIndex: number } {
  // positions[0] = dealer (BTN). Find which offset gives hero the desired position.
  const positions = positionsForTableSize(numPlayers);
  const posIndex = positions.indexOf(heroPosition);
  if (posIndex === -1) {
    // Position not available at this table size — default to BTN
    return { heroSeatIndex: 0, dealerSeatIndex: 0 };
  }
  // dealerSeatIndex is 0, hero is at offset posIndex
  // To make hero at seatIndex posIndex with dealer at 0:
  const dealerSeatIndex = 0;
  const heroSeatIndex = posIndex;
  return { heroSeatIndex, dealerSeatIndex };
}

function buildDeal(params: {
  heroSeatIndex: number;
  dealerSeatIndex: number;
  heroCards: CardIndex[];
  communityCards: CardIndex[];
  numPlayers: number;
  archetypeId: ArchetypeId;
  handCategory: HandCategorization;
  isInPosition: boolean;
}): ConstrainedDeal {
  const { archetypeId, heroSeatIndex, heroCards } = params;
  const category = ARCHETYPE_CATEGORY[archetypeId];

  return {
    ...params,
    archetype: {
      archetypeId,
      confidence: 1.0,
      category,
      description: ARCHETYPE_DESCRIPTION[archetypeId],
    },
    hasFrequencyData: hasTable(archetypeId),
    cardOverrides: [{
      seatIndex: heroSeatIndex,
      cards: [...heroCards],
      visibility: "revealed" as const,
    }],
  };
}
