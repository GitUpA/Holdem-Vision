/**
 * Timeline Builder — transforms a HandRecord into a ReplayTimeline.
 *
 * Replays the hand through the state machine to reconstruct exact
 * GameState at every action. Uses card overrides from seatSetup
 * and stacks the deck with community cards.
 *
 * Pure TypeScript, zero Convex imports.
 */
import type { HandRecord } from "../audit/types";
import type { ReplayTimeline, ReplaySnapshot } from "./types";
import type { HandConfig as GameHandConfig, CardOverride } from "../state/game-state";
import type { Street } from "../types/cards";
import { initializeHand, applyAction } from "../state/state-machine";

/**
 * Build a replay timeline from a completed HandRecord.
 *
 * Algorithm:
 * 1. Build cardOverrides from seatSetup hole cards
 * 2. Initialize hand via state machine
 * 3. Stack remaining deck with community cards at front
 * 4. Replay each event via applyAction, collecting snapshots
 */
export function buildTimeline(record: HandRecord): ReplayTimeline {
  // ── 1. Build card overrides from seatSetup ──
  const cardOverrides: CardOverride[] = [];
  for (const setup of record.seatSetup) {
    if (setup.holeCards && setup.holeCards.length === 2) {
      cardOverrides.push({
        seatIndex: setup.seatIndex,
        cards: [...setup.holeCards],
        visibility: setup.cardVisibility,
      });
    }
  }

  // ── 2. Initialize hand ──
  const gameConfig: GameHandConfig = {
    numPlayers: record.config.numPlayers,
    dealerSeatIndex: record.config.dealerSeatIndex,
    blinds: record.config.blinds,
    startingStacks: [...record.config.startingStacks],
    handNumber: 1,
    seed: 42, // Doesn't matter — we override all cards
    cardOverrides,
  };

  const { state: initialState } = initializeHand(gameConfig);

  // ── 3. Stack deck with community cards at front ──
  // deal() takes from front (splice(0, count)), so community cards
  // must be at indices 0..4 of the remaining deck.
  if (record.communityCards.length > 0) {
    // Remove community cards from wherever they are in the deck
    for (const card of record.communityCards) {
      const idx = initialState.deck.indexOf(card);
      if (idx !== -1) {
        initialState.deck.splice(idx, 1);
      }
    }
    // Place them at the front in order
    initialState.deck.unshift(...record.communityCards);
  }

  // ── 4. Build snapshots ──
  const snapshots: ReplaySnapshot[] = [];
  const streetMarkers: { street: Street; snapshotIndex: number }[] = [
    { street: "preflop", snapshotIndex: 0 },
  ];
  const decisionIndices: number[] = [];

  // Snapshot 0: initial state (after blinds, before any player action)
  snapshots.push({
    index: 0,
    gameState: structuredClone(initialState),
    event: null,
    decision: null,
    street: "preflop",
  });

  // Filter out system blind events (negative seq) — initializeHand already posted blinds
  const playerEvents = record.events.filter((e) => e.seq >= 0);

  let currentState = initialState;
  let lastStreet: Street = "preflop";

  for (const event of playerEvents) {
    // Apply the action
    const result = applyAction(
      currentState,
      event.seatIndex,
      event.actionType,
      event.amount,
    );
    currentState = result.state;

    const snapshotIndex = snapshots.length;

    // Track street changes
    if (currentState.currentStreet !== lastStreet) {
      streetMarkers.push({
        street: currentState.currentStreet,
        snapshotIndex,
      });
      lastStreet = currentState.currentStreet;
    }

    // Track decisions
    if (event.decision) {
      decisionIndices.push(snapshotIndex);
    }

    snapshots.push({
      index: snapshotIndex,
      gameState: structuredClone(currentState),
      event,
      decision: event.decision ?? null,
      street: currentState.currentStreet,
    });
  }

  return {
    handId: record.handId,
    config: record.config,
    seatSetup: record.seatSetup,
    snapshots,
    streetMarkers,
    decisionIndices,
    outcome: record.outcome,
  };
}
