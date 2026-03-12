/**
 * Replay types — data model for hand replay timeline.
 *
 * Pure TypeScript, zero Convex imports.
 */
import type { GameState } from "../state/game-state";
import type { Street } from "../types/cards";
import type {
  HandEvent,
  DecisionSnapshot,
  HandOutcome,
  HandConfig,
  SeatSetupEntry,
} from "../audit/types";

/**
 * A single point in the replay timeline.
 * Each snapshot captures the full GameState after an event is applied.
 */
export interface ReplaySnapshot {
  /** Position in timeline (0 = initial state after blinds) */
  index: number;
  /** Full GameState at this point */
  gameState: GameState;
  /** The event that produced this snapshot (null for index 0) */
  event: HandEvent | null;
  /** Engine decision if this was an auto-play action */
  decision: DecisionSnapshot | null;
  /** Current street */
  street: Street;
}

/**
 * Complete replay timeline built from a HandRecord.
 */
export interface ReplayTimeline {
  handId: string;
  config: HandConfig;
  seatSetup: SeatSetupEntry[];
  snapshots: ReplaySnapshot[];
  /** Indices where street changes happen (for jump-to-street) */
  streetMarkers: { street: Street; snapshotIndex: number }[];
  /** Snapshot indices that have engine decisions */
  decisionIndices: number[];
  outcome?: HandOutcome;
}
