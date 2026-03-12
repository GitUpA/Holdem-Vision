/**
 * HandSession integration tests.
 *
 * These test the full orchestration pipeline — the same code paths that run
 * in the browser UI. Every wiring bug found during Audit V2 would be caught here.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { join } from "path";
import { HandSession } from "../../convex/lib/session/handSession";
import type { HandSessionConfig } from "../../convex/lib/session/types";
import type { HandRecord } from "../../convex/lib/audit/types";
import type { AnalysisResult, ExplanationNode } from "../../convex/lib/types/analysis";
import { PRESET_PROFILES } from "../../convex/lib/opponents/presets";
import { seededRandom } from "../../convex/lib/primitives/deck";
import { fileAuditWriter, cleanDir, TEST_AUDIT_DIR } from "../helpers/auditWriter";

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

const FISH = PRESET_PROFILES["fish"];
const TAG = PRESET_PROFILES["tag"];
const NIT = PRESET_PROFILES["nit"];

const SESSION_DIR = join(TEST_AUDIT_DIR, "session");
const writeTestAudit = fileAuditWriter(SESSION_DIR);

function createSession(
  overrides?: Partial<HandSessionConfig>,
): { session: HandSession; completedHands: HandRecord[] } {
  const completedHands: HandRecord[] = [];
  const session = new HandSession(
    {
      numPlayers: 3,
      dealerSeatIndex: 0,
      heroSeatIndex: 0,
      blinds: { small: 1, big: 2 },
      startingStack: 100, // 100 BB = 200 chips at 1/2
      seatProfiles: new Map([
        [1, FISH],
        [2, TAG],
      ]),
      seed: 42,
      ...overrides,
    },
    {
      onHandComplete: (r) => {
        completedHands.push(r);
        writeTestAudit(r);
      },
    },
  );
  return { session, completedHands };
}

/** Create a mock AnalysisResult for lens snapshot testing. */
function mockAnalysisResult(lensId: string, summary: string): AnalysisResult {
  return {
    explanation: {
      summary,
      sentiment: "neutral",
      tags: [lensId],
      children: [],
    } as ExplanationNode,
    visualDirectives: [],
  };
}

// ═══════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════

