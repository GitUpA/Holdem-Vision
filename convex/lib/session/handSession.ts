/**
 * HandSession — pure TS orchestration for a poker hand session.
 *
 * Owns the game state, HandRecorder, opponent auto-play loop, and audit lifecycle.
 * Used by the React hook (useHandManager) as a thin wrapper, and directly by tests.
 *
 * Zero React imports. Zero Convex imports.
 */
import type { CardIndex, Street } from "../types/cards";
import type {
  GameState,
  ActionType,
  CardVisibility,
  CardOverride,
} from "../state/gameState";
import type { OpponentProfile } from "../types/opponents";
import type { AnalysisResult } from "../types/analysis";
import type { HandRecord, SeatSetupEntry } from "../audit/types";
import type { HandSessionConfig, HandSessionCallbacks } from "./types";

import {
  initializeHand,
  applyAction,
  currentLegalActions,
} from "../state/stateMachine";
import {
  chooseActionFromProfile,
  type AutoPlayDecision,
} from "../opponents/autoPlay";
import { PRESET_PROFILES, PRESET_IDS } from "../opponents/presets";
import { HandRecorder } from "../audit/handRecorder";

// ═══════════════════════════════════════════════════════
// HAND SESSION
// ═══════════════════════════════════════════════════════

export class HandSession {
  // ── Config ──
  private _numPlayers: number;
  private _dealerSeatIndex: number;
  private _heroSeatIndex: number;
  private _blinds: HandSessionConfig["blinds"];
  private _startingStack: number;
  private _verbose: boolean;
  private _random?: () => number;

  // ── State ──
  private _gameState: GameState | null = null;
  private _handNumber = 0;
  private _seedCounter: number;
  private _seatProfiles: Map<number, OpponentProfile>;
  private _lastDecisions: Map<number, AutoPlayDecision> = new Map();
  private _recorder: HandRecorder | null = null;
  private _lastRecordedStreet: Street | null = null;
  private _handHistory: HandRecord[] = [];

  // ── Callbacks ──
  private callbacks: HandSessionCallbacks;

  constructor(config: HandSessionConfig, callbacks?: HandSessionCallbacks) {
    this._numPlayers = config.numPlayers;
    this._dealerSeatIndex = config.dealerSeatIndex;
    this._heroSeatIndex = config.heroSeatIndex;
    this._blinds = { ...config.blinds };
    this._startingStack = config.startingStack;
    this._seatProfiles = new Map(config.seatProfiles);
    this._seedCounter = config.seed ?? Date.now();
    this._random = config.random;
    this._verbose = config.verbose ?? false;
    this.callbacks = callbacks ?? {};
  }

  // ═══════════════════════════════════════════════════════
  // READ-ONLY ACCESSORS
  // ═══════════════════════════════════════════════════════

  get state(): GameState | null {
    return this._gameState;
  }

  get currentHandNumber(): number {
    return this._handNumber;
  }

  get decisions(): ReadonlyMap<number, AutoPlayDecision> {
    return this._lastDecisions;
  }

  get history(): readonly HandRecord[] {
    return this._handHistory;
  }

  get profiles(): ReadonlyMap<number, OpponentProfile> {
    return this._seatProfiles;
  }

  get numPlayers(): number {
    return this._numPlayers;
  }

  get dealerSeatIndex(): number {
    return this._dealerSeatIndex;
  }

  get heroSeatIndex(): number {
    return this._heroSeatIndex;
  }

  get blinds(): HandSessionConfig["blinds"] {
    return this._blinds;
  }

  get startingStack(): number {
    return this._startingStack;
  }

  get recorder(): HandRecorder | null {
    return this._recorder;
  }

  // ═══════════════════════════════════════════════════════
  // HAND LIFECYCLE
  // ═══════════════════════════════════════════════════════

