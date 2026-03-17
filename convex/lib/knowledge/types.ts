/**
 * Knowledge Base — Type definitions
 *
 * All user-facing educational content is structured through these types.
 * UI components pull content by key — they never own explanatory text.
 */

// ── Categories ──

export type KnowledgeCategory =
  | "term"       // poker vocabulary (equity, pot odds, fold equity…)
  | "concept"    // strategy concepts (GTO, mixed strategy, board texture…)
  | "feature"    // app feature explanations (drill mode, coaching panel…)
  | "archetype"  // board archetype teaching (ace-high dry, monotone…)
  | "profile";   // player type descriptions (NIT, FISH, TAG, LAG, GTO)

// ── Three-tier content ──

export interface KnowledgeEntry {
  /** Unique key for lookup, e.g. "fold_equity", "profile:nit", "feature:drill_mode" */
  id: string;
  category: KnowledgeCategory;
  /** Human-readable name / title */
  name: string;
  /** Tooltip / badge — one line, ~10 words max */
  short: string;
  /** Info bubble / inline — 1-3 sentences */
  medium: string;
  /** Drawer / panel — full teaching narrative, may be multi-paragraph */
  full: string;
  /** Related entry IDs for cross-referencing */
  related?: string[];
  /** Structured sub-content (steps, tips, etc.) for rich UI rendering */
  sections?: KnowledgeSection[];
}

/** Optional structured content within an entry (for tutorials, guides) */
export interface KnowledgeSection {
  id: string;
  title: string;
  description: string;
  steps?: string[];
  tip?: string;
}
