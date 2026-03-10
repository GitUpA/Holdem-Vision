/**
 * State machine — hand initialization, action application, street advancement.
 * Pure TypeScript, zero Convex imports.
 *
 * Core functions:
 * - initializeHand: shuffle, post blinds, deal, set first-to-act
 * - applyAction: validate, update state, recalculate pots, advance if needed
 * - advanceStreet: deal community cards, reset street state
 * - gameContextFromState: bridge to existing analysis pipeline
 * - analysisContextFromState: full bridge producing AnalysisContext
 */
import type { CardIndex, Street, Position } from "../types/cards";
import type {
  GameState,
  PlayerState,
  GameAction,
  HandConfig,
  StateTransitionResult,
  LegalActions,
  ActionType,
  PotState,
} from "./game-state";
import type { AnalysisContext, GameContext, ExplanationNode } from "../types/analysis";
import type { OpponentProfile, OpponentContext, PlayerAction } from "../types/opponents";
import { estimateRange } from "../opponents/rangeEstimator";
import { createShuffledDeck, deal, seededRandom } from "../primitives/deck";
import { seatToPositionMap } from "../primitives/position";
import { calculatePots } from "../rules/pot";
import { getLegalActions, validateAction } from "../rules/actions";
import {
  firstToAct,
  nextToAct,
  isBettingRoundComplete,
  isHandOver,
  allPlayersAllIn,
  nextStreet,
  activePlayerCount,
} from "../rules/streets";

// ═══════════════════════════════════════════════════════
// INITIALIZE HAND
// ═══════════════════════════════════════════════════════

/**
 * Set up a new hand: shuffle deck, assign positions, post blinds, deal hole cards.
 */
