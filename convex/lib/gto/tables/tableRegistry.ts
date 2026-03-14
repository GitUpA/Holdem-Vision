/**
 * Frequency Table Registry — stores and retrieves GTO frequency tables.
 *
 * Tables are registered at module load time (either from solver output
 * or hand-curated preflop data). The lookup engine queries this registry
 * at runtime.
 *
 * Uses composite keys ("street:archetypeId") internally so flop, turn,
 * and river tables with the same archetypeId don't collide.
 *
 * Pure TypeScript, zero Convex imports.
 */
import type { ArchetypeId } from "../archetypeClassifier";
import type { HandCategory } from "../handCategorizer";
import type {
  FrequencyTable,
  PositionFrequencies,
  ActionFrequencies,
  GtoAction,
  PositionFrequencyBands,
  ActionFrequencyBands,
  ArchetypeAccuracy,
} from "./types";

// ═══════════════════════════════════════════════════════
// COMPOSITE KEY
// ═══════════════════════════════════════════════════════

type Street = "preflop" | "flop" | "turn" | "river";

/** Internal composite key: "flop:ace_high_dry_rainbow" */
function makeKey(archetypeId: ArchetypeId, street: Street): string {
  return `${street}:${archetypeId}`;
}

/** Derive the street to use as key from a FrequencyTable */
function streetFromTable(table: FrequencyTable): Street {
  return table.context.street;
}

// ═══════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════

const tables = new Map<string, FrequencyTable>();
const bandData = new Map<string, { ip: PositionFrequencyBands; oop: PositionFrequencyBands }>();
const accuracyData = new Map<string, ArchetypeAccuracy>();

/** Register a frequency table for an archetype. Street is derived from table.context.street. */
export function registerTable(table: FrequencyTable): void {
  const key = makeKey(table.archetypeId, streetFromTable(table));
  tables.set(key, table);
}

/** Register frequency band data for an archetype (from solver output with distributions) */
export function registerBands(
  archetypeId: ArchetypeId,
  ipBands: PositionFrequencyBands,
  oopBands: PositionFrequencyBands,
  accuracy: ArchetypeAccuracy,
  street: Street = "flop",
): void {
  const key = makeKey(archetypeId, street);
  bandData.set(key, { ip: ipBands, oop: oopBands });
  accuracyData.set(key, accuracy);
}

/** Get accuracy metrics for an archetype, if available */
export function getAccuracy(archetypeId: ArchetypeId, street: Street = "flop"): ArchetypeAccuracy | undefined {
  return accuracyData.get(makeKey(archetypeId, street));
}

/** Get the frequency table for an archetype, or undefined */
export function getTable(archetypeId: ArchetypeId, street: Street = "flop"): FrequencyTable | undefined {
  return tables.get(makeKey(archetypeId, street));
}

/** Check if a table is registered for an archetype */
export function hasTable(archetypeId: ArchetypeId, street: Street = "flop"): boolean {
  return tables.has(makeKey(archetypeId, street));
}

/** Check if ANY texture table exists for a given street */
export function hasAnyTableForStreet(street: Street): boolean {
  const prefix = `${street}:`;
  for (const key of tables.keys()) {
    if (key.startsWith(prefix)) return true;
  }
  return false;
}

/** Get all registered archetype IDs (may contain duplicates across streets) */
export function registeredArchetypes(): ArchetypeId[] {
  return [...tables.values()].map(t => t.archetypeId);
}

/** Get count of registered tables */
export function tableCount(): number {
  return tables.size;
}

/** Clear all tables (for testing) */
export function clearTables(): void {
  tables.clear();
  bandData.clear();
  accuracyData.clear();
}

// ═══════════════════════════════════════════════════════
// LOOKUPS
// ═══════════════════════════════════════════════════════

export interface FrequencyLookup {
  frequencies: ActionFrequencies;
  actions: GtoAction[];
  handCategory: HandCategory;
  archetypeId: ArchetypeId;
  isExact: boolean; // true if exact category match, false if fallback
  /** Frequency bands (if solver distributions available) */
  bands?: ActionFrequencyBands;
  /** Archetype-level accuracy (if available) */
  archetypeAccuracy?: ArchetypeAccuracy;
}

/**
 * Look up action frequencies for a specific archetype + hand category + position.
 *
 * If the exact hand category isn't in the table, falls back to the closest
 * category by strength.
 */
export function lookupFrequencies(
  archetypeId: ArchetypeId,
  handCategory: HandCategory,
  isInPosition: boolean,
  street: Street = "flop",
): FrequencyLookup | null {
  const key = makeKey(archetypeId, street);
  const table = tables.get(key);
  if (!table) return null;

  const posFreqs = isInPosition ? table.ipFrequencies : table.oopFrequencies;
  const actions = isInPosition ? table.actionsIp : table.actionsOop;

  // Get band data if available
  const bands = bandData.get(key);
  const posBands = bands ? (isInPosition ? bands.ip : bands.oop) : undefined;
  const accuracy = accuracyData.get(key);

  // Try exact match first
  const exact = posFreqs[handCategory];
  if (exact) {
    return {
      frequencies: exact,
      actions,
      handCategory,
      archetypeId,
      isExact: true,
      bands: posBands?.[handCategory],
      archetypeAccuracy: accuracy,
    };
  }

  // Fall back to closest category
  const available = Object.keys(posFreqs) as HandCategory[];
  if (available.length === 0) return null;

  const closest = findClosestCategory(handCategory, available);
  return {
    frequencies: posFreqs[closest]!,
    actions,
    handCategory: closest,
    archetypeId,
    isExact: false,
    bands: posBands?.[closest],
    archetypeAccuracy: accuracy,
  };
}

/**
 * Get the full position frequencies for an archetype + position.
 */
export function getPositionFrequencies(
  archetypeId: ArchetypeId,
  isInPosition: boolean,
  street: Street = "flop",
): PositionFrequencies | null {
  const table = tables.get(makeKey(archetypeId, street));
  if (!table) return null;
  return isInPosition ? table.ipFrequencies : table.oopFrequencies;
}

// ═══════════════════════════════════════════════════════
// CATEGORY STRENGTH MAP (for fallback matching)
// ═══════════════════════════════════════════════════════

const CATEGORY_STRENGTH: Record<HandCategory, number> = {
  sets_plus: 1.0,
  two_pair: 0.85,
  premium_pair: 0.82,
  overpair: 0.78,
  top_pair_top_kicker: 0.7,
  top_pair_weak_kicker: 0.6,
  middle_pair: 0.45,
  bottom_pair: 0.35,
  combo_draw: 0.5,
  flush_draw: 0.4,
  straight_draw: 0.33,
  overcards: 0.25,
  weak_draw: 0.15,
  air: 0.05,
};

function findClosestCategory(
  target: HandCategory,
  available: HandCategory[],
): HandCategory {
  const targetStrength = CATEGORY_STRENGTH[target];
  let best = available[0];
  let bestDist = Math.abs(CATEGORY_STRENGTH[best] - targetStrength);
  for (const cat of available) {
    const dist = Math.abs(CATEGORY_STRENGTH[cat] - targetStrength);
    if (dist < bestDist) {
      best = cat;
      bestDist = dist;
    }
  }
  return best;
}
