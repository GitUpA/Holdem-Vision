import { describe, it, expect } from "vitest";
import { HandRecorder } from "../../convex/lib/audit/handRecorder";
import type { RecordableDecision } from "../../convex/lib/audit/handRecorder";
import type { HandConfig, SeatSetupEntry } from "../../convex/lib/audit/types";
import {
  initializeHand,
  applyAction,
  currentLegalActions,
} from "../../convex/lib/state/state-machine";
import {
  chooseActionFromProfile,
} from "../../convex/lib/opponents/autoPlay";
import { createTestConfig } from "../state/helpers";
import { FISH_PROFILE, TAG_PROFILE } from "../../convex/lib/opponents/presets";
import type { GameState } from "../../convex/lib/state/game-state";
import type { AnalysisResult } from "../../convex/lib/types/analysis";

// ─── Helpers ───

function makeConfig(numPlayers = 3): HandConfig {
  return {
    numPlayers,
    dealerSeatIndex: 0,
    heroSeatIndex: 0,
    blinds: { small: 1, big: 2 },
    startingStacks: Array(numPlayers).fill(1000),
  };
}

function makeSeatSetup(numPlayers = 3): SeatSetupEntry[] {
  const profiles = [undefined, FISH_PROFILE, TAG_PROFILE];
  return Array.from({ length: numPlayers }, (_, i) => ({
    seatIndex: i,
    position: i === 0 ? "btn" as const : i === 1 ? "sb" as const : "bb" as const,
    profileId: profiles[i]?.id,
    profileName: profiles[i]?.name,
    engineId: profiles[i]?.engineId,
    cardVisibility: i === 0 ? "revealed" as const : "hidden" as const,
  }));
}

function playHandWithRecorder(seed = 42): {
  recorder: HandRecorder;
  finalState: GameState;
} {
  const config = createTestConfig({ numPlayers: 3, seed });
  const { state } = initializeHand(config);

  const auditConfig = makeConfig(3);
  const seatSetup = makeSeatSetup(3);
  const recorder = new HandRecorder(auditConfig, seatSetup);

  const profiles = new Map([
    [1, FISH_PROFILE],
    [2, TAG_PROFILE],
  ]);

  let s = state;

  // Play through preflop: seat 0 is BTN (dealer), seat 1 is SB, seat 2 is BB
  // Auto-play all seats with fold/call/raise to advance the hand
  let safety = 0;
  while (s.phase !== "complete" && safety < 50) {
    safety++;
    if (s.activePlayerIndex === null) break;
    const active = s.players[s.activePlayerIndex];
    const legal = currentLegalActions(s);
    if (!legal) break;

    const profile = profiles.get(active.seatIndex);
    let decision: RecordableDecision | undefined;

    if (profile) {
      const d = chooseActionFromProfile(
        s, active.seatIndex, profile, legal,
        () => undefined, undefined, profiles,
      );
      decision = d;
      try {
        const result = applyAction(s, active.seatIndex, d.actionType, d.amount);
        s = result.state;
      } catch {
        s = applyAction(s, active.seatIndex, legal.canFold ? "fold" : "check").state;
      }
    } else {
      // Hero: just call or check
      const actionType = legal.canCheck ? "check" : legal.canCall ? "call" : "fold";
      try {
        s = applyAction(s, active.seatIndex, actionType).state;
      } catch {
        break;
      }
    }

    const lastAction = s.actionHistory[s.actionHistory.length - 1];
    recorder.recordEvent(
      lastAction,
      s.pot.total,
      profile ? "engine" : "manual",
      decision,
    );
  }

  return { recorder, finalState: s };
}

// ─── Tests ───

