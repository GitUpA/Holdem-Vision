/**
 * Profile Modifier Definitions — NIT, FISH, TAG, LAG, GTO.
 *
 * Each profile is defined as situation-aware frequency modifiers
 * relative to the GTO solver base. Values derived from comparing
 * existing BehavioralParams ratios (e.g., NIT opens 12% vs GTO 27%).
 *
 * The GTO profile uses identity modifiers (intensity=0) — pure solver output.
 *
 * Pure TypeScript, zero Convex imports.
 */
import type { ProfileModifierMap, SituationModifier } from "./modifiedGtoTypes";
import { identitySituationModifier } from "./modifiedGtoTypes";
import type { SituationKey } from "../../types/opponents";
import { ALL_SITUATION_KEYS } from "../../types/opponents";

// ═══════════════════════════════════════════════════════
// HELPER
// ═══════════════════════════════════════════════════════

/** Build a SituationModifier with shorthand. */
function sm(
  foldScale: number,
  aggressionScale: number,
  raiseVsCallBias: number,
  sizingBias: number,
  intensity: number,
  context: {
    hand?: number;
    texture?: number;
    odds?: number;
    position?: number;
    foldEq?: number;
    spr?: number;
    draw?: number;
  },
  deviationReason: string,
): SituationModifier {
  return {
    base: { foldScale, aggressionScale, raiseVsCallBias, sizingBias, intensity },
    context: {
      handStrengthSensitivity: context.hand ?? 0,
      textureSensitivity: context.texture ?? 0,
      potOddsSensitivity: context.odds ?? 0,
      positionSensitivity: context.position ?? 0,
      foldEquitySensitivity: context.foldEq ?? 0,
      sprSensitivity: context.spr ?? 0,
      drawSensitivity: context.draw ?? 0,
    },
    deviationReason,
  };
}

// ═══════════════════════════════════════════════════════
// NIT — ultra-tight, only premium hands
// ═══════════════════════════════════════════════════════
//
// Deviations from GTO:
// - Folds FAR more than GTO (foldScale 1.5-2.5)
// - Much less aggressive (aggressionScale 0.3-0.7)
// - When continuing, prefers calling over raising (raiseVsCallBias negative or neutral)
// - Low context sensitivity — ignores most game factors
// - Low bluff frequency is captured by low aggressionScale on fold portion

export const NIT_MODIFIERS: ProfileModifierMap = {
  "preflop.open": sm(
    2.1, 0.7, 0.1, 0.0, 0.9,
    { hand: 0.3, position: 0.4 },
    "Nits fold far more than GTO preflop (~12% vs ~27%). They only play premium hands and barely adjust for position.",
  ),
  "preflop.facing_raise": sm(
    2.5, 0.5, 0.3, 0.0, 0.9,
    { hand: 0.3 },
    "Nits fold almost everything to raises. When they 3-bet, it's always the nuts (AA, KK, QQ, AKs).",
  ),
  "preflop.facing_3bet": sm(
    3.0, 0.4, 0.4, 0.0, 0.95,
    { hand: 0.2 },
    "Only AA/KK continue vs 3-bets. Everything else folds immediately.",
  ),
  "preflop.facing_4bet": sm(
    3.5, 0.3, 0.5, 0.0, 0.95,
    { hand: 0.1 },
    "Only pocket aces. A nit facing a 4-bet folds virtually everything.",
  ),
  "postflop.aggressor.ip": sm(
    1.3, 0.5, -0.1, -0.1, 0.8,
    { hand: 0.4, texture: 0.2, draw: 0.2 },
    "Nits c-bet with top pair or better. They rarely bluff — a postflop bet from a Nit usually means real strength.",
  ),
  "postflop.aggressor.oop": sm(
    1.5, 0.4, -0.2, -0.1, 0.85,
    { hand: 0.4, texture: 0.15 },
    "Out of position, nits c-bet even less and are almost exclusively value-heavy.",
  ),
  "postflop.caller.ip": sm(
    1.5, 0.4, -0.2, -0.2, 0.8,
    { hand: 0.3, draw: 0.2 },
    "As a caller in position, nits mostly check back. They probe rarely and only with made hands.",
  ),
  "postflop.caller.oop": sm(
    1.8, 0.3, -0.3, -0.2, 0.85,
    { hand: 0.3 },
    "As a caller out of position, nits almost never lead. They check and fold unless they connected strongly.",
  ),
  "postflop.facing_bet": sm(
    1.6, 0.4, -0.1, 0.1, 0.85,
    { hand: 0.4, odds: 0.2, draw: 0.2 },
    "Nits fold 55% to c-bets. When they raise, they always have it. Very few bluff raises.",
  ),
  "postflop.facing_raise": sm(
    2.0, 0.3, -0.2, 0.0, 0.9,
    { hand: 0.3 },
    "Facing a raise, nits only continue with very strong hands. Check-raises are always monsters.",
  ),
  "postflop.facing_allin": sm(
    2.5, 0.0, 0.0, 0.0, 0.95,
    { hand: 0.2 },
    "Nits need the nuts to call an all-in. They fold everything but the absolute best hands.",
  ),
};

