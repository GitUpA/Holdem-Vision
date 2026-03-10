/**
 * Test helpers for game state tests.
 * Provides factories for creating test hands and running action sequences.
 */
import type { HandConfig } from "../../convex/lib/state/game-state";
import type { ActionType } from "../../convex/lib/state/game-state";
import { initializeHand, applyAction } from "../../convex/lib/state/state-machine";

/**
 * Create a standard test hand config.
 */
export function createTestConfig(
  overrides: Partial<HandConfig> = {},
): HandConfig {
  const numPlayers = overrides.numPlayers ?? 6;
  return {
    numPlayers,
    dealerSeatIndex: 0,
    blinds: { small: 1, big: 2 },
    startingStacks: Array(numPlayers).fill(1000),
    handNumber: 1,
    seed: 42, // deterministic
    ...overrides,
  };
}

/**
 * Create a heads-up test hand config.
 */
export function createHeadsUpConfig(
  overrides: Partial<HandConfig> = {},
): HandConfig {
  return createTestConfig({
    numPlayers: 2,
    startingStacks: [1000, 1000],
    ...overrides,
  });
}

/**
 * Initialize a hand and run a sequence of actions.
 * Actions format: [seatIndex, actionType, amount?]
 */
export function runActions(
  config: HandConfig,
  actions: [number, ActionType, number?][],
) {
  let { state } = initializeHand(config);

  for (const [seat, action, amount] of actions) {
    const result = applyAction(state, seat, action, amount);
    state = result.state;
  }

  return state;
}
