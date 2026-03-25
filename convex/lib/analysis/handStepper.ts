/**
 * Hand Stepper — programmatic API for stepping through hands.
 *
 * Allows automated testing without a browser:
 *   1. Initialize a hand with specific cards
 *   2. At each hero decision point, capture a full snapshot
 *   3. Choose an action (manual or auto)
 *   4. Advance to the next decision point
 *   5. Finalize and get the complete hand record
 *
 * Pure TypeScript, zero Convex/React imports.
 */
import type { CardIndex, Street } from "../types/cards";
import type { ActionType, GameState } from "../state/gameState";
import type { OpponentProfile } from "../types/opponents";
import type { CardOverride } from "../state/gameState";
import type { HandRecord } from "../audit/types";
import { HandSession } from "../session/handSession";
import { captureFullSnapshot, formatSnapshot, type FullSnapshot, type SnapshotOptions } from "./snapshot";
import { currentLegalActions } from "../state/stateMachine";
import { lookupGtoFrequencies } from "../gto/frequencyLookup";
import { facingBetAction } from "../gto/facingBetDecision";
import { CATEGORY_STRENGTH } from "../gto/categoryStrength";
import { categorizeHand } from "../gto/handCategorizer";
import { GTO_PROFILE } from "../opponents/presets";
import { buildOpponentStory } from "./opponentStory";

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

export interface StepperConfig {
  numPlayers?: number;
  startingStack?: number;
  heroSeat?: number;
  /** Card overrides: [heroCard1, heroCard2] */
  heroCards?: [CardIndex, CardIndex];
  /** Community card overrides (deck stacking) */
  communityCards?: CardIndex[];
  /** Profile for each villain seat */
  villainProfile?: OpponentProfile;
  /** Enable debug data in snapshots */
  debug?: boolean;
}

export interface StepResult {
  /** The decision point number (0-based) */
  decisionIndex: number;
  /** Full snapshot of everything the user would see */
  snapshot: FullSnapshot;
  /** Formatted human-readable snapshot */
  formatted: string;
  /** Whether this is the final decision (hand will end after) */
  isHandOver: boolean;
}

export interface HandResult {
  /** All decision-point snapshots captured during the hand */
  steps: StepResult[];
  /** Actions hero took at each decision */
  heroActions: Array<{ street: Street; action: ActionType; amount?: number }>;
  /** The final hand record (audit) */
  record: HandRecord | null;
  /** Game state at hand end */
  finalState: GameState | null;
}

// ═══════════════════════════════════════════════════════
// HAND STEPPER
// ═══════════════════════════════════════════════════════

export class HandStepper {
  private session: HandSession;
  private profiles: Map<number, OpponentProfile>;
  private steps: StepResult[] = [];
  private heroActions: HandResult["heroActions"] = [];
  private decisionIndex = 0;
  private debugMode: boolean;
  private _heroCards: CardIndex[] = [];

  constructor(config: StepperConfig = {}) {
    const numPlayers = config.numPlayers ?? 6;
    const heroSeat = config.heroSeat ?? 0;
    this.debugMode = config.debug ?? false;

    // Set up profiles for all villain seats
    this.profiles = new Map();
    const villainProfile = config.villainProfile ?? GTO_PROFILE;
    for (let i = 0; i < numPlayers; i++) {
      if (i !== heroSeat) {
        this.profiles.set(i, villainProfile);
      }
    }

    // Create session
    this.session = new HandSession({
      numPlayers,
      dealerSeatIndex: (heroSeat + numPlayers - 1) % numPlayers, // hero is on button
      heroSeatIndex: heroSeat,
      blinds: { small: 0.5, big: 1 },
      startingStack: config.startingStack ?? 100,
      seatProfiles: this.profiles,
      verbose: false,
    });
  }

  /**
   * Deal a hand and auto-play to hero's first decision point.
   * Returns the snapshot at that point, or null if hero never gets to act.
   */
  deal(heroCards?: [CardIndex, CardIndex], communityCards?: CardIndex[]): StepResult | null {
    this.steps = [];
    this.heroActions = [];
    this.decisionIndex = 0;

    // Start the hand with card overrides
    const cardOverrides: CardOverride[] | undefined = heroCards
      ? [{ seatIndex: this.session.heroSeatIndex, cards: [...heroCards], visibility: "revealed" as const }]
      : undefined;
    this.session.startHand(undefined, cardOverrides, communityCards);

    this._heroCards = heroCards ?? this.getHeroCards();

    // Check if hero has a decision point
    return this.captureCurrentStep();
  }

  /**
   * Hero acts, then auto-play advances to next hero decision.
   * Returns the snapshot at the next decision, or null if hand ended.
   */
  act(actionType: ActionType, amount?: number): StepResult | null {
    const state = this.session.state;
    if (!state) return null;

    // Record the action
    this.heroActions.push({
      street: state.currentStreet,
      action: actionType,
      amount,
    });

    // Apply the action
    this.session.act(actionType, amount);

    // Check if hand is over or hero has another decision
    return this.captureCurrentStep();
  }