// ═══════════════════════════════════════════════════════
// FISH — loose-passive, calls too much, rarely raises
// ═══════════════════════════════════════════════════════
//
// Deviations from GTO:
// - Folds MUCH less than GTO (foldScale 0.3-0.6)
// - Much less aggressive (aggressionScale 0.2-0.4)
// - Strong negative raiseVsCallBias (calls everything, rarely raises)
// - Very low context sensitivity — barely adjusts to anything
// - The "calling station" identity

export const FISH_MODIFIERS: ProfileModifierMap = {
  "preflop.open": sm(
    0.4, 0.3, -0.5, -0.2, 0.95,
    { hand: 0.1, position: 0.1 },
    "Fish play too many hands — over half of starting hands. They limp often and raise rarely. Position doesn't change their behavior.",
  ),
  "preflop.facing_raise": sm(
    0.5, 0.15, -0.7, -0.2, 0.95,
    { hand: 0.1 },
    "Fish call raises with any two suited, any pair, any connector. They rarely 3-bet, and when they do, it's the nuts.",
  ),
  "preflop.facing_3bet": sm(
    0.7, 0.15, -0.6, 0.0, 0.9,
    { hand: 0.1 },
    "Even fish tighten up somewhat to 3-bets, but they still call too wide with suited aces and medium pairs.",
  ),
  "preflop.facing_4bet": sm(
    0.9, 0.1, -0.5, 0.0, 0.85,
    { hand: 0.15 },
    "Fish rarely get this deep in preflop action. When they continue, they have a real hand.",
  ),
  "postflop.aggressor.ip": sm(
    1.3, 0.3, -0.6, -0.2, 0.9,
    { hand: 0.1, texture: 0.05 },
    "Fish c-bet infrequently (30%). When they do bet, they connected with the board. Their bets are almost never bluffs.",
  ),
  "postflop.aggressor.oop": sm(
    1.4, 0.2, -0.7, -0.2, 0.9,
    { hand: 0.1 },
    "Out of position, fish bet even less. They tend to check and call rather than lead.",
  ),
  "postflop.caller.ip": sm(
    0.3, 0.2, -0.7, -0.3, 0.95,
    { hand: 0.05, draw: 0.1 },
    "Fish call with any pair, any draw, any overcard. Their calling range is very wide but mostly weak.",
  ),
  "postflop.caller.oop": sm(
    0.3, 0.15, -0.8, -0.3, 0.95,
    { hand: 0.05 },
    "Fish are calling stations. They rarely fold to a single bet. Value bet aggressively, avoid bluffing.",
  ),
  "postflop.facing_bet": sm(
    0.4, 0.2, -0.8, -0.2, 0.95,
    { hand: 0.1, odds: 0.05, draw: 0.1 },
    "Fish call bets with bottom pair, gutshots, backdoor draws. Bluffing fish is usually -EV.",
  ),
  "postflop.facing_raise": sm(
    0.5, 0.15, -0.7, 0.0, 0.9,
    { hand: 0.1 },
    "Even fish respect raises somewhat, but they still call more often than they should. If a fish raises back, it's a monster.",
  ),
  "postflop.facing_allin": sm(
    0.6, 0.0, -0.5, 0.0, 0.85,
    { hand: 0.15 },
    "Fish are more likely than others to call all-ins with draws and medium pairs. Still, most fold junk.",
  ),
};

