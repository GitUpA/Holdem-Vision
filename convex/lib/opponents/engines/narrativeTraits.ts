/**
 * Narrative Trait Derivation — personality from numbers.
 *
 * Reads modifier parameters and derives personality traits.
 * This is the composability mechanism: ANY set of modifier values
 * automatically produces coherent traits, which then produce
 * coherent narratives. No per-profile hardcoding.
 *
 * Pure TypeScript, zero Convex imports.
 */
import type {
  NarrativeTrait,
  NarrativeProfile,
  TraitId,
  TraitSource,
} from "./narrativeTypes";
import type {
  SituationModifier,
  ProfileModifierMap,
} from "./modifiedGtoTypes";

// ═══════════════════════════════════════════════════════
// TRAIT DERIVATION — modifier values → personality traits
// ═══════════════════════════════════════════════════════

interface TraitRule {
  id: TraitId;
  label: string;
  /** Extract trait strength from a SituationModifier. Returns 0 if trait doesn't apply. */
  extract: (sm: SituationModifier) => { strength: number; source: TraitSource } | null;
}

const TRAIT_RULES: TraitRule[] = [
  // ── Fold behavior ──
  {
    id: "cautious",
    label: "Cautious",
    extract: (sm) =>
      sm.base.foldScale > 1.2
        ? { strength: Math.min((sm.base.foldScale - 1.0) / 2.0, 1.0), source: { type: "fold", foldScale: sm.base.foldScale } }
        : null,
  },
  {
    id: "sticky",
    label: "Sticky",
    extract: (sm) =>
      sm.base.foldScale < 0.7
        ? { strength: Math.min((1.0 - sm.base.foldScale) / 0.7, 1.0), source: { type: "fold", foldScale: sm.base.foldScale } }
        : null,
  },

  // ── Aggression ──
  {
    id: "aggressive",
    label: "Aggressive",
    extract: (sm) =>
      sm.base.aggressionScale > 1.15
        ? { strength: Math.min((sm.base.aggressionScale - 1.0) / 1.0, 1.0), source: { type: "aggression", aggressionScale: sm.base.aggressionScale } }
        : null,
  },
  {
    id: "passive",
    label: "Passive",
    extract: (sm) =>
      sm.base.aggressionScale < 0.6
        ? { strength: Math.min((1.0 - sm.base.aggressionScale) / 0.8, 1.0), source: { type: "aggression", aggressionScale: sm.base.aggressionScale } }
        : null,
  },

  // ── Raise vs call preference ──
  {
    id: "raise-happy",
    label: "Raise-oriented",
    extract: (sm) =>
      sm.base.raiseVsCallBias > 0.1
        ? { strength: Math.min(sm.base.raiseVsCallBias, 1.0), source: { type: "callBias", raiseVsCallBias: sm.base.raiseVsCallBias } }
        : null,
  },
  {
    id: "call-heavy",
    label: "Call-oriented",
    extract: (sm) =>
      sm.base.raiseVsCallBias < -0.25
        ? { strength: Math.min(Math.abs(sm.base.raiseVsCallBias), 1.0), source: { type: "callBias", raiseVsCallBias: sm.base.raiseVsCallBias } }
        : null,
  },

  // ── Sizing ──
  {
    id: "big-bettor",
    label: "Big bettor",
    extract: (sm) =>
      sm.base.sizingBias > 0.1
        ? { strength: Math.min(sm.base.sizingBias, 1.0), source: { type: "sizing", sizingBias: sm.base.sizingBias } }
        : null,
  },
  {
    id: "small-bettor",
    label: "Small bettor",
    extract: (sm) =>
      sm.base.sizingBias < -0.1
        ? { strength: Math.min(Math.abs(sm.base.sizingBias), 1.0), source: { type: "sizing", sizingBias: sm.base.sizingBias } }
        : null,
  },

  // ── Context sensitivities ──
  {
    id: "hand-reader",
    label: "Hand-strength aware",
    extract: (sm) =>
      sm.context.handStrengthSensitivity > 0.45
        ? { strength: sm.context.handStrengthSensitivity, source: { type: "sensitivity", factor: "handStrength", value: sm.context.handStrengthSensitivity } }
        : null,
  },
  {
    id: "price-sensitive",
    label: "Price-conscious",
    extract: (sm) =>
      sm.context.potOddsSensitivity > 0.25
        ? { strength: sm.context.potOddsSensitivity, source: { type: "sensitivity", factor: "potOdds", value: sm.context.potOddsSensitivity } }
        : null,
  },
  {
    id: "positional",
    label: "Position-exploiter",
    extract: (sm) =>
      sm.context.positionSensitivity > 0.4
        ? { strength: sm.context.positionSensitivity, source: { type: "sensitivity", factor: "position", value: sm.context.positionSensitivity } }
        : null,
  },
  {
    id: "fold-equity-exploiter",
    label: "Pressure-seeker",
    extract: (sm) =>
      sm.context.foldEquitySensitivity > 0.4
        ? { strength: sm.context.foldEquitySensitivity, source: { type: "sensitivity", factor: "foldEquity", value: sm.context.foldEquitySensitivity } }
        : null,
  },
  {
    id: "draw-chaser",
    label: "Draw-conscious",
    extract: (sm) =>
      sm.context.drawSensitivity > 0.3
        ? { strength: sm.context.drawSensitivity, source: { type: "sensitivity", factor: "draw", value: sm.context.drawSensitivity } }
        : null,
  },
  {
    id: "texture-reader",
    label: "Board-texture aware",
    extract: (sm) =>
      sm.context.textureSensitivity > 0.35
        ? { strength: sm.context.textureSensitivity, source: { type: "sensitivity", factor: "texture", value: sm.context.textureSensitivity } }
        : null,
  },
  {
    id: "spr-aware",
    label: "Stack-depth aware",
    extract: (sm) =>
      sm.context.sprSensitivity > 0.35
        ? { strength: sm.context.sprSensitivity, source: { type: "sensitivity", factor: "spr", value: sm.context.sprSensitivity } }
        : null,
  },

  // ── Intensity (meta-trait) ──
  {
    id: "balanced",
    label: "Balanced",
    extract: (sm) =>
      sm.base.intensity < 0.15
        ? { strength: 1.0 - sm.base.intensity, source: { type: "intensity", intensity: sm.base.intensity } }
        : null,
  },
  {
    id: "extreme",
    label: "Heavily deviating",
    extract: (sm) =>
      sm.base.intensity > 0.8
        ? { strength: sm.base.intensity, source: { type: "intensity", intensity: sm.base.intensity } }
        : null,
  },
];

