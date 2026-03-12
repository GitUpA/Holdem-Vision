/**
 * Hand audit types — pure TypeScript, zero Convex imports.
 *
 * These types define the shape of a hand's audit record.
 * Currently used for in-memory JSON export; later promoted
 * to a Convex table (JSON-stringified as a single document).
 */
import type { CardIndex, Street, Position } from "../types/cards";
import type { ActionType, CardVisibility } from "../state/game-state";
import type { SituationKey } from "../types/opponents";

// ═══════════════════════════════════════════════════════
// HAND RECORD — one per completed hand
// ═══════════════════════════════════════════════════════

export interface HandRecord {
  /** Unique identifier: `hand-${handNumber}-${timestamp}` */
  handId: string;
  /** When the hand started (Date.now()) */
  startedAt: number;
  /** When the hand completed */
  completedAt?: number;

  /** Table configuration snapshot */
  config: HandConfig;
  /** Per-seat metadata at hand start */
  seatSetup: SeatSetupEntry[];
  /** Final community cards */
  communityCards: CardIndex[];
  /** Chronological event log — the core audit trail */
  events: HandEvent[];
  /** Final outcome (winners, stacks) */
  outcome?: HandOutcome;
  /** Board state snapshot at each street transition */
  streetSnapshots?: StreetSnapshot[];
  /** Analysis lens results the user saw (for engine tuning) */
  lensSnapshots?: LensSnapshot[];
}

export interface HandConfig {
  numPlayers: number;
  dealerSeatIndex: number;
  heroSeatIndex: number;
  blinds: { small: number; big: number; ante?: number };
  startingStacks: number[];
}

export interface SeatSetupEntry {
  seatIndex: number;
  position: Position;
  profileId?: string;
  profileName?: string;
  engineId?: string;
  cardVisibility: CardVisibility;
  /** Only populated if cards were revealed/assigned */
  holeCards?: CardIndex[];
}

// ═══════════════════════════════════════════════════════
// HAND EVENT — one per action taken
// ═══════════════════════════════════════════════════════

export interface HandEvent {
  /** Monotonic sequence (matches GameAction.sequence) */
  seq: number;
  /** Who acted */
  seatIndex: number;
  /** Which street */
  street: Street;
  /** The action */
  actionType: ActionType;
  /** Chip amount (bet/raise/call/all_in) */
  amount?: number;
  /** Was this an all-in? */
  isAllIn: boolean;
  /** Pot total AFTER this action — cheap snapshot, avoids full replay */
  potAfter: number;
  /** Engine auto-play, hero manual action, or system (blinds/ante) */
  source: "engine" | "manual" | "system";
  /** Engine reasoning — only for auto-play actions */
  decision?: DecisionSnapshot;
}

// ═══════════════════════════════════════════════════════
// DECISION SNAPSHOT — engine reasoning at time of action
// ═══════════════════════════════════════════════════════

export interface DecisionSnapshot {
  /** Which engine produced this decision */
  engineId: string;
  /** Situation classification */
  situationKey: SituationKey;
  /** Structured reasoning metrics (currently lost in AutoPlayDecision mapping!) */
  reasoning: DecisionReasoning;
  /** Top-level explanation string (what user sees) */
  explanationSummary: string;
  /** Full ExplanationNode tree as JSON string — opt-in verbose mode only */
  explanationTreeJson?: string;
}

/**
 * Structured reasoning data extracted from EngineDecision.reasoning.
 * These fields come from rangeAwareEngine and gtoEngine.
 * basicEngine doesn't populate most of these.
 */
export interface DecisionReasoning {
  handStrength?: number;
  potOdds?: number;
  foldLikelihood?: number;
  spr?: number;
  boardWetness?: number;
  mdf?: number;
  adjustedContinuePct?: number;
  adjustedRaisePct?: number;
  adjustedBluffFrequency?: number;
  isBluff?: boolean;
  drawInfo?: {
    bestDrawType: string;
    totalOuts: number;
    hasFlushDraw: boolean;
    hasStraightDraw: boolean;
    isCombo: boolean;
  };
  position?: string;
}

// ═══════════════════════════════════════════════════════
// STREET SNAPSHOT — board state at each street transition
// ═══════════════════════════════════════════════════════

export interface StreetSnapshot {
  street: Street;
  communityCards: CardIndex[];
  potTotal: number;
  activePlayers: number;
}

// ═══════════════════════════════════════════════════════
// LENS SNAPSHOT — analysis result the user saw
// ═══════════════════════════════════════════════════════

export interface LensSnapshot {
  lensId: string;
  street: Street;
  explanationSummary: string;
  explanationTreeJson?: string;
  sentiment?: string;
  tags?: string[];
}

// ═══════════════════════════════════════════════════════
// HAND OUTCOME — final state
// ═══════════════════════════════════════════════════════

export interface HandOutcome {
  /** Winner(s) and amounts won */
  winners: Array<{ seatIndex: number; amount: number }>;
  /** Final stack for each seat */
  finalStacks: number[];
}

// ═══════════════════════════════════════════════════════
// EXPORT ENVELOPE — wraps multiple hands for file export
// ═══════════════════════════════════════════════════════

export interface HandHistoryExport {
  version: "1.0";
  exportedAt: number;
  hands: HandRecord[];
}