  /**
   * Auto-play hero using GTO recommendations.
   * Uses the lightweight GTO lookup (no Monte Carlo) for speed.
   * Returns the snapshot after the action, or null if hand ended.
   */
  autoAct(): StepResult | null {
    const state = this.session.state;
    if (!state) return null;

    const legal = currentLegalActions(state);
    if (!legal) return null;

    // Fast GTO lookup (no expensive equity computation)
    const gtoLookup = this._heroCards.length >= 2
      ? lookupGtoFrequencies(this._heroCards, state.communityCards, state, this.session.heroSeatIndex, legal)
      : null;

    let action: ActionType = legal.canCheck ? "check" : "fold";
    let amount: number | undefined;

    const facingBet = !legal.canCheck && legal.canCall;

    if (facingBet) {
      // Facing a bet: use hand strength + pot odds, NOT solver frequencies.
      // Solver frequencies are for "first to act" — they don't apply here.
      const handCat = this._heroCards.length >= 2
        ? categorizeHand(this._heroCards, state.communityCards)
        : null;
      const strength = handCat
        ? (CATEGORY_STRENGTH[handCat.category] ?? handCat.relativeStrength)
        : 0.3;
      const result = facingBetAction(
        strength, legal.callAmount, state.pot.total,
        legal.canRaise, legal.raiseMin,
      );
      action = result.action;
      if (result.amount !== undefined) amount = result.amount;
    } else if (gtoLookup) {
      // First to act: use solver frequencies directly.
      // Pick the highest-frequency action. This tends to be check (correct OOP).
      let bestAction = "";
      let bestFreq = 0;
      for (const [a, f] of Object.entries(gtoLookup.frequencies)) {
        if ((f ?? 0) > bestFreq) { bestFreq = f ?? 0; bestAction = a; }
      }
      if (bestAction === "fold") action = "fold";
      else if (bestAction === "check") action = legal.canCheck ? "check" : "call";
      else if (bestAction === "call") action = "call";
      else if (bestAction.startsWith("bet")) action = legal.canBet ? "bet" : "check";
      else if (bestAction.startsWith("raise")) action = legal.canRaise ? "raise" : "check";
    }

    // Validate action is legal (can't fold when no bet to face)
    if (action === "fold" && !legal.canFold) {
      action = legal.canCheck ? "check" : "call";
    }

    // Determine amount for bet/raise (if not already set by facingBet path)
    if (amount === undefined) {
      if (action === "call") amount = legal.callAmount;
      else if (action === "bet") amount = legal.betMin;
      else if (action === "raise") amount = legal.raiseMin;
    }

    return this.act(action, amount);
  }

  /**
   * Play the entire hand automatically (hero follows coaching).
   * Returns the complete hand result.
   */
  playFullHand(heroCards?: [CardIndex, CardIndex], communityCards?: CardIndex[]): HandResult {
    const firstStep = this.deal(heroCards, communityCards);

    if (firstStep && !firstStep.isHandOver) {
      // Keep auto-acting until hand ends
      let step: StepResult | null = firstStep;
      let safety = 0;
      while (step && !step.isHandOver && safety < 20) {
        step = this.autoAct();
        safety++;
      }
    }

    return this.getResult();
  }

  /**
   * Get the complete hand result after the hand is over.
   */
  getResult(): HandResult {
    return {
      steps: this.steps,
      heroActions: this.heroActions,
      record: this.session.recorder?.finalize(this.session.state!) ?? null,
      finalState: this.session.state,
    };
  }

  // ── Private ──

  private captureCurrentStep(): StepResult | null {
    const state = this.session.state;
    if (!state) return null;

    // Check if it's hero's turn
    const legal = currentLegalActions(state);
    if (!legal || state.activePlayerIndex === null) {
      // Hand might be over
      return null;
    }

    const activePlayer = state.players[state.activePlayerIndex];
    if (activePlayer.seatIndex !== this.session.heroSeatIndex) {
      // Not hero's turn — shouldn't happen after auto-play
      return null;
    }

    const snapshot = captureFullSnapshot(state, this.session.heroSeatIndex, this._heroCards, {
      debug: this.debugMode,
      opponentProfiles: this.profiles,
    });

    const step: StepResult = {
      decisionIndex: this.decisionIndex++,
      snapshot,
      formatted: formatSnapshot(snapshot),
      isHandOver: false,
    };

    this.steps.push(step);
    return step;
  }

  private getHeroCards(): CardIndex[] {
    const state = this.session.state;
    if (!state) return [];
    const hero = state.players.find((p) => p.seatIndex === this.session.heroSeatIndex);
    return hero?.holeCards ?? [];
  }
}
