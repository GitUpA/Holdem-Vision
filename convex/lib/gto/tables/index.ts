/**
 * Frequency Tables — barrel export and auto-registration.
 *
 * Importing this module registers all available frequency tables.
 * Solver-derived flop tables are loaded via loadSolverTables()
 * after the solver batch completes.
 *
 * Pure TypeScript, zero Convex imports.
 */
export type {
  FrequencyTable,
  PositionFrequencies,
  ActionFrequencies,
  GtoAction,
  SolverOutput,
  SolverOutputWithBands,
  FrequencyBand,
  ActionFrequencyBands,
  PositionFrequencyBands,
  ArchetypeAccuracy,
  BoardFeatures,
  ArchetypeCentroid,
} from "./types";
export type { AccuracyImpact, SampleSizeProjection } from "./types";
export {
  solverOutputToTable,
  solverOutputToTableWithBands,
  computeBand,
  computeArchetypeAccuracy,
  buildPositionBands,
  boardToFeatures,
  scoreBoardTypicality,
  estimateBoardAccuracy,
  computeTopActionGap,
  analyzeSampleSize,
  boardsNeededForPrecision,
} from "./types";

export {
  registerTable,
  registerBands,
  getTable,
  hasTable,
  getAccuracy,
  registeredArchetypes,
  tableCount,
  clearTables,
  lookupFrequencies,
  getPositionFrequencies,
  type FrequencyLookup,
} from "./tableRegistry";

export {
  ALL_PREFLOP_TABLES,
  FLOP_ARCHETYPE_METADATA,
  RFI_OPENING,
  BB_DEFENSE,
  THREE_BET_POTS,
  BLIND_VS_BLIND,
  FOUR_BET_FIVE_BET,
} from "./preflopTables";

// ═══════════════════════════════════════════════════════
// AUTO-REGISTER PREFLOP TABLES
// ═══════════════════════════════════════════════════════

import { registerTable } from "./tableRegistry";
import { ALL_PREFLOP_TABLES } from "./preflopTables";

for (const table of ALL_PREFLOP_TABLES) {
  registerTable(table);
}