/**
 * Derive personality traits from a single SituationModifier.
 * Returns traits sorted by strength descending.
 */
export function deriveTraitsFromModifier(sm: SituationModifier): NarrativeTrait[] {
  const traits: NarrativeTrait[] = [];

  for (const rule of TRAIT_RULES) {
    const result = rule.extract(sm);
    if (result && result.strength > 0) {
      traits.push({
        id: rule.id,
        label: rule.label,
        strength: result.strength,
        source: result.source,
      });
    }
  }

  return traits.sort((a, b) => b.strength - a.strength);
}

/**
 * Derive aggregate traits from a full ProfileModifierMap.
 * Averages trait strengths across all 11 situations, weighted by intensity.
 */
export function deriveTraits(modifierMap: ProfileModifierMap): NarrativeTrait[] {
  // Accumulate trait strengths across all situations
  const traitAccum = new Map<TraitId, { totalStrength: number; count: number; source: TraitSource }>();

  const keys = Object.keys(modifierMap) as Array<keyof ProfileModifierMap>;
  for (const key of keys) {
    const sm = modifierMap[key];
    const traits = deriveTraitsFromModifier(sm);
    for (const trait of traits) {
      const existing = traitAccum.get(trait.id);
      if (existing) {
        existing.totalStrength += trait.strength;
        existing.count += 1;
      } else {
        traitAccum.set(trait.id, { totalStrength: trait.strength, count: 1, source: trait.source });
      }
    }
  }

  // Only include traits that appear in at least 3 situations (consistent character)
  const MIN_SITUATIONS = 3;
  const result: NarrativeTrait[] = [];

  for (const [id, accum] of traitAccum) {
    if (accum.count >= MIN_SITUATIONS) {
      const rule = TRAIT_RULES.find((r) => r.id === id);
      result.push({
        id,
        label: rule?.label ?? id,
        strength: accum.totalStrength / accum.count,
        source: accum.source,
      });
    }
  }

  return result.sort((a, b) => b.strength - a.strength);
}

// ═══════════════════════════════════════════════════════
// CHARACTER LABEL — emergent from dominant traits
// ═══════════════════════════════════════════════════════

