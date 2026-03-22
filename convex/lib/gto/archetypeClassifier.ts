/**
 * Archetype Classifier — maps a game state into one of 20 core GTO archetypes.
 *
 * The 20 archetypes cover ~80% of decisions in 6-max cash:
 *   - 5 preflop foundations (RFI, BB defense, 3-bet, BvB, 4-bet/5-bet)
 *   - 8 flop textures (A-high dry, K/Q-high dry, mid/low dry, paired, etc.)
 *   - 7 postflop principles (c-bet, turn barrel, river MDF, thin value, etc.)
 *
 * Pure TypeScript, zero Convex imports.
 */
import type { CardIndex, Street, Position } from "../types/cards";
import type { GameState, GameAction } from "../state/game-state";
import { analyzeBoard, type BoardTexture } from "../opponents/engines/boardTexture";

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

export type ArchetypeId =
  // Preflop (1-5)
  | "rfi_opening"
  | "bb_defense_vs_rfi"
  | "three_bet_pots"
  | "blind_vs_blind"
  | "four_bet_five_bet"
  // Flop textures (6-13)
  | "ace_high_dry_rainbow"
  | "kq_high_dry_rainbow"
  | "mid_low_dry_rainbow"
  | "paired_boards"
  | "two_tone_disconnected"
  | "two_tone_connected"
  | "monotone"
  | "rainbow_connected"
  // Postflop principles (14-20)
  | "cbet_sizing_frequency"
  | "turn_barreling"
  | "river_bluff_catching_mdf"
  | "thin_value_river"
  | "overbet_river"
  | "three_bet_pot_postflop"
  | "exploitative_overrides";

export type ArchetypeCategory = "preflop" | "flop_texture" | "postflop_principle";

export interface ArchetypeClassification {
  archetypeId: ArchetypeId;
  confidence: number; // 0-1
  category: ArchetypeCategory;
  description: string;
  fallback?: ArchetypeId;
  /**
   * Flop texture archetype for solver table lookup on turn/river.
   * On flop, this equals archetypeId. On turn/river, the primary archetypeId
   * is a postflop principle (e.g., "turn_barreling") while textureArchetypeId
   * points to the flop texture (e.g., "ace_high_dry_rainbow") for solver lookup.
   */
  textureArchetypeId?: ArchetypeId;
}

/** Minimal context needed for classification — avoids coupling to full GameState */
export interface ClassificationContext {
  street: Street;
  communityCards: CardIndex[];
  heroPosition: Position;
  villainPositions: Position[];
  potType: PotType;
  actionHistory: ActionSummary[];
  /** Is hero the preflop aggressor? */
  isAggressor: boolean;
  /** Is hero in position relative to remaining villain(s)? */
  isInPosition: boolean;
  /** Street where the current action is happening */
  actingStreet: Street;
}

export type PotType = "srp" | "3bet" | "4bet" | "bvb" | "limped";

export interface ActionSummary {
  position: Position;
  street: Street;
  actionType: "fold" | "check" | "call" | "bet" | "raise" | "all_in";
  isHero: boolean;
}

// ═══════════════════════════════════════════════════════
// ARCHETYPE METADATA
// ═══════════════════════════════════════════════════════

const ARCHETYPE_INFO: Record<ArchetypeId, { description: string; category: ArchetypeCategory }> = {
  rfi_opening: { description: "Raise First In — opening ranges by position", category: "preflop" },
  bb_defense_vs_rfi: { description: "Facing a single raise — fold/call/3-bet", category: "preflop" },
  three_bet_pots: { description: "3-bet pot dynamics — IP as 3-bettor or OOP as caller", category: "preflop" },
  blind_vs_blind: { description: "SB vs BB — unique wide-range dynamics", category: "preflop" },
  four_bet_five_bet: { description: "4-bet/5-bet polarized — value and bluff ratios", category: "preflop" },
  ace_high_dry_rainbow: { description: "Axx rainbow flop — massive range advantage for raiser", category: "flop_texture" },
  kq_high_dry_rainbow: { description: "K/Q-high dry rainbow — moderate range advantage", category: "flop_texture" },
  mid_low_dry_rainbow: { description: "7xx-Txx rainbow — smaller range advantage, more checking", category: "flop_texture" },
  paired_boards: { description: "Paired flop — reduced combos, range vs range", category: "flop_texture" },
  two_tone_disconnected: { description: "Two-tone disconnected — flush draws, less straight draws", category: "flop_texture" },
  two_tone_connected: { description: "Two-tone connected — flush and straight draws", category: "flop_texture" },
  monotone: { description: "All one suit — flush completes everything", category: "flop_texture" },
  rainbow_connected: { description: "Rainbow connected — straight-draw heavy board", category: "flop_texture" },
  cbet_sizing_frequency: { description: "C-bet strategy — sizing and frequency decisions", category: "postflop_principle" },
  turn_barreling: { description: "Turn barreling and probe defense", category: "postflop_principle" },
  river_bluff_catching_mdf: { description: "River bluff-catching using MDF", category: "postflop_principle" },
  thin_value_river: { description: "Thin value betting on the river", category: "postflop_principle" },
  overbet_river: { description: "Overbet river spots — polarized nuts vs bluffs", category: "postflop_principle" },
  three_bet_pot_postflop: { description: "3-bet pot postflop continuation", category: "postflop_principle" },
  exploitative_overrides: { description: "Exploitative adjustments vs population tendencies", category: "postflop_principle" },
};

