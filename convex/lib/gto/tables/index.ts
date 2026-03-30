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
  hasAnyTableForStreet,
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
  TURN_ARCHETYPE_METADATA,
  RIVER_ARCHETYPE_METADATA,
  RFI_OPENING,
  BB_DEFENSE,
  THREE_BET_POTS,
  BLIND_VS_BLIND,
  FOUR_BET_FIVE_BET,
} from "./preflopTables";

// ═══════════════════════════════════════════════════════
// AUTO-REGISTER ALL TABLES
// ═══════════════════════════════════════════════════════

import { registerTable } from "./tableRegistry";
import { ALL_PREFLOP_TABLES } from "./preflopTables";

// Preflop tables (hand-curated)
for (const table of ALL_PREFLOP_TABLES) {
  registerTable(table);
}

// Solver-derived flop texture tables (193 boards, 8 archetypes)
import "./solverData";

// preflopHandClassData: deprecated no-op (preflop now uses preflopClassification.ts)

// Postflop per-hand-class tables (PokerBench 500k solver-optimal decisions)
import "./postflopHandClassData";

// Facing-bet solver tables (8 flop archetypes, fold/call/raise when facing a bet)
// Auto-registered at import time via facingBetTables.ts
import "./facingBetTables";

export {
  lookupFacingBetFrequencies,
  hasFacingBetData,
  facingBetToActionFrequencies,
  type FacingBetFrequencies,
} from "./facingBetTables";

export {
  type PreflopConfidence,
  type ConfidenceLevel,
} from "./preflopHandClass";

export {
  lookupPostflopHandClass,
  hasPostflopHandClassData,
  postflopHandClassToActionFrequencies,
  type PostflopHandClassFrequency,
  type PostflopHandClassTable,
} from "./postflopHandClass";
