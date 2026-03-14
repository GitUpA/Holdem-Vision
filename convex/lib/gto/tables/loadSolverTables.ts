/**
 * Solver Table Loader — imports solver-generated JSON into the frequency table registry.
 *
 * Call loadSolverTables() with the parsed solver JSON data to register
 * frequency tables for any street (flop, turn, river). This is the bridge
 * between the Python solver pipeline and the TypeScript lookup engine.
 *
 * Pure TypeScript, zero Convex imports.
 */
import type { ArchetypeId } from "../archetypeClassifier";
import type { SolverOutput, SolverOutputWithBands } from "./types";
import { solverOutputToTable, solverOutputToTableWithBands } from "./types";
import { registerTable, registerBands } from "./tableRegistry";
import {
  FLOP_ARCHETYPE_METADATA,
  TURN_ARCHETYPE_METADATA,
  RIVER_ARCHETYPE_METADATA,
} from "./preflopTables";

/** All flop texture archetype IDs that the solver produces */
export const FLOP_ARCHETYPE_IDS: ArchetypeId[] = [
  "ace_high_dry_rainbow",
  "kq_high_dry_rainbow",
  "mid_low_dry_rainbow",
  "paired_boards",
  "two_tone_disconnected",
  "two_tone_connected",
  "monotone",
  "rainbow_connected",
];

/** Metadata lookup by street — used to find name/description/keyPrinciple */
const METADATA_BY_STREET: Record<string, Record<string, { name: string; description: string; keyPrinciple: string; commonMistakes: string[] }>> = {
  flop: FLOP_ARCHETYPE_METADATA,
  turn: TURN_ARCHETYPE_METADATA,
  river: RIVER_ARCHETYPE_METADATA,
};

/**
 * Load solver output JSON objects and register them as frequency tables.
 * Automatically detects the street from each table's context.street field.
 *
 * @param solverOutputs - Array of parsed solver JSON objects (from batch_solve.py parse)
 * @returns Array of registered table archetype IDs
 */
export function loadSolverTables(solverOutputs: SolverOutput[]): ArchetypeId[] {
  const registered: ArchetypeId[] = [];

  for (const raw of solverOutputs) {
    // Look up metadata by street, falling back to flop
    const street = raw.context?.street ?? "flop";
    const streetMeta = METADATA_BY_STREET[street] ?? FLOP_ARCHETYPE_METADATA;
    const meta = streetMeta[raw.archetypeId];
    if (!meta) {
      continue; // Skip unknown archetypes
    }

    const typedStreet = street as "flop" | "turn" | "river";

    // Check if this output has band data (per-board distributions)
    const hasBands = "ip_distributions" in raw && "oop_distributions" in raw;
    if (hasBands) {
      const { table, ipBands, oopBands, accuracy } = solverOutputToTableWithBands(
        raw as SolverOutputWithBands,
        meta,
      );
      registerTable(table);
      registerBands(table.archetypeId, ipBands, oopBands, accuracy, typedStreet);
    } else {
      const table = solverOutputToTable(raw, meta);
      registerTable(table);
    }

    registered.push(raw.archetypeId as ArchetypeId);
  }

  return registered;
}

/**
 * Create a hardcoded set of solver tables from inline data.
 * Used when we want to embed the solver results directly in the code
 * rather than loading from files at runtime.
 *
 * This is the function that will be updated once the full batch solve completes.
 * For now it serves the 3 test boards.
 */
export function loadEmbeddedSolverTables(): ArchetypeId[] {
  // These will be populated from solver output after batch completes.
  // For now, return empty — preflop tables are already registered via index.ts.
  return [];
}

/**
 * Validate a solver output JSON has the expected shape.
 */
export function validateSolverOutput(data: unknown): data is SolverOutput {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.archetypeId === "string" &&
    typeof obj.boardsAnalyzed === "number" &&
    typeof obj.ip_frequencies === "object" &&
    typeof obj.oop_frequencies === "object" &&
    Array.isArray(obj.actions_ip) &&
    Array.isArray(obj.actions_oop)
  );
}