// ═══════════════════════════════════════════════════════
// MAIN CLASSIFIER
// ═══════════════════════════════════════════════════════

/**
 * Classify a game situation into one of the 20 core archetypes.
 *
 * Classification priority:
 * 1. Street determines broad category (preflop vs postflop)
 * 2. Within preflop: action history determines archetype
 * 3. Within postflop on flop: board texture determines flop archetype, then
 *    overlay postflop principle if applicable (e.g., c-bet opportunity)
 * 4. Turn/river: postflop principle archetypes dominate
 */
export function classifyArchetype(ctx: ClassificationContext): ArchetypeClassification {
  if (ctx.street === "preflop") {
    return classifyPreflop(ctx);
  }
  return classifyPostflop(ctx);
}

/**
 * Build a ClassificationContext from a GameState + hero seat.
 * Convenience function for use in engines and tests.
 */
export function contextFromGameState(
  state: GameState,
  heroSeat: number,
): ClassificationContext {
  const hero = state.players[heroSeat];
  const activePlayers = state.players.filter(
    (p) => p.status === "active" || p.status === "all_in",
  );
  const villainPositions = activePlayers
    .filter((p) => p.seatIndex !== heroSeat)
    .map((p) => p.position);

  const potType = derivePotType(state.actionHistory);
  const isAggressor = deriveIsAggressor(state.actionHistory, heroSeat);
  const isInPosition = deriveIsInPosition(hero.position, villainPositions);

  const actionHistory: ActionSummary[] = state.actionHistory.map((a) => ({
    position: a.position,
    street: a.street,
    actionType: a.actionType,
    isHero: a.seatIndex === heroSeat,
  }));

  return {
    street: state.currentStreet,
    communityCards: state.communityCards,
    heroPosition: hero.position,
    villainPositions,
    potType,
    actionHistory,
    isAggressor,
    isInPosition,
    actingStreet: state.currentStreet,
  };
}

// ═══════════════════════════════════════════════════════
// PREFLOP CLASSIFICATION
// ═══════════════════════════════════════════════════════

function classifyPreflop(ctx: ClassificationContext): ArchetypeClassification {
  const preflopActions = ctx.actionHistory.filter((a) => a.street === "preflop");
  const raises = preflopActions.filter(
    (a) => a.actionType === "raise" || a.actionType === "bet",
  );
  const heroRaises = raises.filter((a) => a.isHero);

  // 4-bet+ pots
  if (raises.length >= 3) {
    return make("four_bet_five_bet", 0.9);
  }

  // 3-bet pots
  if (raises.length === 2) {
    return make("three_bet_pots", 0.9);
  }

  // Blind vs blind: SB and BB only
  const isBvB =
    ctx.villainPositions.length === 1 &&
    isBlindsOnly(ctx.heroPosition, ctx.villainPositions[0]);
  if (isBvB && raises.length <= 1) {
    return make("blind_vs_blind", 0.85);
  }

  // Facing a single raise (hero hasn't raised) — defense/cold-call spot
  // bb_defense_vs_rfi data covers ALL positions (BTN, CO, SB, etc.), not just BB
  const villainRaises = raises.filter((a) => !a.isHero);
  if (villainRaises.length === 1 && heroRaises.length === 0) {
    return make("bb_defense_vs_rfi", 0.9);
  }

  // RFI: no villain raises yet — hero is opening or first to act
  if (villainRaises.length === 0) {
    return make("rfi_opening", 0.85);
  }

  // Hero already raised once, no re-raises — still RFI territory
  if (raises.length === 1 && heroRaises.length === 1) {
    return make("rfi_opening", 0.85);
  }

  // Fallback
  return make("rfi_opening", 0.5, "three_bet_pots");
}

