/**
 * Solver Data — static imports of all parsed solver frequency tables.
 *
 * Importing this module registers all 8 flop texture archetype tables
 * (193 boards total) into the frequency table registry.
 *
 * These files are the output of `batch_solve.py parse` which aggregates
 * individual board solutions into per-archetype frequency tables with
 * band distributions and accuracy metrics.
 *
 * ~656KB total — acceptable for client-side bundling.
 *
 * Pure TypeScript, zero Convex imports.
 */
import { loadSolverTables } from "./loadSolverTables";
import type { SolverOutputWithBands } from "./types";

// Static JSON imports — bundled at build time
import aceHighDry from "../../../../data/frequency_tables/ace_high_dry_rainbow.json";
import kqHighDry from "../../../../data/frequency_tables/kq_high_dry_rainbow.json";
import midLowDry from "../../../../data/frequency_tables/mid_low_dry_rainbow.json";
import monotone from "../../../../data/frequency_tables/monotone.json";
import pairedBoards from "../../../../data/frequency_tables/paired_boards.json";
import rainbowConnected from "../../../../data/frequency_tables/rainbow_connected.json";
import twoToneConnected from "../../../../data/frequency_tables/two_tone_connected.json";
import twoToneDisconnected from "../../../../data/frequency_tables/two_tone_disconnected.json";

const ALL_SOLVER_DATA: SolverOutputWithBands[] = [
  aceHighDry as unknown as SolverOutputWithBands,
  kqHighDry as unknown as SolverOutputWithBands,
  midLowDry as unknown as SolverOutputWithBands,
  monotone as unknown as SolverOutputWithBands,
  pairedBoards as unknown as SolverOutputWithBands,
  rainbowConnected as unknown as SolverOutputWithBands,
  twoToneConnected as unknown as SolverOutputWithBands,
  twoToneDisconnected as unknown as SolverOutputWithBands,
];

// Register all tables on import
const registered = loadSolverTables(ALL_SOLVER_DATA);

/** IDs of all registered solver archetypes (for verification) */
export const REGISTERED_SOLVER_ARCHETYPES = registered;
