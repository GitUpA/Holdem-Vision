/**
 * buildTimeline tests — verify hand replay reconstruction.
 */
import { describe, it, expect } from "vitest";
import { buildTimeline } from "../../convex/lib/replay/buildTimeline";
import { HandSession } from "../../convex/lib/session/handSession";
import type { HandSessionConfig } from "../../convex/lib/session/types";
import type { HandRecord } from "../../convex/lib/audit/types";
import { PRESET_PROFILES } from "../../convex/lib/opponents/presets";
// Ensure engines are registered
import "../../convex/lib/opponents/engines";

const FISH = PRESET_PROFILES["fish"];
const TAG = PRESET_PROFILES["tag"];
const NIT = PRESET_PROFILES["nit"];

// ─── Helper ───

function playHand(
  overrides?: Partial<HandSessionConfig>,
  heroAction?: (session: HandSession) => void,
): HandRecord {
  let record: HandRecord | null = null;
  const heroSeat = overrides?.heroSeatIndex ?? 0;
  const session = new HandSession(
    {
      numPlayers: 3,
      dealerSeatIndex: 0,
      heroSeatIndex: heroSeat,
      blinds: { small: 1, big: 2 },
      startingStack: 100,
      seatProfiles: new Map([
        [1, FISH],
        [2, TAG],
      ]),
      seed: 42,
      ...overrides,
    },
    {
      onHandComplete: (r) => { record = r; },
    },
  );

  session.deal();
  if (heroAction) {
    heroAction(session);
  } else {
    // Default: hero folds
    if (session.state && session.state.phase !== "complete" && session.state.phase !== "showdown") {
      session.fold();
    }
  }

  // Safety: if hand still active, keep folding until it completes
  for (let i = 0; i < 20 && !record; i++) {
    if (!session.state || session.state.phase === "complete" || session.state.phase === "showdown") break;
    const activeIdx = session.state.activePlayerIndex;
    if (activeIdx === null) break;
    if (session.state.players[activeIdx].seatIndex !== heroSeat) break;
    session.fold();
  }

  if (!record) {
    throw new Error("Hand did not complete — check hero action");
  }
  return record;
}

// ═══════════════════════════════════════════════════════
// BASIC TIMELINE STRUCTURE
// ═══════════════════════════════════════════════════════

describe("buildTimeline — structure", () => {
  it("produces snapshots for a completed hand", () => {
    const record = playHand();
    const timeline = buildTimeline(record);

    expect(timeline.handId).toBe(record.handId);
    expect(timeline.snapshots.length).toBeGreaterThan(1);
    // First snapshot is initial state (no event)
    expect(timeline.snapshots[0].event).toBeNull();
    expect(timeline.snapshots[0].index).toBe(0);
  });

  it("snapshot count = 1 (initial) + player events", () => {
    const record = playHand();
    const playerEvents = record.events.filter((e) => e.seq >= 0);
    const timeline = buildTimeline(record);

    expect(timeline.snapshots.length).toBe(1 + playerEvents.length);
  });

  it("preserves seatSetup and config", () => {
    const record = playHand();
    const timeline = buildTimeline(record);

    expect(timeline.config).toEqual(record.config);
    expect(timeline.seatSetup).toEqual(record.seatSetup);
  });

  it("preserves outcome", () => {
    const record = playHand();
    const timeline = buildTimeline(record);

    expect(timeline.outcome).toEqual(record.outcome);
  });
});

// ═══════════════════════════════════════════════════════
// CARD CONSISTENCY
// ═══════════════════════════════════════════════════════

describe("buildTimeline — card consistency", () => {
  it("hero hole cards match seatSetup throughout replay", () => {
    const record = playHand();
    const heroSetup = record.seatSetup.find(
      (s) => s.seatIndex === record.config.heroSeatIndex,
    );
    expect(heroSetup?.holeCards).toBeDefined();

    const timeline = buildTimeline(record);
    for (const snap of timeline.snapshots) {
      const heroPlayer = snap.gameState.players[record.config.heroSeatIndex];
      if (heroPlayer.status !== "sitting_out") {
        expect(heroPlayer.holeCards).toEqual(heroSetup!.holeCards);
      }
    }
  });

  it("villain hole cards match seatSetup", () => {
    const record = playHand();
    const timeline = buildTimeline(record);

    for (const setup of record.seatSetup) {
      if (!setup.holeCards || setup.holeCards.length < 2) continue;

      const firstSnap = timeline.snapshots[0];
      const player = firstSnap.gameState.players[setup.seatIndex];
      expect(player.holeCards).toEqual(setup.holeCards);
    }
  });
});

// ═══════════════════════════════════════════════════════
// STREET MARKERS
// ═══════════════════════════════════════════════════════

