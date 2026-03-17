/**
 * Knowledge Base — Registry & lookup API
 *
 * Central registry for all knowledge entries. Components call getKnowledge(id)
 * and decide which tier (short/medium/full) to render.
 */

import type { KnowledgeEntry, KnowledgeCategory } from "./types";

// ── Registry ──

const registry = new Map<string, KnowledgeEntry>();

/** Register one or more knowledge entries */
export function registerKnowledge(...entries: KnowledgeEntry[]): void {
  for (const entry of entries) {
    registry.set(entry.id, entry);
  }
}

// ── Lookup API ──

/** Get a single entry by ID. Returns undefined if not found. */
export function getKnowledge(id: string): KnowledgeEntry | undefined {
  return registry.get(id);
}

/** Get a single entry, throw if missing (for required content). */
export function requireKnowledge(id: string): KnowledgeEntry {
  const entry = registry.get(id);
  if (!entry) {
    throw new Error(`Knowledge entry not found: "${id}"`);
  }
  return entry;
}

/** Get all entries in a category */
export function getByCategory(category: KnowledgeCategory): KnowledgeEntry[] {
  return Array.from(registry.values()).filter((e) => e.category === category);
}

/** Get multiple entries by IDs (filters out missing) */
export function getKnowledgeMany(ids: string[]): KnowledgeEntry[] {
  return ids.map((id) => registry.get(id)).filter((e): e is KnowledgeEntry => e !== undefined);
}

/** Check if an entry exists */
export function hasKnowledge(id: string): boolean {
  return registry.has(id);
}
