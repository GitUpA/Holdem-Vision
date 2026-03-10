import { describe, it, expect } from "vitest";
import {
  applyCardOverrides,
  applyCommunityOverride,
  setCardVisibility,
  validateCardOverrides,
  validateCommunityOverride,
  allUsedCards,
} from "../../convex/lib/state/card-overrides";
import { initializeHand } from "../../convex/lib/state/state-machine";
import { createTestConfig, createHeadsUpConfig } from "./helpers";
import type { CardIndex } from "../../convex/lib/types/cards";

// ═══════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════

function setupHand(seed = 42, numPlayers = 6) {
  const config = createTestConfig({ seed, numPlayers, startingStacks: Array(numPlayers).fill(1000) });
  return initializeHand(config).state;
}

function setupHeadsUp(seed = 42) {
  const config = createHeadsUpConfig({ seed });
  return initializeHand(config).state;
}

// ═══════════════════════════════════════════════════════
// allUsedCards
// ═══════════════════════════════════════════════════════

describe("allUsedCards", () => {
  it("returns all dealt hole cards", () => {
    const state = setupHand();
    const used = allUsedCards(state);

    // 6 players × 2 cards = 12 cards in use
    expect(used.size).toBe(12);
    for (const p of state.players) {
      for (const c of p.holeCards) {
        expect(used.has(c)).toBe(true);
      }
    }
  });

  it("includes community cards", () => {
    const state = setupHand();
    // Use cards from the deck (not already dealt) as community cards
    const communityCards = [state.deck[0], state.deck[1], state.deck[2]];
    const withCommunity = { ...state, communityCards };
    const used = allUsedCards(withCommunity);
    expect(used.size).toBe(15); // 12 hole + 3 community
  });
});

// ═══════════════════════════════════════════════════════
// validateCardOverrides
// ═══════════════════════════════════════════════════════

describe("validateCardOverrides", () => {
  it("returns null for valid overrides", () => {
    const state = setupHand();
    // Pick two cards from the deck (not in any hand)
    const card1 = state.deck[0];
    const card2 = state.deck[1];

    const result = validateCardOverrides(state, [
      { seatIndex: 0, cards: [card1, card2], visibility: "assigned" },
    ]);
    expect(result).toBeNull();
  });

  it("rejects wrong number of cards", () => {
    const state = setupHand();
    const result = validateCardOverrides(state, [
      { seatIndex: 0, cards: [state.deck[0]] as CardIndex[], visibility: "assigned" },
    ]);
    expect(result).toContain("exactly 2 cards");
  });

  it("rejects duplicate cards in same override", () => {
    const state = setupHand();
    const card = state.deck[0];
    const result = validateCardOverrides(state, [
      { seatIndex: 0, cards: [card, card], visibility: "assigned" },
    ]);
    expect(result).toContain("duplicate");
  });

  it("rejects collision between two overrides", () => {
    const state = setupHand();
    const card = state.deck[0];
    const result = validateCardOverrides(state, [
      { seatIndex: 0, cards: [card, state.deck[1]], visibility: "assigned" },
      { seatIndex: 1, cards: [card, state.deck[2]], visibility: "assigned" },
    ]);
    expect(result).toContain("conflicts");
  });
});

// ═══════════════════════════════════════════════════════
// applyCardOverrides
// ═══════════════════════════════════════════════════════

describe("applyCardOverrides", () => {
  it("replaces a player's hole cards", () => {
    const state = setupHand();
    const oldCards = [...state.players[0].holeCards];
    const newCard1 = state.deck[0];
    const newCard2 = state.deck[1];

    const newState = applyCardOverrides(state, [
      { seatIndex: 0, cards: [newCard1, newCard2], visibility: "revealed" },
    ]);

    expect(newState.players[0].holeCards).toEqual([newCard1, newCard2]);
    expect(newState.players[0].cardVisibility).toBe("revealed");
    // Old cards should be back in the deck
    expect(newState.deck).toContain(oldCards[0]);
    expect(newState.deck).toContain(oldCards[1]);
  });

  it("does not mutate original state", () => {
    const state = setupHand();
    const originalCards = [...state.players[0].holeCards];
    const originalDeckLen = state.deck.length;

    applyCardOverrides(state, [
      { seatIndex: 0, cards: [state.deck[0], state.deck[1]], visibility: "assigned" },
    ]);

    expect(state.players[0].holeCards).toEqual(originalCards);
    expect(state.deck.length).toBe(originalDeckLen);
  });

  it("handles card swap between players", () => {
    const state = setupHeadsUp();
    // Assign seat 0's cards to come from seat 1's hand
    const seat1Cards = [...state.players[1].holeCards];

    const newState = applyCardOverrides(state, [
      { seatIndex: 0, cards: [seat1Cards[0], seat1Cards[1]], visibility: "revealed" },
    ]);

    // Seat 0 should have seat 1's original cards
    expect(newState.players[0].holeCards).toEqual(seat1Cards);
    // Seat 1 should have replacement cards (not the same as before)
    expect(newState.players[1].holeCards).not.toEqual(seat1Cards);
    // Seat 1 should still have 2 cards
    expect(newState.players[1].holeCards).toHaveLength(2);
  });

  it("preserves total card count (deck + hands = 52)", () => {
    const state = setupHand();
    const totalBefore = state.deck.length + state.players.reduce((sum, p) => sum + p.holeCards.length, 0);

    const newState = applyCardOverrides(state, [
      { seatIndex: 0, cards: [state.deck[0], state.deck[1]], visibility: "assigned" },
      { seatIndex: 1, cards: [state.deck[2], state.deck[3]], visibility: "assigned" },
    ]);

    const totalAfter = newState.deck.length + newState.players.reduce((sum, p) => sum + p.holeCards.length, 0);
    expect(totalAfter).toBe(totalBefore);
  });

  it("returns state unchanged for empty overrides", () => {
    const state = setupHand();
    const result = applyCardOverrides(state, []);
    expect(result).toBe(state); // same reference — no copy needed
  });

  it("throws on colliding overrides (same card in two overrides)", () => {
    const state = setupHand();
    const card = state.deck[0];
    expect(() =>
      applyCardOverrides(state, [
        { seatIndex: 0, cards: [card, state.deck[1]], visibility: "assigned" },
        { seatIndex: 1, cards: [card, state.deck[2]], visibility: "assigned" },
      ]),
    ).toThrow("conflicts");
  });
});