export function initializeHand(config: HandConfig): StateTransitionResult {
  const {
    numPlayers,
    dealerSeatIndex,
    blinds,
    startingStacks,
    handNumber = 1,
    seed,
    cardOverrides,
  } = config;

  if (numPlayers < 2 || numPlayers > 10) {
    throw new Error(`Invalid number of players: ${numPlayers}`);
  }
  if (startingStacks.length !== numPlayers) {
    throw new Error(`startingStacks length (${startingStacks.length}) must match numPlayers (${numPlayers})`);
  }

  // Shuffle deck
  const random = seed !== undefined ? seededRandom(seed) : undefined;
  const deck = createShuffledDeck([], random);

  // Assign positions
  const posMap = seatToPositionMap(dealerSeatIndex, numPlayers);

  // Build override lookup
  const overrideMap = new Map<number, typeof cardOverrides extends (infer T)[] | undefined ? T : never>();
  if (cardOverrides) {
    for (const ov of cardOverrides) {
      overrideMap.set(ov.seatIndex, ov);
    }
  }

  // Create players
  const players: PlayerState[] = [];
  for (let i = 0; i < numPlayers; i++) {
    const override = overrideMap.get(i);
    players.push({
      seatIndex: i,
      position: posMap.get(i)!,
      status: startingStacks[i] > 0 ? "active" : "sitting_out",
      startingStack: startingStacks[i],
      currentStack: startingStacks[i],
      totalCommitted: 0,
      streetCommitted: 0,
      holeCards: [],
      hasActedThisStreet: false,
      cardVisibility: override?.visibility ?? "hidden",
    });
  }

  // Initial state
  let state: GameState = {
    numPlayers,
    dealerSeatIndex,
    blinds,
    handNumber,
    deck,
    communityCards: [],
    players,
    currentStreet: "preflop",
    activePlayerIndex: null,
    lastAggressorIndex: null,
    currentBet: 0,
    minRaiseSize: blinds.big,
    raiseCount: 0,
    pot: { mainPot: 0, sidePots: [], total: 0, explanation: "" },
    actionHistory: [],
    phase: "blinds_posted",
  };

  // Post antes if applicable
  if (blinds.ante && blinds.ante > 0) {
    for (const player of state.players) {
      if (player.status === "sitting_out") continue;
      const anteAmount = Math.min(blinds.ante, player.currentStack);
      player.currentStack -= anteAmount;
      player.totalCommitted += anteAmount;
      player.streetCommitted += anteAmount;
      if (player.currentStack === 0) {
        player.status = "all_in";
      }
    }
  }

  // Post blinds
  const sbSeat = numPlayers === 2
    ? dealerSeatIndex // Heads-up: BTN is also SB
    : (dealerSeatIndex + 1) % numPlayers;
  const bbSeat = numPlayers === 2
    ? (dealerSeatIndex + 1) % numPlayers
    : (dealerSeatIndex + 2) % numPlayers;

  const sbPlayer = state.players[sbSeat];
  const bbPlayer = state.players[bbSeat];

  const sbAmount = Math.min(blinds.small, sbPlayer.currentStack);
  sbPlayer.currentStack -= sbAmount;
  sbPlayer.totalCommitted += sbAmount;
  sbPlayer.streetCommitted += sbAmount;
  if (sbPlayer.currentStack === 0) sbPlayer.status = "all_in";

  const bbAmount = Math.min(blinds.big, bbPlayer.currentStack);
  bbPlayer.currentStack -= bbAmount;
  bbPlayer.totalCommitted += bbAmount;
  bbPlayer.streetCommitted += bbAmount;
  if (bbPlayer.currentStack === 0) bbPlayer.status = "all_in";

  state.currentBet = bbAmount;

  // Deal hole cards (2 per player, starting left of dealer)
  for (let offset = 1; offset <= numPlayers; offset++) {
    const seat = (dealerSeatIndex + offset) % numPlayers;
    const player = state.players[seat];
    if (player.status === "sitting_out") continue;
    player.holeCards = deal(state.deck, 2);
  }

  // Apply card overrides: swap randomly dealt cards with specified ones
  if (cardOverrides && cardOverrides.length > 0) {
    for (const ov of cardOverrides) {
      const player = state.players[ov.seatIndex];
      if (!player || player.status === "sitting_out") continue;

      // Return randomly dealt cards back to the deck
      state.deck.push(...player.holeCards);

      // Remove override cards from wherever they ended up (deck or another player)
      for (const card of ov.cards) {
        // Check deck
        const deckIdx = state.deck.indexOf(card);
        if (deckIdx !== -1) {
          state.deck.splice(deckIdx, 1);
        } else {
          // Check other players' hands
          for (const other of state.players) {
            if (other.seatIndex === ov.seatIndex) continue;
            const handIdx = other.holeCards.indexOf(card);
            if (handIdx !== -1) {
              // Replace with a card from the deck
              other.holeCards[handIdx] = state.deck.pop()!;
              break;
            }
          }
        }
      }

      // Assign override cards
      player.holeCards = [...ov.cards];
      player.cardVisibility = ov.visibility;
    }
  }

  // Calculate initial pot
  state.pot = calculatePots(state);

  // Set phase and first to act
  state.phase = "preflop";
  const firstAct = firstToAct(state, "preflop");
  state.activePlayerIndex = firstAct;

  return {
    state,
    explanation: `Hand #${handNumber}: blinds ${blinds.small}/${blinds.big}, ${numPlayers} players`,
  };
}

// ═══════════════════════════════════════════════════════
// APPLY ACTION
// ═══════════════════════════════════════════════════════

/**
 * Apply a player action to the game state.
 * Returns updated state or throws if action is invalid.
 */