/** Dominant trait pair → character archetype label. */
const CHARACTER_LABELS: Array<{
  match: (traits: NarrativeTrait[]) => boolean;
  label: string;
  summary: string;
}> = [
  {
    match: (t) => has(t, "balanced"),
    label: "The Theorist",
    summary: "Plays close to game-theory optimal. Hard to exploit but doesn't exploit others.",
  },
  {
    match: (t) => has(t, "cautious") && has(t, "passive"),
    label: "The Rock",
    summary: "Ultra-tight and risk-averse. Only plays premium hands and rarely bluffs.",
  },
  {
    match: (t) => has(t, "cautious") && has(t, "aggressive"),
    label: "The Selective Shark",
    summary: "Picks spots carefully but attacks with force when they do play.",
  },
  {
    match: (t) => has(t, "sticky") && has(t, "passive"),
    label: "The Calling Station",
    summary: "Calls too much and rarely raises. Hard to bluff, easy to value bet against.",
  },
  {
    match: (t) => has(t, "sticky") && has(t, "aggressive"),
    label: "The Loose Cannon",
    summary: "Plays too many hands and plays them aggressively. Unpredictable and high-variance.",
  },
  {
    match: (t) => has(t, "aggressive") && has(t, "positional"),
    label: "The Positional Predator",
    summary: "Uses position to apply relentless pressure. Dangerous when acting last.",
  },
  {
    match: (t) => has(t, "cautious") && has(t, "hand-reader"),
    label: "The Calculator",
    summary: "Makes tight, mathematically-driven decisions. Adjusts well to hand strength.",
  },
  {
    match: (t) => has(t, "aggressive") && has(t, "fold-equity-exploiter"),
    label: "The Bully",
    summary: "Constantly pressures opponents who fold too much. Relentless aggression.",
  },
  {
    match: (t) => has(t, "sticky") && has(t, "call-heavy"),
    label: "The Station",
    summary: "Almost never folds or raises. Calls everything and waits to hit.",
  },
  {
    match: (t) => has(t, "cautious"),
    label: "The Tight Player",
    summary: "Plays fewer hands than average. When they bet, they usually have it.",
  },
  {
    match: (t) => has(t, "aggressive"),
    label: "The Aggressor",
    summary: "Prefers betting and raising over checking and calling.",
  },
  {
    match: (t) => has(t, "sticky"),
    label: "The Loose Player",
    summary: "Plays more hands than average. Hard to push out of pots.",
  },
  {
    match: (t) => has(t, "passive"),
    label: "The Passive Player",
    summary: "Prefers checking and calling over betting and raising.",
  },
];

function has(traits: NarrativeTrait[], id: TraitId): boolean {
  return traits.some((t) => t.id === id && t.strength > 0.3);
}

/**
 * Synthesize a character label from dominant traits.
 * Returns the first matching archetype, or a generic label.
 */
export function synthesizeCharacter(traits: NarrativeTrait[]): { label: string; summary: string } {
  for (const entry of CHARACTER_LABELS) {
    if (entry.match(traits)) {
      return { label: entry.label, summary: entry.summary };
    }
  }

  // Fallback: describe the top trait
  if (traits.length > 0) {
    return {
      label: `The ${traits[0].label} Player`,
      summary: `Primarily characterized by ${traits[0].label.toLowerCase()} tendencies.`,
    };
  }

  return { label: "The Unknown", summary: "No strong tendencies detected." };
}

// ═══════════════════════════════════════════════════════
// NARRATIVE PROFILE — full personality fingerprint
// ═══════════════════════════════════════════════════════

/**
 * Derive a full NarrativeProfile from a ProfileModifierMap.
 * This is the entry point for the trait system.
 */
export function deriveNarrativeProfile(
  profileId: string,
  modifierMap: ProfileModifierMap,
): NarrativeProfile {
  const traits = deriveTraits(modifierMap);
  const character = synthesizeCharacter(traits);

  return {
    profileId,
    traits,
    characterLabel: character.label,
    characterSummary: character.summary,
  };
}

// ═══════════════════════════════════════════════════════
// CACHING — profile → NarrativeProfile, computed once
// ═══════════════════════════════════════════════════════

const narrativeProfileCache = new Map<string, NarrativeProfile>();

/**
 * Get or compute the NarrativeProfile for a profile ID.
 * Cached since modifiers are static per profile.
 */
export function getNarrativeProfile(
  profileId: string,
  getModifierMap: (id: string) => ProfileModifierMap | undefined,
): NarrativeProfile | undefined {
  const cached = narrativeProfileCache.get(profileId);
  if (cached) return cached;

  const modifierMap = getModifierMap(profileId);
  if (!modifierMap) return undefined;

  const profile = deriveNarrativeProfile(profileId, modifierMap);
  narrativeProfileCache.set(profileId, profile);
  return profile;
}

/** Clear cached narrative profile (call when modifier map changes). */
export function clearNarrativeProfileCache(profileId?: string): void {
  if (profileId) {
    narrativeProfileCache.delete(profileId);
  } else {
    narrativeProfileCache.clear();
  }
}