  /**
   * Start a new hand: initialize game state, seed blinds, auto-advance opponents.
   * If the hand completes during preflop auto-play, fires onHandComplete.
   *
   * @param customStacks Optional per-player starting stacks (e.g. carried forward
   *                     from a previous hand's finalStacks). If omitted, uses
   *                     the configured startingStack for all players.
   * @param cardOverrides Optional per-seat hole card overrides (for drill/replay).
   * @param communityCards Optional community card overrides — stacked at front of
   *                       deck after initialization so deal() places them correctly.
   */
  startHand(
    customStacks?: number[],
    cardOverrides?: CardOverride[],
    communityCards?: CardIndex[],
  ): void {
    const seed = this._seedCounter++;
    // startingStack is in BB — convert to chips for the state machine
    const stacks = customStacks ?? Array(this._numPlayers).fill(this._startingStack * this._blinds.big);
    this._lastDecisions = new Map();

    // Initialize hand via state machine
    const config = {
      numPlayers: this._numPlayers,
      dealerSeatIndex: this._dealerSeatIndex,
      blinds: this._blinds,
      startingStacks: stacks,
      handNumber: this._handNumber + 1,
      seed,
      ...(cardOverrides?.length ? { cardOverrides } : {}),
    };
    let { state } = initializeHand(config);

    // Stack community cards at front of deck so advanceStreet() deals them
    // in order. Same trick used by buildTimeline.ts for replay.
    //
    // Community cards may have been randomly dealt to villain hands during
    // initializeHand(). We must resolve these conflicts: swap any community
    // card found in a villain's hand with a safe card from the deck.
    if (communityCards?.length) {
      const players = state.players.map((p) => ({
        ...p,
        holeCards: [...p.holeCards],
      }));
      const deck = [...state.deck];

      for (const card of communityCards) {
        // First, try to remove from deck
        const deckIdx = deck.indexOf(card);
        if (deckIdx !== -1) {
          deck.splice(deckIdx, 1);
        } else {
          // Card is in a player's hand — swap it out with a safe deck card
          for (const player of players) {
            const handIdx = player.holeCards.indexOf(card);
            if (handIdx !== -1) {
              // Replace with a card from the back of the deck
              const replacement = deck.pop();
              if (replacement !== undefined) {
                player.holeCards[handIdx] = replacement;
              }
              break;
            }
          }
        }
      }

      deck.unshift(...communityCards);
      state = { ...state, deck, players };
    }

    // Mark hero as revealed
    const s: GameState = {
      ...state,
      players: state.players.map((p) =>
        p.seatIndex === this._heroSeatIndex
          ? { ...p, cardVisibility: "revealed" as CardVisibility }
          : p,
      ),
    };

    // Ensure every villain has a profile — assign random defaults for missing
    for (let i = 0; i < this._numPlayers; i++) {
      if (i === this._heroSeatIndex) continue;
      if (!this._seatProfiles.has(i)) {
        this._seatProfiles.set(i, PRESET_PROFILES["gto"]);
      }
    }

    // Initialize audit recorder
    const seatSetup: SeatSetupEntry[] = s.players.map((p) => {
      const prof = this._seatProfiles.get(p.seatIndex);
      return {
        seatIndex: p.seatIndex,
        position: p.position,
        profileId: prof?.id,
        profileName: prof?.name,
        engineId: prof?.engineId,
        cardVisibility: p.cardVisibility,
        holeCards: p.cardVisibility !== "hidden" ? [...p.holeCards] : undefined,
      };
    });
    this._recorder = new HandRecorder(
      {
        numPlayers: this._numPlayers,
        dealerSeatIndex: this._dealerSeatIndex,
        heroSeatIndex: this._heroSeatIndex,
        blinds: {
          small: this._blinds.small,
          big: this._blinds.big,
          ante: this._blinds.ante,
        },
        startingStacks: stacks,
      },
      seatSetup,
      this._verbose,
    );
    this._recorder.seedBlinds(s);
    this._lastRecordedStreet = "preflop";

    // Auto-advance opponents
    const advanced = this.advanceOpponents(s);
    this._gameState = advanced;
    this._handNumber++;

    // Finalize if hand completed during preflop auto-play
    this.finalizeIfComplete(advanced);

    this.callbacks.onStateChange?.();
  }

  /**
   * Hero acts — apply action, record, advance opponents.
   */
  act(actionType: ActionType, amount?: number, coachingSnapshot?: import("../audit/types").HandEvent["coachingSnapshot"]): void {
    if (!this._gameState) return;

    // Verify it's hero's turn
    const activeIdx = this._gameState.activePlayerIndex;
    if (activeIdx === null) return;
    const activePlayer = this._gameState.players[activeIdx];
    if (activePlayer.seatIndex !== this._heroSeatIndex) return;

    try {
      const prevStreet = this._gameState.currentStreet;
      const { state } = applyAction(
        this._gameState,
        this._heroSeatIndex,
        actionType,
        amount,
      );

      // Record hero action for audit
      const lastAction = state.actionHistory[state.actionHistory.length - 1];
      if (lastAction && this._recorder) {
        this._recorder.recordEvent(lastAction, state.pot.total, "manual", undefined, coachingSnapshot);
      }

      // Detect street change after hero action
      this.detectAndRecordStreetChange(prevStreet, state);

      // Auto-advance opponents
      const advanced = this.advanceOpponents(state);
      this._gameState = advanced;

      // Finalize if hand is over
      this.finalizeIfComplete(advanced);

      this.callbacks.onStateChange?.();
    } catch (e) {
      console.error("Invalid action:", e);
    }
  }

  // ═══════════════════════════════════════════════════════
  // CONVENIENCE ACTIONS (scripting API)
  // ═══════════════════════════════════════════════════════

