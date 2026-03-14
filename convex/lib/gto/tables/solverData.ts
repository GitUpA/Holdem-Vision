/**
 * Solver Data — static imports of all parsed solver frequency tables.
 *
 * Importing this module registers all 24 texture archetype tables
 * (8 flop × 193 boards + 8 turn × 12 boards + 8 river × 12 boards)
 * into the frequency table registry.
 *
 * These files are the output of `batch_solve.py parse` and
 * `batch_turn_river.py parse` which aggregate individual board solutions
 * into per-archetype frequency tables with band distributions and
 * accuracy metrics.
 *
 * ~1.9MB total — acceptable for client-side bundling.
 *
 * Pure TypeScript, zero Convex imports.
 */
import { loadSolverTables } from "./loadSolverTables";
import type { SolverOutputWithBands } from "./types";

// ═══════════════════════════════════════════════════════
// FLOP — 8 archetypes, 193 boards
// ═══════════════════════════════════════════════════════

import aceHighDry from "../../../../data/frequency_tables/ace_high_dry_rainbow.json";
import kqHighDry from "../../../../data/frequency_tables/kq_high_dry_rainbow.json";
import midLowDry from "../../../../data/frequency_tables/mid_low_dry_rainbow.json";
import monotone from "../../../../data/frequency_tables/monotone.json";
import pairedBoards from "../../../../data/frequency_tables/paired_boards.json";
import rainbowConnected from "../../../../data/frequency_tables/rainbow_connected.json";
import twoToneConnected from "../../../../data/frequency_tables/two_tone_connected.json";
import twoToneDisconnected from "../../../../data/frequency_tables/two_tone_disconnected.json";

// ═══════════════════════════════════════════════════════
// TURN — 8 archetypes, ~12 boards each
// ═══════════════════════════════════════════════════════

import turnAceHighDry from "../../../../data/frequency_tables/turn_ace_high_dry_rainbow.json";
import turnKqHighDry from "../../../../data/frequency_tables/turn_kq_high_dry_rainbow.json";
import turnMidLowDry from "../../../../data/frequency_tables/turn_mid_low_dry_rainbow.json";
import turnMonotone from "../../../../data/frequency_tables/turn_monotone.json";
import turnPairedBoards from "../../../../data/frequency_tables/turn_paired_boards.json";
import turnRainbowConnected from "../../../../data/frequency_tables/turn_rainbow_connected.json";
import turnTwoToneConnected from "../../../../data/frequency_tables/turn_two_tone_connected.json";
import turnTwoToneDisconnected from "../../../../data/frequency_tables/turn_two_tone_disconnected.json";

// ═══════════════════════════════════════════════════════
// RIVER — 8 archetypes, ~12 boards each
// ═══════════════════════════════════════════════════════

import riverAceHighDry from "../../../../data/frequency_tables/river_ace_high_dry_rainbow.json";
import riverKqHighDry from "../../../../data/frequency_tables/river_kq_high_dry_rainbow.json";
import riverMidLowDry from "../../../../data/frequency_tables/river_mid_low_dry_rainbow.json";
import riverMonotone from "../../../../data/frequency_tables/river_monotone.json";
import riverPairedBoards from "../../../../data/frequency_tables/river_paired_boards.json";
import riverRainbowConnected from "../../../../data/frequency_tables/river_rainbow_connected.json";
import riverTwoToneConnected from "../../../../data/frequency_tables/river_two_tone_connected.json";
import riverTwoToneDisconnected from "../../../../data/frequency_tables/river_two_tone_disconnected.json";

const ALL_SOLVER_DATA: SolverOutputWithBands[] = [
  // Flop
  aceHighDry as unknown as SolverOutputWithBands,
  kqHighDry as unknown as SolverOutputWithBands,
  midLowDry as unknown as SolverOutputWithBands,
  monotone as unknown as SolverOutputWithBands,
  pairedBoards as unknown as SolverOutputWithBands,
  rainbowConnected as unknown as SolverOutputWithBands,
  twoToneConnected as unknown as SolverOutputWithBands,
  twoToneDisconnected as unknown as SolverOutputWithBands,
  // Turn
  turnAceHighDry as unknown as SolverOutputWithBands,
  turnKqHighDry as unknown as SolverOutputWithBands,
  turnMidLowDry as unknown as SolverOutputWithBands,
  turnMonotone as unknown as SolverOutputWithBands,
  turnPairedBoards as unknown as SolverOutputWithBands,
  turnRainbowConnected as unknown as SolverOutputWithBands,
  turnTwoToneConnected as unknown as SolverOutputWithBands,
  turnTwoToneDisconnected as unknown as SolverOutputWithBands,
  // River
  riverAceHighDry as unknown as SolverOutputWithBands,
  riverKqHighDry as unknown as SolverOutputWithBands,
  riverMidLowDry as unknown as SolverOutputWithBands,
  riverMonotone as unknown as SolverOutputWithBands,
  riverPairedBoards as unknown as SolverOutputWithBands,
  riverRainbowConnected as unknown as SolverOutputWithBands,
  riverTwoToneConnected as unknown as SolverOutputWithBands,
  riverTwoToneDisconnected as unknown as SolverOutputWithBands,
];

// Register all tables on import
const registered = loadSolverTables(ALL_SOLVER_DATA);

/** IDs of all registered solver archetypes (for verification) */
export const REGISTERED_SOLVER_ARCHETYPES = registered;