// ═══════════════════════════════════════════════════════
// POSTFLOP CLASSIFICATION
// ═══════════════════════════════════════════════════════

function classifyPostflop(ctx: ClassificationContext): ArchetypeClassification {
  // Compute flop texture for solver lookup (always available for postflop)
  const flopCards = ctx.communityCards.length >= 3
    ? ctx.communityCards.slice(0, 3)
    : ctx.communityCards;
  const textureId = flopCards.length >= 3
    ? classifyFlopTexture(analyzeBoard(flopCards)).archetypeId
    : undefined;

  // 3-bet pot postflop — principle archetype with texture for solver lookup
  if (ctx.potType === "3bet" || ctx.potType === "4bet") {
    return makeWithTexture("three_bet_pot_postflop", 0.85, textureId);
  }

  // Turn and river: classify by postflop principle
  if (ctx.street === "turn") {
    return classifyTurn(ctx, textureId);
  }
  if (ctx.street === "river") {
    return classifyRiver(ctx, textureId);
  }

  // Flop: classify by texture, overlay c-bet principle
  return classifyFlop(ctx);
}

function classifyFlop(ctx: ClassificationContext): ArchetypeClassification {
  const texture = analyzeBoard(ctx.communityCards);
  const textureArchetype = classifyFlopTexture(texture);

  // If hero is aggressor and hasn't bet yet this street → c-bet opportunity
  const flopActions = ctx.actionHistory.filter((a) => a.street === "flop");
  const heroFlopActions = flopActions.filter((a) => a.isHero);
  const isCbetSpot = ctx.isAggressor && heroFlopActions.length === 0;

  if (isCbetSpot) {
    // Return flop texture but note c-bet applicability
    // The texture archetype IS the c-bet archetype on the flop
    return textureArchetype;
  }

  // Facing a bet on the flop
  const facingBet = flopActions.some(
    (a) => !a.isHero && (a.actionType === "bet" || a.actionType === "raise"),
  );
  if (facingBet && !ctx.isAggressor) {
    // Caller facing c-bet — still use texture archetype
    return textureArchetype;
  }

  return textureArchetype;
}

function classifyFlopTexture(texture: BoardTexture): ArchetypeClassification {
  // Paired boards — 17% of flops, unique dynamics
  if (texture.isPaired) {
    return make("paired_boards", 0.9);
  }

  // Monotone — all one suit
  if (texture.isMonotone) {
    return make("monotone", 0.9);
  }

  // Two-tone boards
  if (texture.isTwoTone) {
    if (texture.straightHeavy) {
      return make("two_tone_connected", 0.85);
    }
    return make("two_tone_disconnected", 0.85);
  }

  // Rainbow boards
  if (texture.isRainbow) {
    // Connected rainbow
    if (texture.hasConnectors && texture.straightHeavy) {
      return make("rainbow_connected", 0.85);
    }

    // High card determines dry rainbow subtype
    if (texture.highCard === 12) {
      // Ace high
      return make("ace_high_dry_rainbow", 0.9);
    }
    if (texture.highCard >= 10) {
      // K or Q high (10=J would be edge, but K=11, Q=10)
      return make("kq_high_dry_rainbow", 0.85);
    }

    // Mid/low dry rainbow with connectors (but not straight-heavy)
    if (texture.hasConnectors) {
      return make("rainbow_connected", 0.7, "mid_low_dry_rainbow");
    }

    return make("mid_low_dry_rainbow", 0.85);
  }

  // Fallback: shouldn't reach here but handle gracefully
  return make("mid_low_dry_rainbow", 0.5);
}