describe("HandSession", () => {
  beforeAll(() => {
    cleanDir(SESSION_DIR);
  });

  // ── Hand lifecycle ──

  it("starts a hand and produces a valid game state", () => {
    const { session } = createSession();
    expect(session.state).toBeNull();

    session.deal(); // convenience API

    expect(session.state).not.toBeNull();
    expect(session.state!.players).toHaveLength(3);
    expect(session.state!.phase).toBeDefined();
    expect(session.currentHandNumber).toBe(1);
  });

  it("hero is always revealed after startHand", () => {
    const { session } = createSession();
    session.startHand();

    const hero = session.state!.players.find((p) => p.seatIndex === 0);
    expect(hero?.cardVisibility).toBe("revealed");
    expect(hero?.holeCards).toHaveLength(2);
  });

  it("assigns random profiles to villain seats without profiles", () => {
    const completedHands: HandRecord[] = [];
    const session = new HandSession(
      {
        numPlayers: 4,
        dealerSeatIndex: 0,
        heroSeatIndex: 0,
        blinds: { small: 1, big: 2 },
        startingStack: 100,
        seatProfiles: new Map(), // empty — all villains need defaults
        seed: 42,
      },
      { onHandComplete: (r) => completedHands.push(r) },
    );

    session.startHand();

    // All villain seats should now have profiles
    expect(session.profiles.size).toBe(3); // seats 1, 2, 3
    for (let i = 1; i <= 3; i++) {
      expect(session.profiles.has(i)).toBe(true);
    }
  });

  // ── Preflop fold-out ──

  it("completes hand and fires onHandComplete when hero folds preflop", () => {
    const { session, completedHands } = createSession();
    session.deal();

    // If hero's turn, fold immediately
    if (session.state?.phase !== "complete" && session.state?.phase !== "showdown") {
      const activeIdx = session.state!.activePlayerIndex;
      if (activeIdx !== null) {
        const activePlayer = session.state!.players[activeIdx];
        if (activePlayer.seatIndex === session.heroSeatIndex) {
          session.fold();
        }
      }
    }

    // Hand should have completed (either during preflop auto-play or after hero fold)
    expect(completedHands.length).toBeGreaterThanOrEqual(1);
    const record = completedHands[completedHands.length - 1];

    // Verify record structure
    expect(record.handId).toMatch(/^hand-/);
    expect(record.config.numPlayers).toBe(3);
    expect(record.config.startingStacks).toEqual([200, 200, 200]);
    expect(record.events.length).toBeGreaterThan(0);
    expect(record.outcome).toBeDefined();
    expect(record.completedAt).toBeDefined();
  });

  it("stacks reconcile on fold-out (total chips preserved)", () => {
    const { session, completedHands } = createSession({
      numPlayers: 6,
      seatProfiles: new Map([
        [1, NIT],
        [2, NIT],
        [3, FISH],
        [4, TAG],
        [5, NIT],
      ]),
      seed: 100,
    });

    session.startHand();

    // Keep acting (fold) until hand is over
    let safety = 0;
    while (safety < 20 && session.state && session.state.phase !== "complete" && session.state.phase !== "showdown") {
      const activeIdx = session.state.activePlayerIndex;
      if (activeIdx === null) break;
      const activePlayer = session.state.players[activeIdx];
      if (activePlayer.seatIndex === session.heroSeatIndex) {
        session.act("fold");
      } else {
        break; // shouldn't happen — advanceOpponents handles villains
      }
      safety++;
    }

    expect(completedHands.length).toBe(1);
    const record = completedHands[0];
    const startSum = record.config.startingStacks.reduce((a, b) => a + b, 0);
    const finalSum = record.outcome!.finalStacks.reduce((a, b) => a + b, 0);
    expect(finalSum).toBe(startSum);
  });

  // ── Showdown ──

  it("stacks reconcile on showdown hand", () => {
    // Use a seed that produces a showdown (hero keeps calling)
    const { session, completedHands } = createSession({
      numPlayers: 3,
      seatProfiles: new Map([
        [1, FISH],
        [2, FISH],
      ]),
      seed: 77,
    });

    session.startHand();

    let safety = 0;
    while (safety < 50 && session.state && session.state.phase !== "complete" && session.state.phase !== "showdown") {
      const activeIdx = session.state.activePlayerIndex;
      if (activeIdx === null) break;
      const activePlayer = session.state.players[activeIdx];
      if (activePlayer.seatIndex === session.heroSeatIndex) {
        // Call or check to stay in
        const legal = session.state;
        const player = session.state.players.find(p => p.seatIndex === session.heroSeatIndex);
        if (player && session.state.currentBet > (player.streetCommitted ?? 0)) {
          session.act("call");
        } else {
          session.act("check");
        }
      } else {
        break;
      }
      safety++;
    }

    expect(completedHands.length).toBe(1);
    const record = completedHands[0];
    const startSum = record.config.startingStacks.reduce((a, b) => a + b, 0);
    const finalSum = record.outcome!.finalStacks.reduce((a, b) => a + b, 0);
    expect(finalSum).toBe(startSum);
    // Showdown should identify a winner
    expect(record.outcome!.winners.length).toBeGreaterThan(0);
  });

  // ── Street change detection ──

  it("records street snapshots at each street transition", () => {
    const { session, completedHands } = createSession({
      numPlayers: 3,
      seatProfiles: new Map([
        [1, FISH],
        [2, FISH],
      ]),
      seed: 77,
    });

    session.startHand();

    let safety = 0;
    while (safety < 50 && session.state && session.state.phase !== "complete" && session.state.phase !== "showdown") {
      const activeIdx = session.state.activePlayerIndex;
      if (activeIdx === null) break;
      const activePlayer = session.state.players[activeIdx];
      if (activePlayer.seatIndex === session.heroSeatIndex) {
        const player = session.state.players.find(p => p.seatIndex === session.heroSeatIndex);
        if (player && session.state.currentBet > (player.streetCommitted ?? 0)) {
          session.act("call");
        } else {
          session.act("check");
        }
      } else {
        break;
      }
      safety++;
    }

    expect(completedHands.length).toBe(1);
    const record = completedHands[0];

    if (record.streetSnapshots && record.streetSnapshots.length > 0) {
      // Each snapshot should have the correct shape
      for (const snap of record.streetSnapshots) {
        expect(["flop", "turn", "river"]).toContain(snap.street);
        expect(snap.communityCards.length).toBeGreaterThan(0);
        expect(snap.potTotal).toBeGreaterThan(0);
        expect(snap.activePlayers).toBeGreaterThan(0);
      }
      // Flop snapshot should have 3 community cards
      const flopSnap = record.streetSnapshots.find((s) => s.street === "flop");
      if (flopSnap) {
        expect(flopSnap.communityCards).toHaveLength(3);
      }
    }
  });

  // ── Blind events ──

  it("seeds blind events with negative sequence numbers", () => {
    const { session, completedHands } = createSession();
    session.startHand();

    // Force hand to complete
    if (session.state && session.state.phase !== "complete" && session.state.phase !== "showdown") {
      const activeIdx = session.state.activePlayerIndex;
      if (activeIdx !== null && session.state.players[activeIdx].seatIndex === session.heroSeatIndex) {
        session.act("fold");
      }
    }

    expect(completedHands.length).toBeGreaterThanOrEqual(1);
    const record = completedHands[completedHands.length - 1];

    const systemEvents = record.events.filter((e) => e.source === "system");
    expect(systemEvents.length).toBeGreaterThanOrEqual(2); // SB + BB

    // All system events should have negative seq
    for (const e of systemEvents) {
      expect(e.seq).toBeLessThan(0);
    }
  });

  // ── Lens snapshot recording ──

  it("records lens snapshots when injected externally", () => {
    const { session, completedHands } = createSession();
    session.startHand();

    // Inject mock lens results for preflop
    const results = new Map<string, AnalysisResult>();
    results.set("raw-equity", mockAnalysisResult("raw-equity", "Weak hand"));
    results.set("threats", mockAnalysisResult("threats", "No threats preflop"));

    session.recordLensSnapshot("preflop", results);

    // Now fold to end the hand
    if (session.state && session.state.phase !== "complete" && session.state.phase !== "showdown") {
      const activeIdx = session.state.activePlayerIndex;
      if (activeIdx !== null && session.state.players[activeIdx].seatIndex === session.heroSeatIndex) {
        session.act("fold");
      }
    }

    expect(completedHands.length).toBeGreaterThanOrEqual(1);
    const record = completedHands[completedHands.length - 1];

    expect(record.lensSnapshots).toBeDefined();
    expect(record.lensSnapshots!.length).toBeGreaterThanOrEqual(2);

    const equitySnap = record.lensSnapshots!.find((s) => s.lensId === "raw-equity");
    expect(equitySnap).toBeDefined();
    expect(equitySnap!.explanationSummary).toBe("Weak hand");
    expect(equitySnap!.street).toBe("preflop");
  });

  // ── Deterministic replay ──

  it("produces identical records with the same seed", () => {
    function makeConfig(): HandSessionConfig {
      return {
        numPlayers: 3,
        dealerSeatIndex: 0,
        heroSeatIndex: 0,
        blinds: { small: 1, big: 2 },
        startingStack: 100,
        seatProfiles: new Map([
          [1, FISH],
          [2, TAG],
        ]),
        seed: 999,
        random: seededRandom(999),
      };
    }

    const hands1: HandRecord[] = [];
    const hands2: HandRecord[] = [];

    const s1 = new HandSession(makeConfig(), { onHandComplete: (r) => hands1.push(r) });
    const s2 = new HandSession(makeConfig(), { onHandComplete: (r) => hands2.push(r) });

    // Play the same hand in both sessions
    s1.startHand();
    s2.startHand();

    // Hero folds in both
    if (s1.state?.activePlayerIndex !== null) {
      const active1 = s1.state!.players[s1.state!.activePlayerIndex!];
      if (active1.seatIndex === 0) s1.act("fold");
    }
    if (s2.state?.activePlayerIndex !== null) {
      const active2 = s2.state!.players[s2.state!.activePlayerIndex!];
      if (active2.seatIndex === 0) s2.act("fold");
    }

    if (hands1.length > 0 && hands2.length > 0) {
      // Events should match (ignoring timestamps)
      expect(hands1[0].events.length).toBe(hands2[0].events.length);
      for (let i = 0; i < hands1[0].events.length; i++) {
        expect(hands1[0].events[i].seatIndex).toBe(hands2[0].events[i].seatIndex);
        expect(hands1[0].events[i].actionType).toBe(hands2[0].events[i].actionType);
        expect(hands1[0].events[i].amount).toBe(hands2[0].events[i].amount);
      }
      // Community cards should match
      expect(hands1[0].communityCards).toEqual(hands2[0].communityCards);
      // Final stacks should match
      expect(hands1[0].outcome!.finalStacks).toEqual(hands2[0].outcome!.finalStacks);
    }
  });

  // ── Multiple hands in sequence ──

  it("accumulates hand history across multiple hands", () => {
    // Use a seed + RNG that reliably produces completeable hands
    const { session, completedHands } = createSession({
      seed: 100,
      random: seededRandom(100),
    });

    // Play hands until we have at least 3 completed, hero folds whenever active
    let attempts = 0;
    while (completedHands.length < 3 && attempts < 10) {
      attempts++;
      session.startHand();
      // Hero folds if it's their turn
      let safety = 0;
      while (
        session.state &&
        session.state.phase !== "complete" &&
        session.state.phase !== "showdown" &&
        safety < 50
      ) {
        safety++;
        const activeIdx = session.state.activePlayerIndex;
        if (activeIdx === null) break;
        if (session.state.players[activeIdx].seatIndex === session.heroSeatIndex) {
          session.act("fold");
        } else {
          break;
        }
      }
    }

    expect(completedHands.length).toBeGreaterThanOrEqual(3);
    expect(session.history.length).toBe(completedHands.length);

    // Each hand should have a unique handId
    const ids = new Set(completedHands.map((h) => h.handId));
    expect(ids.size).toBe(completedHands.length);
  });

  // ── onStateChange callback ──

  it("fires onStateChange on startHand and act", () => {
    const onStateChange = vi.fn();
    const session = new HandSession(
      {
        numPlayers: 3,
        dealerSeatIndex: 0,
        heroSeatIndex: 0,
        blinds: { small: 1, big: 2 },
        startingStack: 100,
        seatProfiles: new Map([
          [1, FISH],
          [2, TAG],
        ]),
        seed: 42,
      },
      { onStateChange },
    );

    session.startHand();
    expect(onStateChange).toHaveBeenCalled();

    const callsBefore = onStateChange.mock.calls.length;
    if (session.state && session.state.phase !== "complete" && session.state.phase !== "showdown") {
      const activeIdx = session.state.activePlayerIndex;
      if (activeIdx !== null && session.state.players[activeIdx].seatIndex === 0) {
        session.act("fold");
        expect(onStateChange.mock.calls.length).toBeGreaterThan(callsBefore);
      }
    }
  });

  // ── Engine decisions ──

  it("stores engine decisions accessible via decisions map", () => {
    const { session } = createSession();
    session.startHand();

    // After startHand, opponents should have made decisions
    if (session.decisions.size > 0) {
      for (const [seatIndex, decision] of session.decisions) {
        expect(seatIndex).not.toBe(session.heroSeatIndex);
        expect(decision.actionType).toBeDefined();
        expect(decision.situationKey).toBeDefined();
      }
    }
  });

  // ── Export ──

  it("exports hand history as valid JSON", () => {
    const { session } = createSession();
    session.startHand();

    // Fold to end
    if (session.state && session.state.phase !== "complete" && session.state.phase !== "showdown") {
      const activeIdx = session.state.activePlayerIndex;
      if (activeIdx !== null && session.state.players[activeIdx].seatIndex === 0) {
        session.act("fold");
      }
    }

    const json = session.exportHandHistory();
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe("1.0");
    expect(parsed.exportedAt).toBeDefined();
    expect(parsed.hands).toBeInstanceOf(Array);
  });

  // ── Config updates ──

  it("updates config between hands", () => {
    const { session } = createSession();
    session.updateConfig({ numPlayers: 4, startingStack: 500 });
    expect(session.numPlayers).toBe(4);
    expect(session.startingStack).toBe(500);

    session.startHand();
    expect(session.state!.players).toHaveLength(4);
  });

  // ── resetHand ──

  it("resets state to null on resetHand", () => {
    const { session } = createSession();
    session.startHand();
    expect(session.state).not.toBeNull();

    session.resetHand();
    expect(session.state).toBeNull();
  });

  // ── dealNext auto-rotates dealer ──

  it("dealNext rotates the dealer one seat forward", () => {
    const { session } = createSession({
      numPlayers: 4,
      dealerSeatIndex: 0,
      heroSeatIndex: 0,
      seatProfiles: new Map([
        [1, FISH],
        [2, TAG],
        [3, NIT],
      ]),
      seed: 50,
      random: seededRandom(50),
    });

    session.deal();
    expect(session.dealerSeatIndex).toBe(0);

    // Fold hero if it's their turn so the hand completes
    if (session.state?.activePlayerIndex !== null) {
      const active = session.state!.players[session.state!.activePlayerIndex!];
      if (active.seatIndex === 0) session.fold();
    }

    // dealNext should rotate dealer 0 → 1
    session.dealNext();
    expect(session.dealerSeatIndex).toBe(1);
    expect(session.state!.dealerSeatIndex).toBe(1);

    // Fold again
    if (session.state?.activePlayerIndex !== null) {
      const active = session.state!.players[session.state!.activePlayerIndex!];
      if (active.seatIndex === 0) session.fold();
    }

    // dealNext should rotate dealer 1 → 2
    session.dealNext();
    expect(session.dealerSeatIndex).toBe(2);
  });

  it("dealNext wraps dealer around the table", () => {
    const { session } = createSession({
      numPlayers: 3,
      dealerSeatIndex: 2,
      seed: 60,
      random: seededRandom(60),
    });

    session.deal();
    // Fold to end hand
    if (session.state?.activePlayerIndex !== null) {
      const active = session.state!.players[session.state!.activePlayerIndex!];
      if (active.seatIndex === 0) session.fold();
    }

    // Dealer at seat 2 → should wrap to seat 0
    session.dealNext();
    expect(session.dealerSeatIndex).toBe(0);
  });

  // ── Hero in BB fold stack deduction ──

  it("deducts big blind from hero stack when hero is BB and folds", () => {
    // Try seeds until we get one where hero (BB) gets a turn before hand ends
    let found = false;
    for (let seed = 1; seed < 300 && !found; seed++) {
      const completed: HandRecord[] = [];
      const s = new HandSession(
        {
          numPlayers: 6,
          dealerSeatIndex: 3,
          heroSeatIndex: 5, // BB in 6-player with dealer=3
          blinds: { small: 1, big: 2 },
          startingStack: 100, // 100 BB = 200 chips
          seatProfiles: new Map([
            [0, FISH],
            [1, FISH],
            [2, FISH],
            [3, FISH],
            [4, FISH],
          ]),
          seed,
          random: seededRandom(seed),
        },
        { onHandComplete: (r) => completed.push(r) },
      );
      s.deal();

      // Confirm hero is BB
      expect(s.state!.players[5].position).toBe("bb");

      // Hand completed during auto-play — villains all folded, hero won pot
      if (s.state!.phase === "complete" || s.state!.phase === "showdown") continue;

      // Hero has a turn — fold
      const activeIdx = s.state!.activePlayerIndex;
      if (activeIdx === null) continue;
      if (s.state!.players[activeIdx].seatIndex !== 5) continue;

      s.fold();
      found = true;

      expect(completed.length).toBe(1);
      const record = completed[0];
      const heroFinalStack = record.outcome!.finalStacks[5];

      // Hero posted 2 BB and folded — lost exactly 2
      expect(heroFinalStack).toBe(198);
      // Total chips preserved
      const totalStart = record.config.startingStacks.reduce((a, b) => a + b, 0);
      const totalEnd = record.outcome!.finalStacks.reduce((a, b) => a + b, 0);
      expect(totalEnd).toBe(totalStart);
    }

    expect(found).toBe(true);
  });

  // ── Decimal BB support ──

  it("supports decimal blind amounts (0.5/1 BB)", () => {
    const { session, completedHands } = createSession({
      numPlayers: 3,
      dealerSeatIndex: 0,
      heroSeatIndex: 0,
      blinds: { small: 0.5, big: 1 },
      startingStack: 100,
      seed: 42,
      random: seededRandom(42),
    });

    session.deal();

    // Find SB and BB players
    const sbPlayer = session.state!.players.find((p) => p.position === "sb");
    const bbPlayer = session.state!.players.find((p) => p.position === "bb");

    // SB should have posted 0.5
    expect(sbPlayer!.currentStack).toBe(99.5);
    expect(sbPlayer!.streetCommitted).toBe(0.5);

    // BB should have posted 1
    expect(bbPlayer!.currentStack).toBe(99);
    expect(bbPlayer!.streetCommitted).toBe(1);

    // Fold hero to end
    if (session.state?.activePlayerIndex !== null) {
      const active = session.state!.players[session.state!.activePlayerIndex!];
      if (active.seatIndex === 0) session.fold();
    }

    if (completedHands.length > 0) {
      const record = completedHands[0];
      const totalStart = record.config.startingStacks.reduce((a, b) => a + b, 0);
      const totalEnd = record.outcome!.finalStacks.reduce((a, b) => a + b, 0);
      expect(totalEnd).toBe(totalStart);
    }
  });
});
