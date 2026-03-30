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
import type { CardOverride, CardVisibility } from "../state/gameState";
import { createShuffledDeck, deal } from "../primitives/deck";
import { categorizeHand, type HandCategorization, type HandCategory } from "./handCategorizer";
import {
  type ArchetypeId,
  type ArchetypeClassification,
  type ArchetypeCategory,
} from "./archetypeClassifier";
import { analyzeBoard, type BoardTexture } from "../opponents/engines/boardTexture";
import { hasTable, hasAnyTableForStreet } from "./tables/tableRegistry";
import { classifyPreflopHand } from "./preflopClassification";
import { isInRfiRange } from "./tables/preflopRanges";
import { comboToHandClass, cardsToCombo } from "../opponents/combos";
import { positionsForTableSize } from "../primitives/position";
import { getPrototype } from "./archetypePrototypes";

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
  heroPosition: Position;
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
// PREFLOP PLAYABILITY FILTER
// ═══════════════════════════════════════════════════════

/**
 * Returns true if the 2-card hand is in a reasonable ~30% opening range
 * from a late position (BTN/CO). Used to filter postflop drill hands so
 * hero never practices spots they'd never reach in real play.
 *
 * Covers: pairs, suited aces, broadway combos, suited connectors/gappers,
 * offsuit broadways ATo+/KJo+/QJo.
 */
/**
 * Check if hero's hand is reasonable for the assigned position.
 *
 * Uses preflop frequency table lookup first. If the hand has raise
 * frequency > 10% for the position, it's in range. Falls back to
 * validated GTO Sets, then to hardcoded heuristic.
 */
function isReasonablePreflop(heroCards: CardIndex[], heroPosition?: Position): boolean {
  if (heroPosition) {
    const combo = cardsToCombo(heroCards[0], heroCards[1]);
    const handClass = comboToHandClass(combo);
    // Primary: preflop range classification
    const classification = classifyPreflopHand(handClass, "rfi_opening", heroPosition);
    if (classification.rangeClass !== "clear_fold") return true;
    // Fallback: validated GTO ranges
    if (isInRfiRange(handClass, heroPosition)) return true;
  }

  // Hardcoded fallback for missing data
  const rank0 = Math.floor(heroCards[0] / 4);
  const rank1 = Math.floor(heroCards[1] / 4);
  const suited = (heroCards[0] % 4) === (heroCards[1] % 4);

  const hi = Math.max(rank0, rank1);
  const lo = Math.min(rank0, rank1);
  const gap = hi - lo;

  if (rank0 === rank1) return true;
  if (suited && hi === 12) return true;
  if (suited && hi === 11) return true;
  if (hi >= 8 && lo >= 8) return true;
  if (suited && hi >= 8 && gap <= 4) return true;
  if (suited && gap === 1 && lo >= 3) return true;
  // Suited one-gappers 64s+
  if (suited && gap === 2 && lo >= 2) return true;
  // Offsuit ace-broadway: ATo+
  if (!suited && hi === 12 && lo >= 8) return true;
  // Offsuit KJo+
  if (!suited && hi === 11 && lo >= 9) return true;

  return false;
}

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

/** Hardcoded fallback flops when rejection sampling fails (card indices).
 *  Encoding: rank*4 + suit, suit: 0=c 1=d 2=h 3=s, rank: 0=2..12=A */