// ═══════════════════════════════════════════════════════
// TAG — tight-aggressive, selective and solid
// ═══════════════════════════════════════════════════════
//
// Deviations from GTO:
// - Slightly more folds (foldScale 1.0-1.3)
// - Similar or slightly higher aggression (aggressionScale 0.9-1.3)
// - Slight raise bias (raiseVsCallBias slightly positive)
// - HIGH context sensitivity — adapts well to all factors
// - Closest to GTO of non-GTO profiles → lower intensity

export const TAG_MODIFIERS: ProfileModifierMap = {
  "preflop.open": sm(
    1.2, 1.0, 0.05, 0.0, 0.5,
    { hand: 0.7, position: 0.8, texture: 0.6 },
    "TAGs play solid, selective-aggressive (~22% vs GTO ~27%). They choose good starting hands and adjust significantly for position.",
  ),
  "preflop.facing_raise": sm(
    1.1, 0.9, 0.1, 0.0, 0.5,
    { hand: 0.7, position: 0.8 },
    "TAGs respect raises but still 3-bet with a balanced range of value and occasional bluffs.",
  ),
  "preflop.facing_3bet": sm(
    1.1, 0.85, 0.0, 0.0, 0.5,
    { hand: 0.7 },
    "TAGs defend ~25% vs 3-bets. They call with suited connectors, medium pairs, and 4-bet with premiums plus occasional bluffs.",
  ),
  "preflop.facing_4bet": sm(
    1.1, 1.0, 0.0, 0.0, 0.4,
    { hand: 0.6 },
    "Facing a 4-bet, TAGs play very tight. Only premiums continue, and most are shoving.",
  ),
  "postflop.aggressor.ip": sm(
    0.8, 1.2, 0.1, 0.05, 0.6,
    { hand: 0.7, texture: 0.6, foldEq: 0.6, spr: 0.5, draw: 0.6 },
    "TAGs c-bet more frequently (70% vs GTO 55%) with a good value/bluff mix. They use position to apply pressure.",
  ),
  "postflop.aggressor.oop": sm(
    0.9, 1.1, 0.05, 0.0, 0.55,
    { hand: 0.7, texture: 0.5, foldEq: 0.5, draw: 0.5 },
    "Out of position, TAGs c-bet slightly less but maintain aggression. They check back more marginal hands for pot control.",
  ),
  "postflop.caller.ip": sm(
    1.0, 1.1, 0.1, 0.0, 0.5,
    { hand: 0.7, texture: 0.5, foldEq: 0.5, draw: 0.5 },
    "As a caller in position, TAGs probe and float flops with draws and overcards. They use position to bluff on later streets.",
  ),
  "postflop.caller.oop": sm(
    1.1, 0.9, -0.1, 0.0, 0.5,
    { hand: 0.6, texture: 0.4, draw: 0.4 },
    "As a caller OOP, TAGs play defensively. Check-call medium strength, check-raise strong hands.",
  ),
  "postflop.facing_bet": sm(
    1.1, 1.1, 0.05, 0.0, 0.5,
    { hand: 0.7, odds: 0.5, texture: 0.5, draw: 0.6 },
    "TAGs defend well (~55%). They raise with strong hands and occasionally as bluffs.",
  ),
  "postflop.facing_raise": sm(
    1.2, 0.9, -0.05, 0.0, 0.5,
    { hand: 0.6, odds: 0.4 },
    "TAGs tighten against raises. They need a strong hand to continue and rarely get into re-raise wars without the goods.",
  ),
  "postflop.facing_allin": sm(
    1.2, 0.0, 0.0, 0.0, 0.5,
    { hand: 0.5, odds: 0.4 },
    "Facing all-in, TAGs make disciplined decisions based on pot odds and hand strength.",
  ),
};

// ═══════════════════════════════════════════════════════
// LAG — loose-aggressive, creative and unpredictable
// ═══════════════════════════════════════════════════════
//
// Deviations from GTO:
// - Folds less than GTO (foldScale 0.3-0.8)
// - Much more aggressive (aggressionScale 1.3-2.0)
// - Positive raiseVsCallBias (raises over calls)
// - Larger sizings (sizingBias positive)
// - High context sensitivity — exploits position and fold equity