// ═══════════════════════════════════════════════════════
// validateCommunityOverride
// ═══════════════════════════════════════════════════════

describe("validateCommunityOverride", () => {
  it("returns null for valid 3-card flop", () => {
    const state = setupHand();
    const result = validateCommunityOverride(state, [
      state.deck[0], state.deck[1], state.deck[2],
    ]);
    expect(result).toBeNull();
  });

  it("rejects fewer than 3 cards", () => {
    const state = setupHand();
    const result = validateCommunityOverride(state, [state.deck[0], state.deck[1]]);
    expect(result).toContain("3-5 cards");
  });

  it("rejects duplicate community cards", () => {
    const state = setupHand();
    const card = state.deck[0];
    const result = validateCommunityOverride(state, [card, card, state.deck[1]]);
    expect(result).toContain("Duplicate");
  });

  it("rejects collision with player hole cards", () => {
    const state = setupHand();
    const playerCard = state.players[0].holeCards[0];
    const result = validateCommunityOverride(state, [
      playerCard, state.deck[0], state.deck[1],
    ]);
    expect(result).toContain("conflicts");
  });
});

// ═══════════════════════════════════════════════════════
// applyCommunityOverride
// ═══════════════════════════════════════════════════════

describe("applyCommunityOverride", () => {
  it("sets community cards to flop", () => {
    const state = setupHand();
    const flopCards: CardIndex[] = [state.deck[0], state.deck[1], state.deck[2]];

    const newState = applyCommunityOverride(state, flopCards);

    expect(newState.communityCards).toEqual(flopCards);
    expect(newState.currentStreet).toBe("flop");
    // Flop cards should not be in deck
    for (const c of flopCards) {
      expect(newState.deck).not.toContain(c);
    }
  });

  it("sets community cards to turn (4 cards)", () => {
    const state = setupHand();
    const cards: CardIndex[] = [state.deck[0], state.deck[1], state.deck[2], state.deck[3]];

    const newState = applyCommunityOverride(state, cards);

    expect(newState.communityCards).toEqual(cards);
    expect(newState.currentStreet).toBe("turn");
  });

  it("sets community cards to river (5 cards)", () => {
    const state = setupHand();
    const cards: CardIndex[] = [state.deck[0], state.deck[1], state.deck[2], state.deck[3], state.deck[4]];

    const newState = applyCommunityOverride(state, cards);

    expect(newState.communityCards).toEqual(cards);
    expect(newState.currentStreet).toBe("river");
  });

  it("does not mutate original state", () => {
    const state = setupHand();
    const originalCommunity = [...state.communityCards];
    const originalDeckLen = state.deck.length;

    applyCommunityOverride(state, [state.deck[0], state.deck[1], state.deck[2]]);

    expect(state.communityCards).toEqual(originalCommunity);
    expect(state.deck.length).toBe(originalDeckLen);
  });

  it("preserves total card count", () => {
    const state = setupHand();
    const totalBefore = state.deck.length +
      state.communityCards.length +
      state.players.reduce((sum, p) => sum + p.holeCards.length, 0);

    const newState = applyCommunityOverride(state, [state.deck[0], state.deck[1], state.deck[2]]);

    const totalAfter = newState.deck.length +
      newState.communityCards.length +
      newState.players.reduce((sum, p) => sum + p.holeCards.length, 0);

    expect(totalAfter).toBe(totalBefore);
  });
});

// ═══════════════════════════════════════════════════════
// setCardVisibility
// ═══════════════════════════════════════════════════════

describe("setCardVisibility", () => {
  it("changes visibility for a specific seat", () => {
    const state = setupHand();
    expect(state.players[0].cardVisibility).toBe("hidden");

    const newState = setCardVisibility(state, 0, "revealed");
    expect(newState.players[0].cardVisibility).toBe("revealed");
    // Others unchanged
    expect(newState.players[1].cardVisibility).toBe("hidden");
  });

  it("does not mutate original state", () => {
    const state = setupHand();
    setCardVisibility(state, 0, "revealed");
    expect(state.players[0].cardVisibility).toBe("hidden");
  });
});
