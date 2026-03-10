/**
 * Profile resolver — flattens inheritance chains into fully-populated situation maps.
 *
 * A derived profile stores only its overrides + a baseProfileId.
 * Resolution walks the chain (child → parent → grandparent) and merges
 * situations from root to leaf so overrides win.
 *
 * Pure TypeScript, zero Convex imports.
 */
import type {
  OpponentProfile,
  SituationKey,
  BehavioralParams,
} from "../types/opponents";
import { ALL_SITUATION_KEYS } from "../types/opponents";

/**
 * Resolve a profile by merging it with its base profile chain.
 * Returns a fully-populated situation map (all 11 keys present).
 *
 * @param profile - The profile to resolve
 * @param getBase - Lookup function for base profiles by ID
 * @param maxDepth - Safety limit for inheritance chains (default 5)
 * @throws If any situation key is missing after resolution
 */
export function resolveProfile(
  profile: OpponentProfile,
  getBase: (id: string) => OpponentProfile | undefined,
  maxDepth: number = 5,
): Record<SituationKey, BehavioralParams> {
  // Collect the inheritance chain: [child, parent, grandparent, ...]
  const chain: OpponentProfile[] = [profile];
  let current = profile;
  let depth = 0;

  while (current.baseProfileId && depth < maxDepth) {
    const base = getBase(current.baseProfileId);
    if (!base) break;
    chain.push(base);
    current = base;
    depth++;
  }

  // Merge from root (last) to leaf (first): later overrides earlier
  const resolved: Partial<Record<SituationKey, BehavioralParams>> = {};

  for (let i = chain.length - 1; i >= 0; i--) {
    const situations = chain[i].situations;
    for (const key of ALL_SITUATION_KEYS) {
      if (situations[key]) {
        resolved[key] = situations[key];
      }
    }
  }

  // Validate completeness
  const missing: SituationKey[] = [];
  for (const key of ALL_SITUATION_KEYS) {
    if (!resolved[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Profile "${profile.name}" is missing situation(s) after resolution: ${missing.join(", ")}`,
    );
  }

  return resolved as Record<SituationKey, BehavioralParams>;
}

/**
 * Check whether a profile is fully self-contained (defines all 11 situations).
 * Base/preset profiles should always be complete.
 */
export function isCompleteProfile(profile: OpponentProfile): boolean {
  return ALL_SITUATION_KEYS.every((key) => key in profile.situations);
}
