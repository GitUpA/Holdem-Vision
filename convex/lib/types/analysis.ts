/**
 * Core analysis system type contracts.
 * Every feature in HoldemVision flows through these abstractions.
 */
import type { CardIndex, Street, Position } from "./cards";
import type { OpponentContext } from "./opponents";
import type { VisualDirective, CardHighlight, RangeHighlight } from "./visuals";
import type { GameState } from "../state/gameState";

// ═══════════════════════════════════════════════════════
// ANALYSIS CONTEXT — the standardized input to everything
// ═══════════════════════════════════════════════════════

export interface AnalysisContext {
  heroCards: CardIndex[];
  communityCards: CardIndex[];
  deadCards: CardIndex[];
  street: Street;

  position?: Position;
  numPlayers?: number;
  heroSeatIndex?: number;
  dealerSeatIndex?: number;

  opponents: OpponentContext[];

  gameContext?: GameContext;

  /** Full game state reference for engine-based lenses (e.g., coaching). Optional. */
  gameState?: GameState;
}

export interface GameContext {
  pot: number;
  stackSizes: Map<number, number>;
  blinds: { small: number; big: number };
  ante?: number;
  tournamentContext?: {
    payoutStructure: number[];
    remainingPlayers: number;
    averageStack: number;
  };
}

// ═══════════════════════════════════════════════════════
// ANALYSIS RESULT — the standardized output of everything
// ═══════════════════════════════════════════════════════

export interface AnalysisResult<T = unknown> {
  value: T;
  context: AnalysisContext;
  explanation: ExplanationNode;
  visuals: VisualDirective[];
  lensId: string;
  dependencies: string[];
}

// ═══════════════════════════════════════════════════════
// EXPLANATION NODE — the recursive reasoning tree
// ═══════════════════════════════════════════════════════

export interface ExplanationNode {
  summary: string;
  detail?: string;
  sentiment?: "positive" | "negative" | "neutral" | "warning";

  children?: ExplanationNode[];

  highlights?: CardHighlight[];
  rangeHighlights?: RangeHighlight[];

  comparisons?: {
    label: string;
    result: ExplanationNode;
  }[];

  tags?: string[];
}

// ═══════════════════════════════════════════════════════
// ANALYSIS LENS — the pluggable computation interface
// ═══════════════════════════════════════════════════════

export interface AnalysisLens {
  id: string;
  name: string;
  description: string;
  /** If true, lens runs asynchronously (deferred) so it doesn't block the UI. */
  heavy?: boolean;
  analyze(context: AnalysisContext): AnalysisResult;
}