export function applyAction(
  state: GameState,
  seatIndex: number,
  actionType: ActionType,
  amount?: number,
): StateTransitionResult {
  // Validate
  const validation = validateAction(state, seatIndex, actionType, amount);
  if (!validation.valid) {
    throw new Error(`Invalid action: ${validation.reason}`);
  }

  // Clone state for immutability
  const newState = cloneState(state);
  const player = newState.players[newState.activePlayerIndex!];
  const sequence = newState.actionHistory.length;

  let actionAmount: number | undefined;
  let isAllIn = false;

  switch (actionType) {
    case "fold":
      player.status = "folded";
      break;

    case "check":
      break;

    case "call": {
      const toCall = Math.min(
        newState.currentBet - player.streetCommitted,
        player.currentStack,
      );
      player.currentStack -= toCall;
      player.totalCommitted += toCall;
      player.streetCommitted += toCall;
      actionAmount = toCall;
      if (player.currentStack === 0) {
        player.status = "all_in";
        isAllIn = true;
      }
      break;
    }

    case "bet": {
      const betAmt = amount!;
      player.currentStack -= betAmt;
      player.totalCommitted += betAmt;
      player.streetCommitted += betAmt;
      newState.currentBet = betAmt;
      newState.minRaiseSize = betAmt;
      newState.lastAggressorIndex = newState.activePlayerIndex;
      newState.raiseCount++;
      actionAmount = betAmt;
      if (player.currentStack === 0) {
        player.status = "all_in";
        isAllIn = true;
      }
      // Reset hasActedThisStreet for other active players (they need to respond)
      for (const p of newState.players) {
        if (p.seatIndex !== player.seatIndex && p.status === "active") {
          p.hasActedThisStreet = false;
        }
      }
      break;
    }

    case "raise": {
      const raiseTotal = amount!; // total bet size (not just increment)
      const raiseCost = raiseTotal - player.streetCommitted;
      const raiseIncrement = raiseTotal - newState.currentBet;

      player.currentStack -= raiseCost;
      player.totalCommitted += raiseCost;
      player.streetCommitted = raiseTotal;

      // Only update minRaiseSize if this is a full raise (not short all-in)
      if (raiseIncrement >= newState.minRaiseSize) {
        newState.minRaiseSize = raiseIncrement;
        newState.lastAggressorIndex = newState.activePlayerIndex;
      }
      // Short all-in: does NOT reopen action (lastAggressorIndex unchanged)

      newState.currentBet = raiseTotal;
      newState.raiseCount++;
      actionAmount = raiseCost;

      if (player.currentStack === 0) {
        player.status = "all_in";
        isAllIn = true;
      }
      // Reset hasActedThisStreet for other active players
      for (const p of newState.players) {
        if (p.seatIndex !== player.seatIndex && p.status === "active") {
          p.hasActedThisStreet = false;
        }
      }
      break;
    }

    case "all_in": {
      const allInAmt = player.currentStack;
      const newTotal = player.streetCommitted + allInAmt;

      player.currentStack = 0;
      player.totalCommitted += allInAmt;
      player.streetCommitted = newTotal;
      player.status = "all_in";
      isAllIn = true;
      actionAmount = allInAmt;

      if (newTotal > newState.currentBet) {
        const raiseIncrement = newTotal - newState.currentBet;
        // Full raise: reopens action
        if (raiseIncrement >= newState.minRaiseSize) {
          newState.minRaiseSize = raiseIncrement;
          newState.lastAggressorIndex = newState.activePlayerIndex;
        }
        // Short all-in: does NOT reopen action
        newState.currentBet = newTotal;
        newState.raiseCount++;
        // Reset hasActedThisStreet for other active players
        for (const p of newState.players) {
          if (p.seatIndex !== player.seatIndex && p.status === "active") {
            p.hasActedThisStreet = false;
          }
        }
      }
      break;
    }
  }

  player.hasActedThisStreet = true;

  // Record action
  newState.actionHistory.push({
    seatIndex: player.seatIndex,
    position: player.position,
    street: newState.currentStreet,
    actionType,
    amount: actionAmount,
    isAllIn,
    sequence,
  });

  // Recalculate pots
  newState.pot = calculatePots(newState);

  // Check if hand is over (everyone folded)
  if (isHandOver(newState)) {
    newState.phase = "complete";
    newState.activePlayerIndex = null;
    return {
      state: newState,
      explanation: `Hand over after ${actionType}`,
    };
  }

  // Check if betting round is complete
  if (isBettingRoundComplete(newState)) {
    // Check if all remaining players are all-in → run out community cards
    if (allPlayersAllIn(newState)) {
      return runOutBoard(newState);
    }

    // Advance to next street
    const next = nextStreet(newState.currentStreet);
    if (next === null) {
      // After river betting, go to showdown
      newState.phase = "showdown";
      newState.activePlayerIndex = null;
      return { state: newState, explanation: "Showdown" };
    }

    return advanceStreet(newState);
  }

  // Find next player to act
  const nextAct = nextToAct(newState);
  newState.activePlayerIndex = nextAct;

  return {
    state: newState,
    explanation: `${player.position} ${actionType}${actionAmount !== undefined ? ` ${actionAmount}` : ""}`,
  };
}

