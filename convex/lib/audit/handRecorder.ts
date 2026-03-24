/**
 * HandRecorder — in-memory audit log accumulator.
 *
 * Pure TS class, no React, no Convex. Testable with Vitest.
 * Accumulates events during hand play, exports as JSON at hand end.
 * This JSON shape becomes the Convex table schema later.
 *
 * Usage:
 *   const recorder = new HandRecorder(config, seatSetup);
 *   recorder.recordEvent(action, potAfter, "engine", decision);
 *   recorder.recordEvent(action, potAfter, "manual");
 *   const record = recorder.finalize(gameState);
 *   console.log(recorder.toJSON());
 */
import type { GameAction, GameState } from "../state/gameState";
import type { ExplanationNode } from "../types/analysis";
import type { Street } from "../types/cards";
import type { AnalysisResult } from "../types/analysis";
import type {
  HandRecord,
  HandConfig,
  SeatSetupEntry,
  HandEvent,
  DecisionSnapshot,
  DecisionReasoning,
  HandOutcome,
  StreetSnapshot,
  LensSnapshot,
} from "./types";

// ═══════════════════════════════════════════════════════
// AUTO-PLAY DECISION SUBSET — what we receive from the hook
// ═══════════════════════════════════════════════════════

/** Minimal interface for what we need from AutoPlayDecision */
export interface RecordableDecision {
  engineId?: string;
  situationKey: string;
  explanation: string;
  explanationNode?: ExplanationNode;
  reasoning?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════
// HAND RECORDER
// ═══════════════════════════════════════════════════════

export class HandRecorder {
  private static _idCounter = 0;
  private record: HandRecord;
  private verbose: boolean;
  private finalized = false;

  constructor(
    config: HandConfig,
    seatSetup: SeatSetupEntry[],
    verbose = false,
  ) {
    this.verbose = verbose;
    const now = Date.now();
    const seq = HandRecorder._idCounter++;
    this.record = {
      handId: `hand-${now}-${seq}`,
      startedAt: now,
      config,
      seatSetup,
      communityCards: [],
      events: [],
    };
  }

  /**
   * Record a single action event.
   * Called after each applyAction succeeds.
   */
  recordEvent(
    action: GameAction,
    potAfter: number,
    source: "engine" | "manual" | "system",
    decision?: RecordableDecision,
    coachingSnapshot?: HandEvent["coachingSnapshot"],
  ): void {
    if (this.finalized) return;

    const event: HandEvent = {
      seq: action.sequence,
      seatIndex: action.seatIndex,
      street: action.street,
      actionType: action.actionType,
      amount: action.amount,
      isAllIn: action.isAllIn,
      potAfter,
      source,
    };

    if (decision) {
      event.decision = this.snapshotDecision(decision);
    }

    if (coachingSnapshot) {
      event.coachingSnapshot = coachingSnapshot;
    }

    this.record.events.push(event);
  }

  /**
   * Finalize the record at hand end.
   * Extracts community cards and outcome from final game state.
   */
  finalize(gameState: GameState): HandRecord {
    if (this.finalized) return this.record;
    this.finalized = true;

    this.record.completedAt = Date.now();
    this.record.communityCards = [...gameState.communityCards];

    // Extract outcome
    this.record.outcome = this.extractOutcome(gameState);

    // Update seat setup with final hole card info
    // (cards may have been revealed during showdown)
    for (const player of gameState.players) {
      const setup = this.record.seatSetup.find(
        (s) => s.seatIndex === player.seatIndex,
      );
      if (setup && player.holeCards.length > 0) {
        setup.holeCards = [...player.holeCards];
      }
    }

    return this.record;
  }

  /** Export the record as a JSON string. */
  toJSON(): string {
    return JSON.stringify(this.record, null, 2);
  }

  /** Get a read-only snapshot of the current record (for mid-hand inspection). */
  snapshot(): Readonly<HandRecord> {
    return this.record;
  }

  /** Get the finalized record (or current if not finalized). */
  getRecord(): HandRecord {
    return this.record;
  }

  /**
   * Seed blind events from the initial game state.
   * Called right after recorder creation — reads committed amounts
   * that initializeHand() already deducted.
   */
  seedBlinds(state: GameState): void {
    if (this.finalized) return;

    for (const player of state.players) {
      if (player.totalCommitted > 0) {
        const event: HandEvent = {
          seq: -1 - player.seatIndex, // negative seq to sort before real actions
          seatIndex: player.seatIndex,
          street: "preflop",
          actionType: player.totalCommitted === this.record.config.blinds.small ? "bet" : "bet",
          amount: player.totalCommitted,
          isAllIn: false,
          potAfter: state.pot.total,
          source: "system",
        };
        this.record.events.push(event);
      }
    }
  }