  /** Alias for startHand() — reads like clicking "Deal Hand". */
  deal(customStacks?: number[], cardOverrides?: CardOverride[], communityCards?: CardIndex[]): void {
    this.startHand(customStacks, cardOverrides, communityCards);
  }

  /** Deal next hand: rotate dealer, carry stacks — reads like clicking "Deal Next Hand". */
  dealNext(): void {
    const carryStacks = this._gameState?.players.map((p) => p.currentStack);
    this.resetHand();
    // Auto-rotate dealer one seat forward
    this._dealerSeatIndex = (this._dealerSeatIndex + 1) % this._numPlayers;
    this.startHand(carryStacks);
  }

  /** Reset and deal fresh — reads like clicking "Deal Fresh". */
  dealFresh(): void {
    this.resetHand();
    this.startHand();
  }

  /** Hero folds. */
  fold(): void { this.act("fold"); }

  /** Hero calls. */
  call(): void { this.act("call"); }

  /** Hero checks. */
  check(): void { this.act("check"); }

  /** Hero bets the given amount. */
  bet(amount: number): void { this.act("bet", amount); }

  /** Hero raises to the given amount. */
  raise(amount: number): void { this.act("raise", amount); }

  /** Hero goes all-in. */
  allIn(): void { this.act("all_in"); }

  /**
   * Reset state between hands (does not auto-start next hand).
   */
  resetHand(): void {
    this._gameState = null;
    this._lastDecisions = new Map();
    this.callbacks.onStateChange?.();
  }

  // ═══════════════════════════════════════════════════════
  // EXTERNAL INJECTION
  // ═══════════════════════════════════════════════════════

  /**
   * Record analysis lens results for a given street.
   * Called by the UI's useEffect or directly by tests.
   */
  recordLensSnapshot(
    street: Street,
    results: Map<string, AnalysisResult>,
  ): void {
    if (!this._recorder) return;
    this._recorder.recordLensResults(street, results);
  }

  // ═══════════════════════════════════════════════════════
  // GAME STATE MUTATION (for card overrides in UI)
  // ═══════════════════════════════════════════════════════

  /**
   * Replace the current game state. Used by the hook for card overrides.
   * This is a controlled escape hatch — override functions are pure.
   */
  setGameState(state: GameState): void {
    this._gameState = state;
    this.callbacks.onStateChange?.();
  }

  // ═══════════════════════════════════════════════════════
  // PROFILE MANAGEMENT
  // ═══════════════════════════════════════════════════════

  assignProfile(
    seatIndex: number,
    profile: OpponentProfile | undefined,
  ): void {
    const next = new Map(this._seatProfiles);
    if (profile) {
      next.set(seatIndex, profile);
    } else {
      next.delete(seatIndex);
    }
    this._seatProfiles = next;
    this.callbacks.onStateChange?.();
  }

  randomizeProfiles(): void {
    const next = new Map(this._seatProfiles);
    for (let i = 0; i < this._numPlayers; i++) {
      if (i === this._heroSeatIndex) continue;
      const rng = this._random ?? Math.random;
      const randomId = PRESET_IDS[Math.floor(rng() * PRESET_IDS.length)];
      next.set(i, PRESET_PROFILES[randomId]);
    }
    this._seatProfiles = next;
    this.callbacks.onStateChange?.();
  }

  /** Set all villain seats to the same profile preset. */
  setAllProfiles(profileId: string): void {
    const profile = PRESET_PROFILES[profileId];
    if (!profile) return;
    const next = new Map(this._seatProfiles);
    for (let i = 0; i < this._numPlayers; i++) {
      if (i === this._heroSeatIndex) continue;
      next.set(i, profile);
    }
    this._seatProfiles = next;
    this.callbacks.onStateChange?.();
  }

  // ═══════════════════════════════════════════════════════
  // CONFIG UPDATES (between hands only)
  // ═══════════════════════════════════════════════════════

  updateConfig(
    partial: Partial<
      Pick<
        HandSessionConfig,
        | "numPlayers"
        | "dealerSeatIndex"
        | "heroSeatIndex"
        | "blinds"
        | "startingStack"
      >
    >,
  ): void {
    if (partial.numPlayers !== undefined) {
      this._numPlayers = Math.min(Math.max(partial.numPlayers, 2), 10);
      // Clamp seat indices
      this._dealerSeatIndex = this._dealerSeatIndex % this._numPlayers;
      this._heroSeatIndex = this._heroSeatIndex % this._numPlayers;
      // Clean up stale profiles
      for (const key of this._seatProfiles.keys()) {
        if (key >= this._numPlayers) this._seatProfiles.delete(key);
      }
      this._gameState = null;
    }
    if (partial.dealerSeatIndex !== undefined) {
      this._dealerSeatIndex =
        ((partial.dealerSeatIndex % this._numPlayers) + this._numPlayers) %
        this._numPlayers;
    }
    if (partial.heroSeatIndex !== undefined) {
      this._heroSeatIndex =
        ((partial.heroSeatIndex % this._numPlayers) + this._numPlayers) %
        this._numPlayers;
    }
    if (partial.blinds !== undefined) {
      this._blinds = { ...partial.blinds };
    }
    if (partial.startingStack !== undefined) {
      this._startingStack = partial.startingStack;
    }
    this.callbacks.onStateChange?.();
  }