function classifyTurn(ctx: ClassificationContext, textureId?: ArchetypeId): ArchetypeClassification {
  const turnActions = ctx.actionHistory.filter((a) => a.street === "turn");
  const heroTurnActions = turnActions.filter((a) => a.isHero);

  // Aggressor on turn → barreling decision
  if (ctx.isAggressor && heroTurnActions.length === 0) {
    return makeWithTexture("turn_barreling", 0.85, textureId);
  }

  // Caller facing turn bet → also turn barreling (defender's perspective)
  const facingTurnBet = turnActions.some(
    (a) => !a.isHero && (a.actionType === "bet" || a.actionType === "raise"),
  );
  if (facingTurnBet) {
    return makeWithTexture("turn_barreling", 0.8, textureId);
  }

  // Checked to on turn → probe opportunity
  if (!ctx.isAggressor && heroTurnActions.length === 0) {
    return makeWithTexture("turn_barreling", 0.7, textureId, "cbet_sizing_frequency");
  }

  // Fallback — still pass texture for solver lookup
  return makeWithTexture("turn_barreling", 0.65, textureId);
}

function classifyRiver(ctx: ClassificationContext, textureId?: ArchetypeId): ArchetypeClassification {
  const riverActions = ctx.actionHistory.filter((a) => a.street === "river");
  const heroRiverActions = riverActions.filter((a) => a.isHero);

  // Facing a river bet → bluff-catching / MDF decision
  const facingRiverBet = riverActions.some(
    (a) => !a.isHero && (a.actionType === "bet" || a.actionType === "raise"),
  );
  if (facingRiverBet && heroRiverActions.length === 0) {
    return makeWithTexture("river_bluff_catching_mdf", 0.9, textureId);
  }

  // Hero's turn to bet on river
  if (heroRiverActions.length === 0) {
    return makeWithTexture("thin_value_river", 0.75, textureId, "overbet_river");
  }

  return makeWithTexture("river_bluff_catching_mdf", 0.6, textureId);
}

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

function make(
  id: ArchetypeId,
  confidence: number,
  fallback?: ArchetypeId,
): ArchetypeClassification {
  const info = ARCHETYPE_INFO[id];
  return {
    archetypeId: id,
    confidence,
    category: info.category,
    description: info.description,
    fallback,
  };
}

/** Like make() but includes textureArchetypeId for turn/river solver lookup */
function makeWithTexture(
  id: ArchetypeId,
  confidence: number,
  textureArchetypeId?: ArchetypeId,
  fallback?: ArchetypeId,
): ArchetypeClassification {
  const info = ARCHETYPE_INFO[id];
  return {
    archetypeId: id,
    confidence,
    category: info.category,
    description: info.description,
    fallback,
    textureArchetypeId,
  };
}

const BLIND_POSITIONS = new Set<Position>(["sb", "bb"]);

function isBlindsOnly(pos1: Position, pos2: Position): boolean {
  return BLIND_POSITIONS.has(pos1) && BLIND_POSITIONS.has(pos2);
}

/** Determine pot type from preflop action history */
export function derivePotType(actions: GameAction[]): PotType {
  const preflopActions = actions.filter((a) => a.street === "preflop");
  const raises = preflopActions.filter(
    (a) => a.actionType === "raise" || a.actionType === "bet",
  );

  if (raises.length >= 3) return "4bet";
  if (raises.length === 2) return "3bet";

  // Check BvB: only blind positions involved
  const activePositions = new Set(
    preflopActions
      .filter((a) => a.actionType !== "fold")
      .map((a) => a.position),
  );
  if (
    activePositions.size <= 2 &&
    [...activePositions].every((p) => BLIND_POSITIONS.has(p))
  ) {
    return "bvb";
  }

  // Check limped pot
  if (raises.length === 0) return "limped";

  return "srp";
}

/** Determine if hero was the preflop aggressor */
export function deriveIsAggressor(actions: GameAction[], heroSeat: number): boolean {
  const preflopRaises = actions.filter(
    (a) => a.street === "preflop" && (a.actionType === "raise" || a.actionType === "bet"),
  );
  if (preflopRaises.length === 0) return false;
  // Last preflop raiser is the aggressor
  return preflopRaises[preflopRaises.length - 1].seatIndex === heroSeat;
}

/** Position order for determining IP/OOP (higher = later to act = more IP) */
const POSITION_ORDER: Record<Position, number> = {
  sb: 0,
  bb: 1,
  utg: 2,
  utg1: 3,
  utg2: 4,
  mp: 5,
  mp1: 6,
  hj: 7,
  co: 8,
  btn: 9,
};

/**
 * Determine if hero is in position (acts last postflop).
 * Postflop order: SB first, BTN last (different from preflop).
 */
export function deriveIsInPosition(
  heroPos: Position,
  villainPositions: Position[],
): boolean {
  const heroOrder = POSITION_ORDER[heroPos];
  return villainPositions.every((vp) => POSITION_ORDER[vp] < heroOrder);
}
