/**
 * Game state types — pure TypeScript, zero Convex imports.
 * Defines the shape of a poker hand's mutable state.
 *
 * Chip amounts are raw numbers (not BB).
 * Bridge functions convert to BB for display.
 */
import type { CardIndex, Street, Position } from "../types/cards";
import type { BlindStructure } from "../types/game";

// ═══════════════════════════════════════════════════════
// PLAYER STATE
// ═══════════════════════════════════════════════════════

export type PlayerStatus = "active" | "folded" | "all_in" | "sitting_out";

/** How much the user knows about a seat's hole cards */
export type CardVisibility = "hidden" | "assigned" | "revealed";

export interface PlayerState {
  seatIndex: number;
  position: Position;
  status: PlayerStatus;
  startingStack: number;
  currentStack: number;
  /** Total chips committed across all streets this hand */
  totalCommitted: number;
  /** Chips committed on the current street only */
  streetCommitted: number;
  holeCards: CardIndex[];
  hasActedThisStreet: boolean;
  /** How the user knows about this seat's cards. Default: "hidden" for villains, "revealed" for hero */
  cardVisibility: CardVisibility;
}

// ═══════════════════════════════════════════════════════
// GAME ACTIONS
// ═══════════════════════════════════════════════════════

export type ActionType = "fold" | "check" | "call" | "bet" | "raise" | "all_in";

export interface GameAction {
  seatIndex: number;
  position: Position;
  street: Street;
  actionType: ActionType;
  /** Chip amount for bet/raise/call/all_in. Undefined for fold/check. */
  amount?: number;
  isAllIn: boolean;
  /** Monotonically increasing sequence number within the hand */
  sequence: number;
}

// ═══════════════════════════════════════════════════════
// POT STATE
// ═══════════════════════════════════════════════════════

export interface SidePot {
  amount: number;
  eligiblePlayers: number[];
  explanation: string;
}

export interface PotState {
  mainPot: number;
  sidePots: SidePot[];
  /** Total of mainPot + all sidePots */
  total: number;
  explanation: string;
}

// ═══════════════════════════════════════════════════════
// GAME PHASE
// ═══════════════════════════════════════════════════════

export type GamePhase =
  | "blinds_posted"
  | "preflop"
  | "flop"
  | "turn"
  | "river"
  | "showdown"
  | "complete";

// ═══════════════════════════════════════════════════════
// GAME STATE — the full mutable hand state
// ═══════════════════════════════════════════════════════

export interface GameState {
  numPlayers: number;
  dealerSeatIndex: number;
  blinds: BlindStructure;

  handNumber: number;
  /** Remaining deck (mutable — cards dealt are spliced out) */
  deck: CardIndex[];
  communityCards: CardIndex[];

  players: PlayerState[];

  currentStreet: Street;
  /** Index into players[] for whose turn it is (null = no action pending) */
  activePlayerIndex: number | null;
  /** Index into players[] who last raised/bet (null = no aggressor yet) */
  lastAggressorIndex: number | null;

  /** Current highest bet on this street */
  currentBet: number;
  /** Size of the last raise increment (resets each street to BB) */
  minRaiseSize: number;
  /** Number of raises on the current street */
  raiseCount: number;

  pot: PotState;
  actionHistory: GameAction[];
  phase: GamePhase;
}

// ═══════════════════════════════════════════════════════
// LEGAL ACTIONS — what the active player can do
// ═══════════════════════════════════════════════════════

export interface LegalActions {
  seatIndex: number;
  position: Position;

  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  callAmount: number;

  canBet: boolean;
  betMin: number;
  betMax: number;

  canRaise: boolean;
  raiseMin: number;
  raiseMax: number;

  /** True if calling would put the player all-in */
  isCallAllIn: boolean;
  explanation: string;
}

// ═══════════════════════════════════════════════════════
// STATE TRANSITION
// ═══════════════════════════════════════════════════════

export interface StateTransitionResult {
  state: GameState;
  explanation: string;
}

// ═══════════════════════════════════════════════════════
// HAND CONFIG — input to initializeHand
// ═══════════════════════════════════════════════════════

/** Per-seat card override — assign specific hole cards instead of random deal */
export interface CardOverride {
  seatIndex: number;
  cards: CardIndex[];        // exactly 2
  visibility: CardVisibility;
}

export interface HandConfig {
  numPlayers: number;
  dealerSeatIndex: number;
  blinds: BlindStructure;
  /** Starting stack for each seat (indexed by seat number) */
  startingStacks: number[];
  handNumber?: number;
  /** Optional seed for deterministic shuffle */
  seed?: number;
  /** Override specific seats' hole cards instead of random deal */
  cardOverrides?: CardOverride[];
  /** Override community cards (e.g., user picked flop manually) */
  communityOverrides?: CardIndex[];
}
