/**
 * Knowledge Base — Public API
 *
 * Import this module to access all knowledge entries.
 * Side-effect imports register entries into the registry.
 */

// Register all content (side effects)
import "./profiles";
import "./drillGuide";
import "./terms";

// Re-export API
export { getKnowledge, requireKnowledge, getByCategory, getKnowledgeMany, hasKnowledge } from "./registry";
export type { KnowledgeEntry, KnowledgeCategory, KnowledgeSection } from "./types";