// ═══════════════════════════════════════════════════════
// ADVANCE STREET
// ═══════════════════════════════════════════════════════

/**
 * Advance to the next street: deal community cards, reset street state.
 */
export function advanceStreet(state: GameState): StateTransitionResult {
  const next = nextStreet(state.currentStreet);
  if (next === null) {
    state.phase = "showdown";
    state.activePlayerIndex = null;
    return { state, explanation: "Showdown" };
  }

  state.currentStreet = next;
  state.phase = next as GameState["phase"];

  // Deal community cards
  switch (next) {
    case "flop":
      state.communityCards.push(...deal(state.deck, 3));
      break;
    case "turn":
    case "river":
      state.communityCards.push(...deal(state.deck, 1));
      break;
  }

  // Reset street state
  state.currentBet = 0;
  state.minRaiseSize = state.blinds.big;
  state.raiseCount = 0;
  state.lastAggressorIndex = null;
  for (const p of state.players) {
    if (p.status === "active") {
      p.streetCommitted = 0;
      p.hasActedThisStreet = false;
    }
  }

  // Set first to act
  const firstAct = firstToAct(state, next);
  state.activePlayerIndex = firstAct;

  // If only one active player left (rest all-in), auto-advance
  if (activePlayerCount(state) <= 1 && allPlayersAllIn(state)) {
    return runOutBoard(state);
  }

  return { state, explanation: `Dealt ${next}` };
}

/**
 * Run out all remaining community cards (when all players are all-in).
 */
function runOutBoard(state: GameState): StateTransitionResult {
  state.activePlayerIndex = null;

  while (state.communityCards.length < 5 && state.deck.length > 0) {
    const cardsNeeded =
      state.communityCards.length === 0 ? 3 : 1;
    state.communityCards.push(...deal(state.deck, cardsNeeded));
    // Update street
    if (state.communityCards.length === 3) state.currentStreet = "flop";
    else if (state.communityCards.length === 4) state.currentStreet = "turn";
    else if (state.communityCards.length === 5) state.currentStreet = "river";
  }

  state.phase = "showdown";
  return { state, explanation: "All-in run-out → showdown" };
}

// ═══════════════════════════════════════════════════════
// BRIDGE FUNCTIONS
// ═══════════════════════════════════════════════════════

/**
 * Extract GameContext from GameState for the analysis pipeline.
 */
export function gameContextFromState(state: GameState): GameContext {
  const stackSizes = new Map<number, number>();
  for (const p of state.players) {
    stackSizes.set(p.seatIndex, p.currentStack);
  }

  return {
    pot: state.pot.total,
    stackSizes,
    blinds: { small: state.blinds.small, big: state.blinds.big },
    ante: state.blinds.ante,
  };
}

// ─── Analysis Bridge Config ───

/**
 * Optional config for enriching AnalysisContext with opponent data.
 * Without this, analysisContextFromState still works but returns opponents: [].
 */
