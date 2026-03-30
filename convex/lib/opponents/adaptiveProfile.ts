/**
 * Adaptive Profile — creates a dynamic OpponentProfile from SessionMemory.
 *
 * The "perfect exploiter" starts as GTO and shifts its modifier vector
 * based on detected opponent patterns. The coaching tells users to do this;
 * this profile automates it for validation.
 *
 * Pure TypeScript, zero Convex imports.
 */

import type { OpponentProfile, BehavioralParams, SituationKey } from "../types/opponents";
import type { SessionMemory } from "../pipeline/sessionMemory";
import { registerModifierMap } from "./engines/modifierProfiles";
import { ALL_SITUATION_KEYS } from "../types/opponents";

/**
 * Create a "perfect exploiter" profile that adapts to a specific villain.
 *
 * The profile itself is a standard GTO profile — the magic is in the
 * modifier map, which is dynamically computed from session memory and
 * registered before each hand.
 */
export function updateExploiterModifiers(
  memory: SessionMemory,
  villainSeatIndex: number,
): void {
  const counterModifier = memory.getCounterModifier(villainSeatIndex);
  registerModifierMap("exploiter", counterModifier);
}

/** GTO-equivalent default params (avoids circular import with presets.ts) */
const gtoDefaultParams: BehavioralParams = {
  continuePct: 27,
  raisePct: 70,
  positionAwareness: 0.9,
  bluffFrequency: 0.3,
  sizings: [{ action: "raise", sizingPct: 250, weight: 0.6 }, { action: "raise", sizingPct: 300, weight: 0.3 }],
  explanation: "GTO baseline — adapts to opponent patterns via session memory.",
};

const exploiterSituations: Record<SituationKey, BehavioralParams> = {} as Record<SituationKey, BehavioralParams>;
for (const key of ALL_SITUATION_KEYS) {
  exploiterSituations[key] = { ...gtoDefaultParams };
}

/**
 * The exploiter profile — static identity, dynamic modifiers.
 *
 * The engine reads modifiers via getModifierMap("exploiter") which returns
 * whatever was last registered by updateExploiterModifiers().
 */
export const EXPLOITER_PROFILE: OpponentProfile = {
  id: "exploiter",
  name: "EXP (Adaptive Exploiter)",
  engineId: "modified-gto",
  description:
    "GTO baseline + adapts to opponent patterns using session memory. Starts balanced, shifts toward optimal counter-strategy as data accumulates.",
  situations: exploiterSituations,
};