  /**
   * Record a street transition — captures board state at each street.
   */
  recordStreetChange(
    street: Street,
    communityCards: readonly number[],
    potTotal: number,
    activePlayers: number,
  ): void {
    if (this.finalized) return;

    if (!this.record.streetSnapshots) {
      this.record.streetSnapshots = [];
    }

    const snapshot: StreetSnapshot = {
      street,
      communityCards: [...communityCards],
      potTotal,
      activePlayers,
    };

    this.record.streetSnapshots.push(snapshot);
  }

  /**
   * Record analysis lens results for a given street.
   * Extracts lightweight snapshots from each lens result.
   */
  recordLensResults(
    street: Street,
    results: Map<string, AnalysisResult>,
  ): void {
    if (this.finalized) return;

    if (!this.record.lensSnapshots) {
      this.record.lensSnapshots = [];
    }

    for (const [lensId, result] of results) {
      const snapshot: LensSnapshot = {
        lensId,
        street,
        explanationSummary: result.explanation.summary,
        sentiment: result.explanation.sentiment,
        tags: result.explanation.tags,
      };

      if (this.verbose) {
        snapshot.explanationTreeJson = JSON.stringify(result.explanation);
      }

      this.record.lensSnapshots.push(snapshot);
    }
  }

  // ─── Private helpers ───

  private snapshotDecision(decision: RecordableDecision): DecisionSnapshot {
    const reasoning = this.extractReasoning(decision.reasoning);

    const snapshot: DecisionSnapshot = {
      engineId: decision.engineId ?? "unknown",
      situationKey: decision.situationKey as DecisionSnapshot["situationKey"],
      reasoning,
      explanationSummary: decision.explanationNode?.summary ?? decision.explanation,
    };

    if (this.verbose && decision.explanationNode) {
      snapshot.explanationTreeJson = JSON.stringify(decision.explanationNode);
    }

    return snapshot;
  }

  private extractReasoning(
    raw?: Record<string, unknown>,
  ): DecisionReasoning {
    if (!raw) return {};

    const r: DecisionReasoning = {};

    // Context factors
    if (typeof raw.handStrength === "number") r.handStrength = raw.handStrength;
    if (typeof raw.handDescription === "string") r.handDescription = raw.handDescription;
    if (typeof raw.boardWetness === "number") r.boardWetness = raw.boardWetness;
    if (typeof raw.potOdds === "number") r.potOdds = raw.potOdds;
    if (typeof raw.foldEquity === "number") r.foldEquity = raw.foldEquity;
    if (typeof raw.spr === "number") r.spr = raw.spr;
    if (typeof raw.isInPosition === "boolean") r.isInPosition = raw.isInPosition;

    // GTO base
    if (typeof raw.gtoSource === "string") r.gtoSource = raw.gtoSource as "solver" | "heuristic";
    if (typeof raw.archetypeId === "string") r.archetypeId = raw.archetypeId;
    if (typeof raw.archetypeConfidence === "number") r.archetypeConfidence = raw.archetypeConfidence;
    if (typeof raw.handCategory === "string") r.handCategory = raw.handCategory;
    if (raw.gtoBaseFrequencies && typeof raw.gtoBaseFrequencies === "object") {
      r.gtoBaseFrequencies = this.extractFreqMap(raw.gtoBaseFrequencies as Record<string, unknown>);
    }

    // Modifier output
    if (typeof raw.profileId === "string") r.profileId = raw.profileId;
    if (typeof raw.modifierIntensity === "number") r.modifierIntensity = raw.modifierIntensity;
    if (typeof raw.effectiveFoldScale === "number") r.effectiveFoldScale = raw.effectiveFoldScale;
    if (typeof raw.effectiveAggressionScale === "number") r.effectiveAggressionScale = raw.effectiveAggressionScale;
    if (raw.frequencies && typeof raw.frequencies === "object") {
      r.frequencies = this.extractFreqMap(raw.frequencies as Record<string, unknown>);
    }

    return r;
  }

  /** Extract a frequency map, keeping only non-zero number values. */
  private extractFreqMap(raw: Record<string, unknown>): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (typeof value === "number" && value > 0) {
        result[key] = Math.round(value * 1000) / 1000; // 3 decimal places
      }
    }
    return result;
  }

  private extractOutcome(gameState: GameState): HandOutcome {
    const finalStacks = gameState.players.map((p) => p.currentStack);

    // Determine winners: players whose stack increased
    const winners: HandOutcome["winners"] = [];
    for (let i = 0; i < gameState.players.length; i++) {
      const player = gameState.players[i];
      const gain = player.currentStack - this.record.config.startingStacks[i];
      if (gain > 0) {
        winners.push({ seatIndex: i, amount: gain });
      }
    }

    // If no stack increase found (e.g., everyone folded preflop to blinds),
    // the winner is whoever has more than their starting stack
    if (winners.length === 0) {
      for (let i = 0; i < gameState.players.length; i++) {
        const player = gameState.players[i];
        if (player.status !== "folded" && player.currentStack > 0) {
          const gain = player.currentStack - this.record.config.startingStacks[i];
          if (gain > 0) {
            winners.push({ seatIndex: i, amount: gain });
          }
        }
      }
    }

    return { winners, finalStacks };
  }
}