  // ═══════════════════════════════════════════════════════
  // AUDIT EXPORT
  // ═══════════════════════════════════════════════════════

  exportHandHistory(): string {
    return JSON.stringify(
      {
        version: "1.0" as const,
        exportedAt: Date.now(),
        hands: this._handHistory,
      },
      null,
      2,
    );
  }

  clearHandHistory(): void {
    this._handHistory = [];
  }

  // ═══════════════════════════════════════════════════════
  // PRIVATE ORCHESTRATION
  // ═══════════════════════════════════════════════════════

  /**
   * Auto-advance opponents until hero's turn or hand ends.
   * This is the core orchestration loop extracted from the React hook.
   */
  private advanceOpponents(state: GameState): GameState {
    let s = state;
    let safety = 0;
    let prevStreet = s.currentStreet;

    while (safety < 100) {
      safety++;

      if (s.phase === "complete" || s.phase === "showdown") break;
      if (s.activePlayerIndex === null) {
        // No one to act, but hand isn't over — state machine should have
        // handled this (runOutBoard). If we reach here, something is stuck.
        break;
      }

      const activePlayer = s.players[s.activePlayerIndex];

      // Hero's turn → stop
      if (activePlayer.seatIndex === this._heroSeatIndex) break;

      const legal = currentLegalActions(s);
      if (!legal) break;

      // Profile-driven auto-play
      const profile = this._seatProfiles.get(activePlayer.seatIndex);
      let actionType: ActionType;
      let amount: number | undefined;
      let currentDecision: AutoPlayDecision | undefined;

      if (profile) {
        const decision = chooseActionFromProfile(
          s,
          activePlayer.seatIndex,
          profile,
          legal,
          (id) => PRESET_PROFILES[id],
          this._random,
          this._seatProfiles,
        );
        actionType = decision.actionType;
        amount = decision.amount;
        currentDecision = decision;
        // Store decision for access
        this._lastDecisions.set(activePlayer.seatIndex, decision);
      } else {
        // Fallback: simple check/call
        if (legal.canCheck) {
          actionType = "check";
        } else if (legal.canCall) {
          actionType = "call";
        } else {
          actionType = legal.canFold ? "fold" : "check";
        }
      }

      try {
        const result = applyAction(
          s,
          activePlayer.seatIndex,
          actionType,
          amount,
        );
        s = result.state;

        // Record engine action for audit
        const lastAction = s.actionHistory[s.actionHistory.length - 1];
        if (lastAction && this._recorder) {
          this._recorder.recordEvent(
            lastAction,
            s.pot.total,
            "engine",
            currentDecision,
          );
        }

        // Detect street change
        if (s.currentStreet !== prevStreet && this._recorder) {
          this._recorder.recordStreetChange(
            s.currentStreet,
            s.communityCards,
            s.pot.total,
            s.players.filter(
              (p) => p.status === "active" || p.status === "all_in",
            ).length,
          );
          this._lastRecordedStreet = s.currentStreet;
          prevStreet = s.currentStreet;
        }
      } catch {
        // Fallback: fold or check
        try {
          s = applyAction(
            s,
            activePlayer.seatIndex,
            legal.canFold ? "fold" : "check",
          ).state;
          const lastAction = s.actionHistory[s.actionHistory.length - 1];
          if (lastAction && this._recorder) {
            this._recorder.recordEvent(lastAction, s.pot.total, "engine");
          }
        } catch {
          break;
        }
      }
    }

    return s;
  }

  /**
   * Check if the hand is complete, and if so, finalize the audit record.
   */
  private finalizeIfComplete(state: GameState): void {
    if (
      (state.phase === "complete" || state.phase === "showdown") &&
      this._recorder
    ) {
      const record = this._recorder.finalize(state);
      this._handHistory = [...this._handHistory, record];
      this.callbacks.onHandComplete?.(record);
    }
  }

  /**
   * Detect street change and record it in the audit log.
   */
  private detectAndRecordStreetChange(
    prevStreet: Street,
    state: GameState,
  ): void {
    if (state.currentStreet !== prevStreet && this._recorder) {
      this._recorder.recordStreetChange(
        state.currentStreet,
        state.communityCards,
        state.pot.total,
        state.players.filter(
          (p) => p.status === "active" || p.status === "all_in",
        ).length,
      );
      this._lastRecordedStreet = state.currentStreet;
    }
  }
}