export interface AnalysisBridgeConfig {
  /** Map of seatIndex → profile for opponents with assigned profiles */
  seatProfiles: Map<number, OpponentProfile>;
  /** Map of seatIndex → display label (e.g., "Villain 1") */
  seatLabels?: Map<number, string>;
  /** Lookup function for base profiles (inheritance resolution) */
  getBase?: (id: string) => OpponentProfile | undefined;
}

/**
 * Extract full AnalysisContext from GameState for a specific hero.
 *
 * Without bridgeConfig: backward compatible, returns opponents: [] and deadCards: [].
 * With bridgeConfig: builds full opponent context with ranges, actions, and known cards.
 */
export function analysisContextFromState(
  state: GameState,
  heroSeatIndex: number,
  bridgeConfig?: AnalysisBridgeConfig,
): AnalysisContext {
  const hero = state.players.find((p) => p.seatIndex === heroSeatIndex);
  if (!hero) {
    throw new Error(`Hero seat ${heroSeatIndex} not found`);
  }

  // Known cards that should be excluded from equity simulations
  const deadCards: CardIndex[] = [];
  const opponents: OpponentContext[] = [];

  if (bridgeConfig) {
    const { seatProfiles, seatLabels, getBase } = bridgeConfig;

    for (const p of state.players) {
      // Skip hero and already-folded players
      if (p.seatIndex === heroSeatIndex) continue;
      if (p.status === "folded") continue;

      // Convert GameAction[] → PlayerAction[] for this seat
      const seatActions: PlayerAction[] = state.actionHistory
        .filter((a) => a.seatIndex === p.seatIndex)
        .map((a) => ({
          street: a.street,
          actionType: a.actionType,
          amount: a.amount,
        }));

      const profile = seatProfiles.get(p.seatIndex);
      const label = seatLabels?.get(p.seatIndex) ?? `Seat ${p.seatIndex}`;

      // Known villain cards (assigned or revealed)
      const knownCards: CardIndex[] | undefined =
        p.cardVisibility !== "hidden" && p.holeCards.length === 2
          ? [...p.holeCards]
          : undefined;

      // Add known villain cards to dead cards for equity calculations
      if (knownCards) {
        deadCards.push(...knownCards);
      }

      // Estimate range if profile is available
      let impliedRange: Map<string, number> = new Map();
      let rangeDerivation: ExplanationNode = { summary: "No profile assigned" };

      if (profile) {
        const estimation = estimateRange(
          profile,
          seatActions,
          [...hero.holeCards, ...state.communityCards, ...deadCards],
          p.position,
          getBase,
        );
        impliedRange = estimation.range;
        rangeDerivation = estimation.explanation;
      }

      opponents.push({
        seatIndex: p.seatIndex,
        label,
        position: p.position,
        actions: seatActions,
        impliedRange,
        rangeDerivation,
        profile,
        knownCards,
      });
    }
  }

  return {
    heroCards: [...hero.holeCards],
    communityCards: [...state.communityCards],
    deadCards,
    street: state.currentStreet,
    position: hero.position,
    numPlayers: state.numPlayers,
    heroSeatIndex,
    dealerSeatIndex: state.dealerSeatIndex,
    opponents,
    gameContext: gameContextFromState(state),
    gameState: state,
  };
}

/**
 * Get legal actions for the current state.
 * Convenience wrapper around getLegalActions from rules/actions.
 */
export function currentLegalActions(state: GameState): LegalActions | null {
  return getLegalActions(state);
}

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

/**
 * Deep clone a GameState for immutable updates.
 */
function cloneState(state: GameState): GameState {
  return {
    ...state,
    deck: [...state.deck],
    communityCards: [...state.communityCards],
    players: state.players.map((p) => ({
      ...p,
      holeCards: [...p.holeCards],
    })),
    pot: {
      ...state.pot,
      sidePots: state.pot.sidePots.map((sp) => ({
        ...sp,
        eligiblePlayers: [...sp.eligiblePlayers],
      })),
    },
    actionHistory: [...state.actionHistory],
  };
}