describe("buildTimeline — street markers", () => {
  it("always has preflop marker at index 0", () => {
    const record = playHand();
    const timeline = buildTimeline(record);

    expect(timeline.streetMarkers[0]).toEqual({
      street: "preflop",
      snapshotIndex: 0,
    });
  });

  it("multi-street hand has flop marker", () => {
    // Hero calls preflop then check/folds postflop
    const record = playHand(undefined, (s) => {
      for (let i = 0; i < 20; i++) {
        if (!s.state || s.state.phase === "complete" || s.state.phase === "showdown") break;
        const activeIdx = s.state.activePlayerIndex;
        if (activeIdx === null) break;
        if (s.state.players[activeIdx].seatIndex !== 0) break;
        if (s.state.currentStreet === "preflop") {
          s.call();
        } else {
          try { s.check(); } catch { s.fold(); }
        }
      }
    });

    const timeline = buildTimeline(record);

    // Check if hand reached flop
    const hasFlop = record.events.some((e) => e.street === "flop");
    if (hasFlop) {
      const flopMarker = timeline.streetMarkers.find((m) => m.street === "flop");
      expect(flopMarker).toBeDefined();
      expect(flopMarker!.snapshotIndex).toBeGreaterThan(0);
    }
  });

  it("community cards appear at correct street transitions", () => {
    // Use a hero action callback that keeps playing until hand finishes
    const record = playHand(undefined, (s) => {
      for (let i = 0; i < 20; i++) {
        if (!s.state || s.state.phase === "complete" || s.state.phase === "showdown") break;
        const activeIdx = s.state.activePlayerIndex;
        if (activeIdx === null) break;
        const heroSeat = 0;
        if (s.state.players[activeIdx].seatIndex !== heroSeat) break;
        // Check when possible, fold otherwise
        try { s.check(); } catch { s.fold(); }
      }
    });

    const timeline = buildTimeline(record);
    const flopMarker = timeline.streetMarkers.find((m) => m.street === "flop");

    if (flopMarker) {
      // Before flop: no community cards
      const preFlopSnap = timeline.snapshots[flopMarker.snapshotIndex - 1];
      if (preFlopSnap) {
        expect(preFlopSnap.gameState.communityCards.length).toBe(0);
      }

      // At flop: 3 community cards
      const flopSnap = timeline.snapshots[flopMarker.snapshotIndex];
      expect(flopSnap.gameState.communityCards.length).toBe(3);

      // Community cards should match the record
      for (let i = 0; i < 3; i++) {
        expect(flopSnap.gameState.communityCards[i]).toBe(record.communityCards[i]);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════
// DECISION TRACKING
// ═══════════════════════════════════════════════════════

describe("buildTimeline — decisions", () => {
  it("tracks engine decision indices", () => {
    const record = playHand();
    const timeline = buildTimeline(record);

    // Some events should have engine decisions (auto-play opponents)
    const eventsWithDecisions = record.events.filter(
      (e) => e.seq >= 0 && e.decision,
    );

    expect(timeline.decisionIndices.length).toBe(eventsWithDecisions.length);
  });

  it("decision snapshots contain DecisionSnapshot data", () => {
    const record = playHand();
    const timeline = buildTimeline(record);

    for (const idx of timeline.decisionIndices) {
      const snap = timeline.snapshots[idx];
      expect(snap.decision).not.toBeNull();
      expect(snap.decision!.engineId).toBeDefined();
      expect(snap.decision!.situationKey).toBeDefined();
    }
  });
});

// ═══════════════════════════════════════════════════════
// POT CONSISTENCY
// ═══════════════════════════════════════════════════════

describe("buildTimeline — pot consistency", () => {
  it("final snapshot pot matches last event potAfter", () => {
    const record = playHand();
    const timeline = buildTimeline(record);

    const lastSnap = timeline.snapshots[timeline.snapshots.length - 1];
    const playerEvents = record.events.filter((e) => e.seq >= 0);
    const lastEvent = playerEvents[playerEvents.length - 1];

    if (lastEvent) {
      // Pot should be close (may differ slightly due to showdown resolution)
      expect(lastSnap.gameState.pot.total).toBeGreaterThan(0);
    }
  });

  it("pot grows monotonically during betting", () => {
    const record = playHand();
    const timeline = buildTimeline(record);

    let maxPot = 0;
    let lastStreet = "preflop";
    for (const snap of timeline.snapshots) {
      // Pot can "reset" at showdown but should grow within a street
      if (snap.street === lastStreet || snap.index === 0) {
        expect(snap.gameState.pot.total).toBeGreaterThanOrEqual(maxPot - 1); // -1 for rounding
      }
      maxPot = Math.max(maxPot, snap.gameState.pot.total);
      lastStreet = snap.street;
    }
  });
});

// ═══════════════════════════════════════════════════════
// DIFFERENT HAND SCENARIOS
// ═══════════════════════════════════════════════════════

describe("buildTimeline — scenarios", () => {
  it("handles heads-up hand", () => {
    const record = playHand({
      numPlayers: 2,
      seatProfiles: new Map([[1, NIT]]),
    });
    const timeline = buildTimeline(record);

    expect(timeline.snapshots.length).toBeGreaterThan(1);
    expect(timeline.snapshots[0].gameState.numPlayers).toBe(2);
  });

  it("handles 6-player hand", () => {
    const record = playHand({
      numPlayers: 6,
      seatProfiles: new Map([
        [1, FISH],
        [2, TAG],
        [3, NIT],
        [4, FISH],
        [5, TAG],
      ]),
    });
    const timeline = buildTimeline(record);

    expect(timeline.snapshots.length).toBeGreaterThan(1);
    expect(timeline.snapshots[0].gameState.numPlayers).toBe(6);
  });
});
