/**
 * Frequency Table Registry — stores and retrieves GTO frequency tables.
 *
 * Tables are registered at module load time (either from solver output
 * or hand-curated preflop data). The lookup engine queries this registry
 * at runtime.
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
  FrequencyBand,
} from "./types";

// ═══════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════

const tables = new Map<ArchetypeId, FrequencyTable>();
const bandData = new Map<ArchetypeId, { ip: PositionFrequencyBands; oop: PositionFrequencyBands }>();
const accuracyData = new Map<ArchetypeId, ArchetypeAccuracy>();

/** Register a frequency table for an archetype */
export function registerTable(table: FrequencyTable): void {
  tables.set(table.archetypeId, table);
}

/** Register frequency band data for an archetype (from solver output with distributions) */
export function registerBands(
  archetypeId: ArchetypeId,
  ipBands: PositionFrequencyBands,
  oopBands: PositionFrequencyBands,
  accuracy: ArchetypeAccuracy,
): void {
  bandData.set(archetypeId, { ip: ipBands, oop: oopBands });
  accuracyData.set(archetypeId, accuracy);
}

/** Get accuracy metrics for an archetype, if available */
export function getAccuracy(archetypeId: ArchetypeId): ArchetypeAccuracy | undefined {
  return accuracyData.get(archetypeId);
}

/** Get the frequency table for an archetype, or undefined */
export function getTable(archetypeId: ArchetypeId): FrequencyTable | undefined {
  return tables.get(archetypeId);
}

/** Check if a table is registered for an archetype */
export function hasTable(archetypeId: ArchetypeId): boolean {
  return tables.has(archetypeId);
}

/** Get all registered archetype IDs */
export function registeredArchetypes(): ArchetypeId[] {
  return [...tables.keys()];
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
): FrequencyLookup | null {
  const table = tables.get(archetypeId);
  if (!table) return null;

  const posFreqs = isInPosition ? table.ipFrequencies : table.oopFrequencies;
  const actions = isInPosition ? table.actionsIp : table.actionsOop;

  // Get band data if available
  const bands = bandData.get(archetypeId);
  const posBands = bands ? (isInPosition ? bands.ip : bands.oop) : undefined;
  const accuracy = accuracyData.get(archetypeId);

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
): PositionFrequencies | null {
  const table = tables.get(archetypeId);
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
