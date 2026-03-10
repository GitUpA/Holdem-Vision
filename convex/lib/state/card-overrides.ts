/**
 * Card override utilities — apply specific hole/community cards to a GameState.
 * Pure TypeScript, zero Convex imports.
 *
 * Used when:
 * - User manually assigns villain hole cards (study/review mode)
 * - User overrides community cards (what-if exploration)
 * - Reconstructing a known hand (all cards specified)
 */
import type { CardIndex, Street } from "../types/cards";
import type { GameState, CardOverride, CardVisibility } from "./game-state";

// ═══════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════

/**
 * Collect all cards currently in use across the game state.
 */
export function allUsedCards(state: GameState): Set<CardIndex> {
  const used = new Set<CardIndex>();
  for (const p of state.players) {
    for (const c of p.holeCards) used.add(c);
  }
  for (const c of state.communityCards) used.add(c);
  return used;
}

/**
 * Validate that a set of card overrides has no collisions.
 * Returns null if valid, or an error message describing the collision.
 *
 * Note: Cards can come from other players' hands — applyCardOverrides handles
 * the swap by dealing replacements from the deck. The only true collisions are:
 * - Two overrides sharing the same card
 * - An override card matching a community card
 */
export function validateCardOverrides(
  state: GameState,
  overrides: CardOverride[],
): string | null {
  const overrideCards = new Map<CardIndex, number>(); // card → seatIndex

  // Community cards are immovable — override cards cannot be community cards
  const communitySet = new Set(state.communityCards);

  for (const ov of overrides) {
    if (ov.cards.length !== 2) {
      return `Seat ${ov.seatIndex}: must specify exactly 2 cards, got ${ov.cards.length}`;
    }
    if (ov.cards[0] === ov.cards[1]) {
      return `Seat ${ov.seatIndex}: duplicate card ${ov.cards[0]}`;
    }
    for (const c of ov.cards) {
      if (communitySet.has(c)) {
        return `Card ${c} conflicts: assigned to seat ${ov.seatIndex} but already in community`;
      }
      const existingSeat = overrideCards.get(c);
      if (existingSeat !== undefined) {
        return `Card ${c} conflicts: assigned to both seat ${existingSeat} and seat ${ov.seatIndex}`;
      }
      overrideCards.set(c, ov.seatIndex);
    }
  }

  return null;
}

/**
 * Validate community card overrides have no collisions.
 */
export function validateCommunityOverride(
  state: GameState,
  cards: CardIndex[],
): string | null {
  if (cards.length < 3 || cards.length > 5) {
    return `Community override must have 3-5 cards, got ${cards.length}`;
  }

  // Check for duplicates within the override
  const seen = new Set<CardIndex>();
  for (const c of cards) {
    if (seen.has(c)) return `Duplicate community card: ${c}`;
    seen.add(c);
  }

  // Check against player hole cards
  for (const p of state.players) {
    for (const c of p.holeCards) {
      if (seen.has(c)) {
        return `Community card ${c} conflicts with seat ${p.seatIndex} hole cards`;
      }
    }
  }

  return null;
}

// ═══════════════════════════════════════════════════════
// APPLY OVERRIDES
// ═══════════════════════════════════════════════════════

/**
 * Apply hole card overrides to a game state.
 *
 * - Replaces the target player's hole cards with the specified cards
 * - Returns replaced cards to the deck
 * - Removes override cards from wherever they currently are (deck or other players)
 * - If an override card was in another player's hand, deals a replacement from deck
 * - Validates no card collisions
 *
 * Returns a new GameState (does not mutate input).
 */
export function applyCardOverrides(
  state: GameState,
  overrides: CardOverride[],
): GameState {
  if (overrides.length === 0) return state;

  const error = validateCardOverrides(state, overrides);
  if (error) throw new Error(`Card override error: ${error}`);

  // Deep clone relevant mutable parts
  const newState: GameState = {
    ...state,
    deck: [...state.deck],
    communityCards: [...state.communityCards],
    players: state.players.map((p) => ({
      ...p,
      holeCards: [...p.holeCards],
    })),
    pot: { ...state.pot, sidePots: state.pot.sidePots.map((sp) => ({ ...sp, eligiblePlayers: [...sp.eligiblePlayers] })) },
    actionHistory: [...state.actionHistory],
  };

  for (const ov of overrides) {
    const player = newState.players[ov.seatIndex];
    if (!player) throw new Error(`Invalid seat index: ${ov.seatIndex}`);

    // Return current hole cards to deck
    newState.deck.push(...player.holeCards);

    // Remove each override card from wherever it is
    for (const card of ov.cards) {
      const deckIdx = newState.deck.indexOf(card);
      if (deckIdx !== -1) {
        newState.deck.splice(deckIdx, 1);
      } else {
        // Must be in another player's hand
        for (const other of newState.players) {
          if (other.seatIndex === ov.seatIndex) continue;
          const handIdx = other.holeCards.indexOf(card);
          if (handIdx !== -1) {
            // Replace with card from deck
            if (newState.deck.length === 0) {
              throw new Error("No cards left in deck to replace swapped card");
            }
            other.holeCards[handIdx] = newState.deck.pop()!;
            break;
          }
        }
      }
    }

    // Assign override cards
    player.holeCards = [...ov.cards];
    player.cardVisibility = ov.visibility;
  }

  return newState;
}

/**
 * Apply community card overrides to a game state.
 *
 * - Sets the community cards to exactly the specified cards
 * - Returns any previously dealt community cards to the deck
 * - Removes override cards from the deck
 * - Updates the street based on the number of community cards:
 *   3 → flop, 4 → turn, 5 → river
 *
 * Returns a new GameState (does not mutate input).
 */
export function applyCommunityOverride(
  state: GameState,
  cards: CardIndex[],
): GameState {
  const error = validateCommunityOverride(state, cards);
  if (error) throw new Error(`Community override error: ${error}`);

  // Deep clone relevant mutable parts
  const newState: GameState = {
    ...state,
    deck: [...state.deck],
    communityCards: [],
    players: state.players.map((p) => ({
      ...p,
      holeCards: [...p.holeCards],
    })),
    pot: { ...state.pot, sidePots: state.pot.sidePots.map((sp) => ({ ...sp, eligiblePlayers: [...sp.eligiblePlayers] })) },
    actionHistory: [...state.actionHistory],
  };

  // Return old community cards to deck
  newState.deck.push(...state.communityCards);

  // Remove new community cards from deck
  for (const card of cards) {
    const deckIdx = newState.deck.indexOf(card);
    if (deckIdx !== -1) {
      newState.deck.splice(deckIdx, 1);
    }
    // If card not in deck, it shouldn't be in any player's hand
    // (validated above)
  }

  // Set new community cards
  newState.communityCards = [...cards];

  // Update street based on community card count
  if (cards.length >= 5) {
    newState.currentStreet = "river";
  } else if (cards.length === 4) {
    newState.currentStreet = "turn";
  } else {
    newState.currentStreet = "flop";
  }

  return newState;
}

/**
 * Set a single player's card visibility without changing their cards.
 */
export function setCardVisibility(
  state: GameState,
  seatIndex: number,
  visibility: CardVisibility,
): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.seatIndex === seatIndex ? { ...p, cardVisibility: visibility } : p,
    ),
  };
}