describe("HandRecorder", () => {
  it("creates a valid HandRecord with correct config", () => {
    const config = makeConfig();
    const seatSetup = makeSeatSetup();
    const recorder = new HandRecorder(config, seatSetup);
    const record = recorder.snapshot();

    expect(record.handId).toMatch(/^hand-\d+-\d+$/);
    expect(record.startedAt).toBeGreaterThan(0);
    expect(record.config.numPlayers).toBe(3);
    expect(record.config.heroSeatIndex).toBe(0);
    expect(record.config.blinds.small).toBe(1);
    expect(record.config.blinds.big).toBe(2);
    expect(record.seatSetup).toHaveLength(3);
    expect(record.events).toHaveLength(0);
  });

  it("records events in sequence order", () => {
    const { recorder } = playHandWithRecorder();
    const record = recorder.snapshot();

    expect(record.events.length).toBeGreaterThan(0);

    // Events should have monotonically increasing seq
    for (let i = 1; i < record.events.length; i++) {
      expect(record.events[i].seq).toBeGreaterThan(record.events[i - 1].seq);
    }
  });

  it("tracks potAfter for each event", () => {
    const { recorder } = playHandWithRecorder();
    const record = recorder.snapshot();

    for (const event of record.events) {
      expect(typeof event.potAfter).toBe("number");
      expect(event.potAfter).toBeGreaterThan(0);
    }
  });

  it("captures engine decisions with reasoning for auto-play", () => {
    const { recorder } = playHandWithRecorder();
    const record = recorder.snapshot();

    const engineEvents = record.events.filter((e) => e.source === "engine");
    expect(engineEvents.length).toBeGreaterThan(0);

    // At least some engine events should have decision snapshots
    const withDecisions = engineEvents.filter((e) => e.decision);
    expect(withDecisions.length).toBeGreaterThan(0);

    for (const event of withDecisions) {
      const d = event.decision!;
      expect(d.engineId).toBeDefined();
      expect(d.situationKey).toBeDefined();
      expect(d.explanationSummary).toBeDefined();
      expect(typeof d.explanationSummary).toBe("string");
      expect(d.explanationSummary.length).toBeGreaterThan(0);
    }
  });

  it("captures structured reasoning metrics from the unified engine", () => {
    // Run multiple seeds to find one where modifiedGtoEngine produces reasoning
    let found = false;
    for (let seed = 1; seed <= 20 && !found; seed++) {
      const { recorder } = playHandWithRecorder(seed);
      const record = recorder.snapshot();

      for (const event of record.events) {
        if (!event.decision?.reasoning) continue;
        const r = event.decision.reasoning;
        // modifiedGtoEngine populates handStrength
        if (r.handStrength !== undefined) {
          expect(typeof r.handStrength).toBe("number");
          found = true;
          break;
        }
      }
    }
    expect(found).toBe(true);
  });

  it("marks manual hero actions correctly", () => {
    const { recorder } = playHandWithRecorder();
    const record = recorder.snapshot();

    const manualEvents = record.events.filter((e) => e.source === "manual");
    // Hero (seat 0) should have at least one manual action
    for (const event of manualEvents) {
      expect(event.seatIndex).toBe(0);
      expect(event.decision).toBeUndefined();
    }
  });

  it("finalizes with community cards and outcome", () => {
    const { recorder, finalState } = playHandWithRecorder();
    const record = recorder.finalize(finalState);

    expect(record.completedAt).toBeGreaterThan(0);
    // Community cards should be populated (even if empty for preflop-only hand)
    expect(Array.isArray(record.communityCards)).toBe(true);

    // Outcome should exist
    expect(record.outcome).toBeDefined();
    expect(Array.isArray(record.outcome!.finalStacks)).toBe(true);
    expect(record.outcome!.finalStacks).toHaveLength(3);
  });

  it("won't record events after finalization", () => {
    const { recorder, finalState } = playHandWithRecorder();
    recorder.finalize(finalState);

    const eventCountBefore = recorder.snapshot().events.length;
    // Try to add another event
    recorder.recordEvent(
      { seatIndex: 0, position: "btn", street: "preflop", actionType: "fold", isAllIn: false, sequence: 999 },
      100,
      "manual",
    );
    expect(recorder.snapshot().events.length).toBe(eventCountBefore);
  });

  it("exports valid JSON that round-trips", () => {
    const { recorder, finalState } = playHandWithRecorder();
    recorder.finalize(finalState);

    const json = recorder.toJSON();
    expect(typeof json).toBe("string");

    const parsed = JSON.parse(json);
    expect(parsed.handId).toBeDefined();
    expect(parsed.events).toBeInstanceOf(Array);
    expect(parsed.config.numPlayers).toBe(3);
    expect(parsed.outcome).toBeDefined();
  });

  it("keeps record size under 50KB for typical hand", () => {
    const { recorder, finalState } = playHandWithRecorder();
    recorder.finalize(finalState);

    const json = recorder.toJSON();
    const sizeBytes = new TextEncoder().encode(json).length;
    expect(sizeBytes).toBeLessThan(50 * 1024); // 50KB
  });

  it("verbose mode includes explanationTreeJson", () => {
    const config = makeConfig(3);
    const seatSetup = makeSeatSetup(3);
    const recorder = new HandRecorder(config, seatSetup, true); // verbose!

    const handConfig = createTestConfig({ numPlayers: 3, seed: 42 });
    const { state } = initializeHand(handConfig);

    const profiles = new Map([[1, FISH_PROFILE], [2, TAG_PROFILE]]);
    let s = state;
    let safety = 0;

    while (s.phase !== "complete" && safety < 50) {
      safety++;
      if (s.activePlayerIndex === null) break;
      const active = s.players[s.activePlayerIndex];
      const legal = currentLegalActions(s);
      if (!legal) break;

      const profile = profiles.get(active.seatIndex);
      let decision: RecordableDecision | undefined;

      if (profile) {
        const d = chooseActionFromProfile(
          s, active.seatIndex, profile, legal,
          () => undefined, undefined, profiles,
        );
        decision = d;
        try {
          s = applyAction(s, active.seatIndex, d.actionType, d.amount).state;
        } catch {
          s = applyAction(s, active.seatIndex, legal.canFold ? "fold" : "check").state;
        }
      } else {
        const actionType = legal.canCheck ? "check" : legal.canCall ? "call" : "fold";
        s = applyAction(s, active.seatIndex, actionType).state;
      }

      const lastAction = s.actionHistory[s.actionHistory.length - 1];
      recorder.recordEvent(lastAction, s.pot.total, profile ? "engine" : "manual", decision);
    }

    const record = recorder.finalize(s);
    const engineEventsWithTree = record.events.filter(
      (e) => e.decision?.explanationTreeJson,
    );
    // Verbose mode should include tree JSON for engine decisions
    expect(engineEventsWithTree.length).toBeGreaterThan(0);

    // Verify tree JSON is valid
    for (const event of engineEventsWithTree) {
      const tree = JSON.parse(event.decision!.explanationTreeJson!);
      expect(tree.summary).toBeDefined();
    }
  });

  it("default mode omits explanationTreeJson", () => {
    const { recorder, finalState } = playHandWithRecorder(); // default = non-verbose
    const record = recorder.finalize(finalState);

    const withTree = record.events.filter(
      (e) => e.decision?.explanationTreeJson,
    );
    expect(withTree).toHaveLength(0);
  });

  // ─── V2 Tests ───

  it("seedBlinds creates system events for SB and BB", () => {
    const config = createTestConfig({ numPlayers: 3, seed: 1 });
    const { state } = initializeHand(config);

    const auditConfig = makeConfig(3);
    const seatSetup = makeSeatSetup(3);
    const recorder = new HandRecorder(auditConfig, seatSetup);

    recorder.seedBlinds(state);
    const record = recorder.snapshot();

    const systemEvents = record.events.filter((e) => e.source === "system");
    expect(systemEvents.length).toBeGreaterThanOrEqual(2); // SB + BB

    // All system events should be on preflop with amounts > 0
    for (const event of systemEvents) {
      expect(event.street).toBe("preflop");
      expect(event.amount).toBeGreaterThan(0);
      expect(event.source).toBe("system");
    }

    // Verify SB and BB amounts match config
    const amounts = systemEvents.map((e) => e.amount).sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(amounts).toContain(1); // small blind
    expect(amounts).toContain(2); // big blind
  });

  it("seedBlinds uses negative seq numbers", () => {
    const config = createTestConfig({ numPlayers: 3, seed: 1 });
    const { state } = initializeHand(config);

    const auditConfig = makeConfig(3);
    const seatSetup = makeSeatSetup(3);
    const recorder = new HandRecorder(auditConfig, seatSetup);

    recorder.seedBlinds(state);
    const record = recorder.snapshot();

    const systemEvents = record.events.filter((e) => e.source === "system");
    for (const event of systemEvents) {
      expect(event.seq).toBeLessThan(0); // negative so they sort before real actions
    }
  });

  it("recordStreetChange captures street snapshots", () => {
    const config = makeConfig(3);
    const seatSetup = makeSeatSetup(3);
    const recorder = new HandRecorder(config, seatSetup);

    recorder.recordStreetChange("flop", [0, 1, 2], 10, 3);
    recorder.recordStreetChange("turn", [0, 1, 2, 3], 20, 2);
    recorder.recordStreetChange("river", [0, 1, 2, 3, 4], 40, 2);

    const record = recorder.snapshot();
    expect(record.streetSnapshots).toHaveLength(3);
    expect(record.streetSnapshots![0].street).toBe("flop");
    expect(record.streetSnapshots![0].communityCards).toEqual([0, 1, 2]);
    expect(record.streetSnapshots![0].potTotal).toBe(10);
    expect(record.streetSnapshots![0].activePlayers).toBe(3);
    expect(record.streetSnapshots![1].street).toBe("turn");
    expect(record.streetSnapshots![2].street).toBe("river");
    expect(record.streetSnapshots![2].communityCards).toHaveLength(5);
  });

  it("recordLensResults captures lens snapshots", () => {
    const config = makeConfig(3);
    const seatSetup = makeSeatSetup(3);
    const recorder = new HandRecorder(config, seatSetup);

    const mockResults = new Map<string, AnalysisResult>([
      ["raw-equity", {
        value: { equity: 0.5 },
        context: {} as AnalysisResult["context"],
        explanation: {
          summary: "You have 50% equity",
          sentiment: "neutral",
          tags: ["equity"],
        },
        visuals: [],
        lensId: "raw-equity",
        dependencies: [],
      }],
      ["threats", {
        value: { threats: [] },
        context: {} as AnalysisResult["context"],
        explanation: {
          summary: "No significant threats detected",
          sentiment: "positive",
        },
        visuals: [],
        lensId: "threats",
        dependencies: [],
      }],
    ]);

    recorder.recordLensResults("preflop", mockResults);
    const record = recorder.snapshot();

    expect(record.lensSnapshots).toHaveLength(2);

    const equitySnap = record.lensSnapshots!.find((l) => l.lensId === "raw-equity");
    expect(equitySnap).toBeDefined();
    expect(equitySnap!.street).toBe("preflop");
    expect(equitySnap!.explanationSummary).toBe("You have 50% equity");
    expect(equitySnap!.sentiment).toBe("neutral");
    expect(equitySnap!.tags).toEqual(["equity"]);
    // Non-verbose: no tree JSON
    expect(equitySnap!.explanationTreeJson).toBeUndefined();

    const threatSnap = record.lensSnapshots!.find((l) => l.lensId === "threats");
    expect(threatSnap).toBeDefined();
    expect(threatSnap!.sentiment).toBe("positive");
  });

  it("verbose mode includes explanationTreeJson in lens snapshots", () => {
    const config = makeConfig(3);
    const seatSetup = makeSeatSetup(3);
    const recorder = new HandRecorder(config, seatSetup, true); // verbose

    const mockResults = new Map<string, AnalysisResult>([
      ["raw-equity", {
        value: { equity: 0.5 },
        context: {} as AnalysisResult["context"],
        explanation: {
          summary: "50% equity",
          children: [{ summary: "Detail node" }],
        },
        visuals: [],
        lensId: "raw-equity",
        dependencies: [],
      }],
    ]);

    recorder.recordLensResults("flop", mockResults);
    const record = recorder.snapshot();

    const snap = record.lensSnapshots![0];
    expect(snap.explanationTreeJson).toBeDefined();
    const tree = JSON.parse(snap.explanationTreeJson!);
    expect(tree.summary).toBe("50% equity");
    expect(tree.children).toHaveLength(1);
  });

  it("won't record street/lens after finalization", () => {
    const { recorder, finalState } = playHandWithRecorder();
    recorder.finalize(finalState);

    recorder.recordStreetChange("river", [0, 1, 2, 3, 4], 100, 2);
    recorder.recordLensResults("river", new Map());

    const record = recorder.snapshot();
    // Should not have any street snapshots (hand was played without calling recordStreetChange)
    expect(record.streetSnapshots).toBeUndefined();
    expect(record.lensSnapshots).toBeUndefined();
  });

  it("keeps record under 100KB with lens data", () => {
    const config = makeConfig(3);
    const seatSetup = makeSeatSetup(3);
    const recorder = new HandRecorder(config, seatSetup, true); // verbose for max size

    // Simulate 7 lenses × 4 streets = 28 lens snapshots
    const lenses = ["raw-equity", "monte-carlo", "threats", "outs", "draws", "opponent-read", "coaching"];
    const streets = ["preflop", "flop", "turn", "river"] as const;

    for (const st of streets) {
      const results = new Map<string, AnalysisResult>();
      for (const lens of lenses) {
        results.set(lens, {
          value: { data: "x".repeat(100) },
          context: {} as AnalysisResult["context"],
          explanation: {
            summary: `${lens} analysis for ${st}: some explanation text here`,
            children: [
              { summary: "Child 1 with detail", detail: "Some detailed text about the analysis" },
              { summary: "Child 2 with detail", detail: "More detailed text about the analysis" },
            ],
            tags: ["tag1", "tag2"],
            sentiment: "neutral",
          },
          visuals: [],
          lensId: lens,
          dependencies: [],
        });
      }
      recorder.recordLensResults(st, results);
      if (st !== "preflop") {
        recorder.recordStreetChange(st, [0, 1, 2].slice(0, st === "flop" ? 3 : st === "turn" ? 4 : 5), 50, 3);
      }
    }

    const json = recorder.toJSON();
    const sizeBytes = new TextEncoder().encode(json).length;
    expect(sizeBytes).toBeLessThan(100 * 1024); // 100KB budget with verbose lens data
  });
});
