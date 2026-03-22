/**
 * Narrative Arc Tracker — multi-street story coherence.
 *
 * Tracks per-seat, per-street decision summaries so that later-street
 * narratives can reference earlier actions ("bet the flop for value,
 * now checking the turn because the board got scary").
 *
 * Lightweight in-memory accumulator, similar to HandRecorder.
 * Instantiated once per hand, passed through DecisionContext.
 *
 * Pure TypeScript, zero Convex imports.
 */
import type {
  NarrativeArcTracker,
  StreetDecisionSummary,
  StoryArcReference,
} from "./narrativeTypes";
import type { ActionType } from "../../state/game-state";
import type { Street } from "../../types/cards";

// ═══════════════════════════════════════════════════════
// IMPLEMENTATION
// ═══════════════════════════════════════════════════════

/**
 * Create a new NarrativeArcTracker for a hand.
 */
export function createNarrativeArcTracker(): NarrativeArcTracker {
  // Per-seat history: seatIndex → street decisions in order
  const history = new Map<number, StreetDecisionSummary[]>();

  return {
    recordDecision(
      seatIndex: number,
      street: Street,
      action: ActionType,
      intent: StreetDecisionSummary["intent"],
      narrativeSummary: string,
    ): void {
      let seatHistory = history.get(seatIndex);
      if (!seatHistory) {
        seatHistory = [];
        history.set(seatIndex, seatHistory);
      }
      seatHistory.push({ street, action, intent, narrativeSummary });
    },

    getArc(seatIndex: number): StoryArcReference | undefined {
      const seatHistory = history.get(seatIndex);
      if (!seatHistory || seatHistory.length === 0) return undefined;

      return {
        previousActions: [...seatHistory],
        continuityNarrative: "", // Filled by interpreter
      };
    },

    reset(): void {
      history.clear();
    },
  };
}