const FALLBACK_FLOPS: Partial<Record<ArchetypeId, CardIndex[]>> = {
  ace_high_dry_rainbow: [51, 21, 0],    // A♠ 7♦ 2♣ — rainbow (3 different suits)
  kq_high_dry_rainbow: [43, 17, 4],     // K♠ 6♦ 3♣ — rainbow
  mid_low_dry_rainbow: [34, 13, 0],     // T♥ 5♦ 2♣ — rainbow
  paired_boards: [24, 25, 0],           // 8♣ 8♦ 2♣
  two_tone_disconnected: [48, 45, 41],  // A♣ Q♦ K♦ — two-tone (2d + 1c)
  two_tone_connected: [36, 33, 29],     // J♣ T♦ 9♦ — two-tone (2d + 1c)
  monotone: [48, 36, 24],              // A♣ J♣ 8♣ — monotone (all clubs)
  rainbow_connected: [35, 29, 26],     // T♠ 9♦ 8♥ — rainbow connected (3 suits)
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

  // Use prototype position preference if available
  const proto = getPrototype(archetypeId);
  const heroPosition = constraints.heroPosition
    ?? proto?.preferredPosition
    ?? "btn";

  const { heroSeatIndex, dealerSeatIndex } = seatIndicesForPosition(
    heroPosition, numPlayers,
  );

  // Generate matching flop
  const flop = generateFlopForTexture(archetypeId, random);

  // Determine acceptable hand categories:
  // 1. Explicit constraint from caller
  // 2. Prototype acceptable hands
  // 3. No filter (any hand)
  const allowedCategories = constraints.handCategories
    ?? proto?.acceptableHands
    ?? null;

  // Deal hero hand with prototype-aware retry
  const isIP = heroPosition === "btn" || heroPosition === "co";

  // Determine primary villain seat and position for preflop filtering
  const villainSeatIndex = heroSeatIndex === 0 ? 1 : 0;
  const allPositions = positionsForTableSize(numPlayers);
  const villainOffset = (villainSeatIndex - dealerSeatIndex + numPlayers) % numPlayers;
  const villainPosition = allPositions[villainOffset];

  // Phase 1: Try for both reasonable preflop AND matching category (50 attempts)
  let bestFallback: { heroCards: CardIndex[]; handCategory: HandCategorization } | null = null;
  for (let i = 0; i < 50; i++) {
    const deck = createShuffledDeck(flop, random);
    const heroCards = deal(deck, 2);

    // Filter: must be a reasonable preflop hand
    if (!isReasonablePreflop(heroCards, heroPosition)) continue;

    const handCategory = categorizeHand(heroCards, flop);

    // Save as fallback (first reasonable hand we find)
    if (!bestFallback) bestFallback = { heroCards, handCategory };

    // Filter: must match allowed categories (if any)
    if (allowedCategories && !allowedCategories.includes(handCategory.category)) continue;

    const villainOverride = dealReasonableVillainHand(
      [...flop, ...heroCards], villainSeatIndex, villainPosition,
    );
    return buildDeal({
      heroSeatIndex, dealerSeatIndex, heroCards,
      communityCards: flop, numPlayers, archetypeId,
      handCategory, isInPosition: isIP,
      villainCardOverrides: villainOverride ? [villainOverride] : undefined,
    });
  }

  // Phase 2: Fallback — use best reasonable hand (category may not match)
  if (bestFallback) {
    const villainOverride = dealReasonableVillainHand(
      [...flop, ...bestFallback.heroCards], villainSeatIndex, villainPosition,
    );
    return buildDeal({
      heroSeatIndex, dealerSeatIndex, heroCards: bestFallback.heroCards,
      communityCards: flop, numPlayers, archetypeId,
      handCategory: bestFallback.handCategory, isInPosition: isIP,
      villainCardOverrides: villainOverride ? [villainOverride] : undefined,
    });
  }

  // Phase 3: Last resort — deal any hand (should never reach here)
  const deck = createShuffledDeck(flop, random);
  const heroCards = deal(deck, 2);
  const handCategory = categorizeHand(heroCards, flop);
  return buildDeal({
    heroSeatIndex, dealerSeatIndex, heroCards,
    communityCards: flop, numPlayers, archetypeId,
    handCategory, isInPosition: isIP,
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

/** All flop texture archetype IDs that have texture matchers */
const TEXTURE_ARCHETYPE_IDS: ArchetypeId[] = Object.keys(TEXTURE_MATCHERS) as ArchetypeId[];

function dealPostflopPrinciple(
  constraints: DrillConstraints,
  random: () => number,
): ConstrainedDeal {
  const numPlayers = 6;
  const { archetypeId } = constraints;
  const proto = getPrototype(archetypeId);

  // Use prototype position preference
  const heroPosition = constraints.heroPosition
    ?? proto?.preferredPosition
    ?? "btn";
  const { heroSeatIndex, dealerSeatIndex } = seatIndicesForPosition(
    heroPosition, numPlayers,
  );

  // Determine how many community cards we need
  const communityCount = getCommunityCountForPrinciple(archetypeId);
  const street = POSTFLOP_PRINCIPLE_STREET[archetypeId] ?? "flop";

  // Filter texture archetypes by prototype board preferences and solver data
  const preferredTextures = proto?.boardConstraints?.preferredTextures;
  let texturePool = preferredTextures
    ? TEXTURE_ARCHETYPE_IDS.filter(id => preferredTextures.includes(id))
    : [...TEXTURE_ARCHETYPE_IDS];

  // Further filter to textures with solver data for this street
  const withData = texturePool.filter(id => hasTable(id, street));
  if (withData.length > 0) texturePool = withData;

  // Apply board constraints to texture selection
  if (proto?.boardConstraints) {
    const bc = proto.boardConstraints;
    if (bc.requireDry) {
      const dry = texturePool.filter(id =>
        id.includes("dry") || id.includes("rainbow") || id === "paired_boards"
      );
      if (dry.length > 0) texturePool = dry;
    }
    if (bc.requireWet) {
      const wet = texturePool.filter(id =>
        id.includes("two_tone") || id.includes("connected") || id === "monotone"
      );
      if (wet.length > 0) texturePool = wet;
    }
    if (bc.requirePaired) {
      const paired = texturePool.filter(id => id === "paired_boards");
      if (paired.length > 0) texturePool = paired;
    }
  }

  // Pick from filtered pool (fallback to all textures if pool is empty)
  if (texturePool.length === 0) texturePool = [...TEXTURE_ARCHETYPE_IDS];
  const textureArchetypeId = texturePool[Math.floor(random() * texturePool.length)];

  // Determine acceptable hand categories
  const allowedCategories = constraints.handCategories
    ?? proto?.acceptableHands
    ?? null;

  const isIP = heroPosition === "btn" || heroPosition === "co";

  // Determine primary villain seat and position for preflop filtering
  const villainSeatIndex = heroSeatIndex === 0 ? 1 : 0;
  const allPositions = positionsForTableSize(numPlayers);
  const villainOffset = (villainSeatIndex - dealerSeatIndex + numPlayers) % numPlayers;
  const villainPosition = allPositions[villainOffset];

  // Retry loop: generate board + hero hand matching prototype constraints
  let bestFallback: {
    heroCards: CardIndex[]; communityCards: CardIndex[];
    handCategory: HandCategorization; textureId: ArchetypeId;
  } | null = null;

  for (let attempt = 0; attempt < 50; attempt++) {
    const flop = generateFlopForTexture(textureArchetypeId, random);
    const deck = createShuffledDeck(flop, random);
    const extraCards = communityCount > 3 ? deal(deck, communityCount - 3) : [];
    const communityCards = [...flop, ...extraCards];

    // Apply board-level constraints
    if (proto?.boardConstraints) {
      const bc = proto.boardConstraints;
      const tex = analyzeBoard(communityCards);

      if (bc.requirePaired && !tex.isPaired) continue;
      if (bc.requireUnpaired && tex.isPaired) continue;
    }

    const heroCards = deal(deck, 2);

    // Must be a playable preflop hand
    if (!isReasonablePreflop(heroCards, heroPosition)) continue;

    const handCategory = categorizeHand(heroCards, communityCards);

    // Save as fallback (first reasonable hand with valid board)
    if (!bestFallback) {
      bestFallback = { heroCards, communityCards, handCategory, textureId: textureArchetypeId };
    }

    // Must match allowed categories
    if (allowedCategories && !allowedCategories.includes(handCategory.category)) continue;

    const villainOverride = dealReasonableVillainHand(
      [...communityCards, ...heroCards], villainSeatIndex, villainPosition,
    );
    return buildDeal({
      heroSeatIndex, dealerSeatIndex, heroCards,
      communityCards, numPlayers, archetypeId,
      handCategory, isInPosition: isIP, textureArchetypeId,
      villainCardOverrides: villainOverride ? [villainOverride] : undefined,
    });
  }

  // Fallback: use best reasonable hand found (category may not match prototype)
  if (bestFallback) {
    const villainOverride = dealReasonableVillainHand(
      [...bestFallback.communityCards, ...bestFallback.heroCards], villainSeatIndex, villainPosition,
    );
    return buildDeal({
      heroSeatIndex, dealerSeatIndex, heroCards: bestFallback.heroCards,
      communityCards: bestFallback.communityCards, numPlayers, archetypeId,
      handCategory: bestFallback.handCategory, isInPosition: isIP,
      textureArchetypeId: bestFallback.textureId,
      villainCardOverrides: villainOverride ? [villainOverride] : undefined,
    });
  }

  // Last resort: deal any reasonable hand (should rarely reach here)
  const flop = generateFlopForTexture(textureArchetypeId, random);
  const deck = createShuffledDeck(flop, random);
  const extraCards = communityCount > 3 ? deal(deck, communityCount - 3) : [];
  const communityCards = [...flop, ...extraCards];

  // Even last resort tries for reasonable preflop
  for (let i = 0; i < 10; i++) {
    const lastDeck = createShuffledDeck(communityCards, random);
    const heroCards = deal(lastDeck, 2);
    if (isReasonablePreflop(heroCards, heroPosition)) {
      const handCategory = categorizeHand(heroCards, communityCards);
      return buildDeal({
        heroSeatIndex, dealerSeatIndex, heroCards,
        communityCards, numPlayers, archetypeId,
        handCategory, isInPosition: isIP, textureArchetypeId,
      });
    }
  }

  // Absolute last resort
  const heroCards = deal(deck, 2);
  const handCategory = categorizeHand(heroCards, communityCards);
  return buildDeal({
    heroSeatIndex, dealerSeatIndex, heroCards,
    communityCards, numPlayers, archetypeId,
    handCategory, isInPosition: isIP, textureArchetypeId,
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

/**
 * Deal a reasonable villain hand for the primary villain seat.
 * Best-effort: tries up to 10 times, returns undefined if no match.
 * The villain seat is the first non-hero seat (seat 1 when hero is seat 0).
 *
 * Uses a derived RNG seeded from the excluded cards (deterministic per-deal)
 * to avoid disrupting the caller's RNG sequence for subsequent deals.
 */
function dealReasonableVillainHand(
  excludedCards: CardIndex[],
  villainSeatIndex: number,
  villainPosition: Position | undefined,
): CardOverride | undefined {
  // Derive a deterministic seed from the dealt cards (no main RNG consumption)
  let s = excludedCards.reduce((acc, c) => (acc * 31 + c) | 0, 12345) & 0x7fffffff;
  const villainRng = () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };

  for (let i = 0; i < 10; i++) {
    const deck = createShuffledDeck(excludedCards, villainRng);
    const villainCards = deal(deck, 2);
    if (isReasonablePreflop(villainCards, villainPosition)) {
      return {
        seatIndex: villainSeatIndex,
        cards: [...villainCards],
        visibility: "hidden" as CardVisibility,
      };
    }
  }
  return undefined;
}

/** Map postflop principle archetypes to the street they need solver data for */
const POSTFLOP_PRINCIPLE_STREET: Partial<Record<ArchetypeId, "flop" | "turn" | "river">> = {
  cbet_sizing_frequency: "flop",
  three_bet_pot_postflop: "flop",
  turn_barreling: "turn",
  river_bluff_catching_mdf: "river",
  thin_value_river: "river",
  overbet_river: "river",
  exploitative_overrides: "flop",
};

function archetypeHasData(archetypeId: ArchetypeId, category: ArchetypeCategory): boolean {
  if (category === "preflop") return hasTable(archetypeId, "preflop");
  if (category === "flop_texture") return hasTable(archetypeId, "flop");
  // Postflop principles use texture tables — check if any exist for the needed street
  const street = POSTFLOP_PRINCIPLE_STREET[archetypeId] ?? "flop";
  return hasAnyTableForStreet(street);
}

function seatIndicesForPosition(
  heroPosition: Position,
  numPlayers: number,
): { heroSeatIndex: number; dealerSeatIndex: number } {
  // Hero always stays at seat 0 (fixed seat, like real poker).
  // Move the dealer button so hero gets the desired position.
  const positions = positionsForTableSize(numPlayers);
  const posIndex = positions.indexOf(heroPosition);
  if (posIndex === -1) {
    return { heroSeatIndex: 0, dealerSeatIndex: 0 };
  }
  // If hero is at seat 0 and needs to be at position index posIndex,
  // dealer must be at seat (numPlayers - posIndex) % numPlayers
  const heroSeatIndex = 0;
  const dealerSeatIndex = (numPlayers - posIndex) % numPlayers;
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
  textureArchetypeId?: ArchetypeId;
  villainCardOverrides?: CardOverride[];
}): ConstrainedDeal {
  const { archetypeId, heroSeatIndex, dealerSeatIndex, numPlayers, heroCards, textureArchetypeId } = params;
  // Derive hero's position from seat indices
  const positions = positionsForTableSize(numPlayers);
  const heroOffset = (heroSeatIndex - dealerSeatIndex + numPlayers) % numPlayers;
  const heroPosition: Position = positions[heroOffset] ?? "btn";
  const category = ARCHETYPE_CATEGORY[archetypeId];

  return {
    ...params,
    heroPosition,
    archetype: {
      archetypeId,
      confidence: 1.0,
      category,
      description: ARCHETYPE_DESCRIPTION[archetypeId],
      textureArchetypeId,
    },
    hasFrequencyData: archetypeHasData(archetypeId, category),
    cardOverrides: [
      {
        seatIndex: heroSeatIndex,
        cards: [...heroCards],
        visibility: "revealed" as const,
      },
      ...(params.villainCardOverrides ?? []),
    ],
  };
}