export const LAG_MODIFIERS: ProfileModifierMap = {
  "preflop.open": sm(
    0.6, 1.3, 0.15, 0.1, 0.75,
    { hand: 0.5, position: 0.9, foldEq: 0.6 },
    "LAGs play many hands aggressively (~35% vs GTO ~27%). They put constant pressure with raises, especially late position.",
  ),
  "preflop.facing_raise": sm(
    0.7, 1.4, 0.2, 0.1, 0.75,
    { hand: 0.5, position: 0.9, foldEq: 0.7 },
    "LAGs 3-bet light frequently. Their wide 3-bet range includes many bluffs alongside premiums.",
  ),
  "preflop.facing_3bet": sm(
    0.7, 1.3, 0.15, 0.0, 0.7,
    { hand: 0.5, position: 0.8 },
    "LAGs defend ~35% vs 3-bets with wide calls and light 4-bets using suited aces and blockers.",
  ),
  "preflop.facing_4bet": sm(
    0.8, 1.2, 0.1, 0.0, 0.6,
    { hand: 0.5 },
    "Facing 4-bets, LAGs tighten significantly but still shove wider than most.",
  ),
  "postflop.aggressor.ip": sm(
    0.3, 1.8, 0.2, 0.2, 0.8,
    { hand: 0.5, texture: 0.5, foldEq: 0.8, position: 0.9, spr: 0.5, draw: 0.7 },
    "LAGs c-bet very frequently (80%) with high bluff frequency. If you check, they bet. If you call, they barrel again.",
  ),
  "postflop.aggressor.oop": sm(
    0.4, 1.6, 0.15, 0.15, 0.75,
    { hand: 0.5, texture: 0.5, foldEq: 0.7, draw: 0.6 },
    "Even OOP, LAGs maintain high aggression. They lead and barrel frequently, using unpredictability as a weapon.",
  ),
  "postflop.caller.ip": sm(
    0.5, 1.5, 0.15, 0.15, 0.75,
    { hand: 0.5, texture: 0.5, foldEq: 0.7, draw: 0.6 },
    "As a caller in position, LAGs attack weakness aggressively. They float wide and fire on later streets.",
  ),
  "postflop.caller.oop": sm(
    0.6, 1.3, 0.1, 0.1, 0.7,
    { hand: 0.5, texture: 0.4, foldEq: 0.5, draw: 0.5 },
    "LAGs donk-bet more than other player types. They use unorthodox lines to keep opponents off-balance.",
  ),
  "postflop.facing_bet": sm(
    0.5, 1.5, 0.15, 0.1, 0.8,
    { hand: 0.5, odds: 0.4, foldEq: 0.6, draw: 0.6 },
    "LAGs rarely fold to bets. They call wide and raise aggressively with both value and bluffs.",
  ),
  "postflop.facing_raise": sm(
    0.8, 1.2, 0.05, 0.0, 0.6,
    { hand: 0.5, odds: 0.4 },
    "Good LAGs know when to back off. Against strong resistance, they tighten significantly.",
  ),
  "postflop.facing_allin": sm(
    0.7, 0.0, 0.0, 0.0, 0.6,
    { hand: 0.5, odds: 0.4 },
    "Facing all-in, LAGs make calculated decisions. They call wider than TAGs but still need a hand.",
  ),
};

// ═══════════════════════════════════════════════════════
// GTO — identity modifier (pure solver output)
// ═══════════════════════════════════════════════════════

function buildGtoModifiers(): ProfileModifierMap {
  const map: Partial<Record<SituationKey, SituationModifier>> = {};
  for (const key of ALL_SITUATION_KEYS) {
    map[key] = identitySituationModifier();
  }
  return map as ProfileModifierMap;
}

export const GTO_MODIFIERS: ProfileModifierMap = buildGtoModifiers();

// ═══════════════════════════════════════════════════════
// REGISTRY — profile ID → modifier map
// ═══════════════════════════════════════════════════════

const MODIFIER_REGISTRY: Record<string, ProfileModifierMap> = {
  nit: NIT_MODIFIERS,
  fish: FISH_MODIFIERS,
  tag: TAG_MODIFIERS,
  lag: LAG_MODIFIERS,
  gto: GTO_MODIFIERS,
};

/**
 * Get the modifier map for a profile ID.
 * Returns GTO (identity) modifiers for unknown profiles.
 */
export function getModifierMap(profileId: string): ProfileModifierMap {
  return MODIFIER_REGISTRY[profileId] ?? GTO_MODIFIERS;
}

/**
 * Register a custom modifier map for a profile ID.
 */
export function registerModifierMap(
  profileId: string,
  modifiers: ProfileModifierMap,
): void {
  MODIFIER_REGISTRY[profileId] = modifiers;
}
