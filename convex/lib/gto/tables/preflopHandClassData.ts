/**
 * Preflop Hand Class Data — DEPRECATED.
 *
 * The preflop system now uses range classifications (preflopClassification.ts)
 * instead of frequency lookup tables. This file previously loaded
 * complete_preflop_tables.json into a registry. That data is no longer
 * the source of truth — the range Sets in preflopRanges.ts are.
 *
 * This file is kept as a no-op to avoid breaking side-effect import chains.
 */

// No-op: preflop data now comes from classification, not JSON tables.
