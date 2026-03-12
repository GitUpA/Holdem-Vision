/**
 * Scenario tests — scripting API that reads like clicking the UI.
 *
 * Each test produces the same JSON artifacts as playing in the browser.
 * Files land in data/audits/test/ and are wiped on each run.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { existsSync } from "fs";
import { join } from "path";
import { HandSession } from "../../convex/lib/session/handSession";
import type { HandSessionConfig } from "../../convex/lib/session/types";
import type { HandRecord } from "../../convex/lib/audit/types";
import { PRESET_PROFILES } from "../../convex/lib/opponents/presets";
import { seededRandom } from "../../convex/lib/primitives/deck";
import { fileAuditWriter, cleanDir, TEST_AUDIT_DIR } from "../helpers/auditWriter";

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

const FISH = PRESET_PROFILES["fish"];
const TAG = PRESET_PROFILES["tag"];
const NIT = PRESET_PROFILES["nit"];
const LAG = PRESET_PROFILES["lag"];
const GTO = PRESET_PROFILES["gto"];

const SCENARIO_DIR = join(TEST_AUDIT_DIR, "scenarios");

function makeTable(overrides?: Partial<HandSessionConfig>) {
  const completed: HandRecord[] = [];
  const write = fileAuditWriter(SCENARIO_DIR);
  const table = new HandSession(
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
      random: seededRandom(42),
      ...overrides,
    },
    {
      onHandComplete: (r) => {
        completed.push(r);
        write(r);
      },
    },
  );
  return { table, completed };
}

/** Drive hero actions until the hand completes. */
function playHeroUntilDone(
  table: HandSession,
  decide: (table: HandSession) => void,
): void {
  let safety = 0;
  while (
    safety < 100 &&
    table.state &&
    table.state.phase !== "complete" &&
    table.state.phase !== "showdown"
  ) {
    safety++;
    const idx = table.state.activePlayerIndex;
    if (idx === null) break;
    if (table.state.players[idx].seatIndex !== table.heroSeatIndex) break;
    decide(table);
  }
}

// ═══════════════════════════════════════════════════════
// SCENARIOS
// ═══════════════════════════════════════════════════════

describe("Scenarios", () => {
  beforeAll(() => {
    cleanDir(SCENARIO_DIR);
  });

  it("hero folds preflop — writes identical JSON artifact", () => {
    const { table, completed } = makeTable();

    table.deal();
    playHeroUntilDone(table, (t) => t.fold());

    expect(completed.length).toBeGreaterThanOrEqual(1);
    const record = completed[0];

    // File exists on disk — same artifact the UI would produce
    const filePath = join(SCENARIO_DIR, `${record.handId}.json`);
    expect(existsSync(filePath)).toBe(true);

    // Stacks reconcile
    const startSum = record.config.startingStacks.reduce((a, b) => a + b, 0);
    const endSum = record.outcome!.finalStacks.reduce((a, b) => a + b, 0);
    expect(endSum).toBe(startSum);
  });

  it("hero calls down to showdown — full hand artifact", () => {
    const { table, completed } = makeTable({
      seed: 77,
      random: seededRandom(77),
    });

    table.deal();
    playHeroUntilDone(table, (t) => {
      const hero = t.state!.players.find((p) => p.seatIndex === t.heroSeatIndex);
      if (hero && t.state!.currentBet > hero.streetCommitted) {
        t.call();
      } else {
        t.check();
      }
    });

    expect(completed.length).toBe(1);
    const record = completed[0];

    // File on disk
    expect(existsSync(join(SCENARIO_DIR, `${record.handId}.json`))).toBe(true);

    // Reached showdown or complete
    expect(record.outcome).toBeDefined();
    expect(record.outcome!.finalStacks.reduce((a, b) => a + b, 0)).toBe(
      record.config.startingStacks.reduce((a, b) => a + b, 0),
    );

    // Should have street snapshots (got past preflop)
    if (record.streetSnapshots && record.streetSnapshots.length > 0) {
      expect(record.communityCards.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("hero raises preflop then folds on next street", () => {
    const { table, completed } = makeTable({
      seed: 200,
      random: seededRandom(200),
    });

    table.deal();

    // Raise preflop if hero's turn
    let raised = false;
    if (
      table.state &&
      table.state.phase !== "complete" &&
      table.state.phase !== "showdown"
    ) {
      const idx = table.state.activePlayerIndex;
      if (idx !== null && table.state.players[idx].seatIndex === table.heroSeatIndex) {
        table.raise(6); // 3x BB
        raised = true;
      }
    }

    // Fold on the next hero action (flop or later)
    playHeroUntilDone(table, (t) => t.fold());

    expect(completed.length).toBeGreaterThanOrEqual(1);
    const record = completed[0];

    // Stacks reconcile
    const startSum = record.config.startingStacks.reduce((a, b) => a + b, 0);
    const endSum = record.outcome!.finalStacks.reduce((a, b) => a + b, 0);
    expect(endSum).toBe(startSum);
  });

  it("6-max table with all 5 profiles — full hand", () => {
    const { table, completed } = makeTable({
      numPlayers: 6,
      seed: 555,
      random: seededRandom(555),
      seatProfiles: new Map([
        [1, FISH],
        [2, TAG],
        [3, NIT],
        [4, LAG],
        [5, GTO],
      ]),
    });

    table.deal();
    playHeroUntilDone(table, (t) => {
      const hero = t.state!.players.find((p) => p.seatIndex === t.heroSeatIndex);
      if (hero && t.state!.currentBet > hero.streetCommitted) {
        t.call();
      } else {
        t.check();
      }
    });

    expect(completed.length).toBe(1);
    const record = completed[0];
    expect(record.config.numPlayers).toBe(6);
    expect(record.seatSetup).toHaveLength(6);
    expect(existsSync(join(SCENARIO_DIR, `${record.handId}.json`))).toBe(true);
  });

  // ── Multi-hand cash game session ──

  it("plays 5 consecutive hands with stacks carrying forward via dealNext()", () => {
    const { table, completed } = makeTable({
      numPlayers: 3,
      seed: 314,
      random: seededRandom(314),
      startingStack: 100,
      seatProfiles: new Map([
        [1, FISH],
        [2, TAG],
      ]),
    });

    const TOTAL_CHIPS = 100 * 2 * 3; // 100 BB × 2 chips/BB × 3 players = 600
    const heroStrategy = (t: HandSession) => {
      const hero = t.state!.players.find((p) => p.seatIndex === t.heroSeatIndex);
      if (hero && t.state!.currentBet > hero.streetCommitted) {
        t.call();
      } else {
        t.check();
      }
    };

    // Hand 1: deal fresh
    table.deal();
    playHeroUntilDone(table, heroStrategy);

    // Hands 2–5: deal next (carries stacks) — same as clicking "Deal Next Hand"
    for (let hand = 1; hand < 5; hand++) {
      table.dealNext();
      playHeroUntilDone(table, heroStrategy);
    }

    // All 5 hands completed
    expect(completed.length).toBe(5);

    // Chips conserved every hand
    for (const record of completed) {
      const stackSum = record.outcome!.finalStacks.reduce((a, b) => a + b, 0);
      expect(stackSum).toBe(TOTAL_CHIPS);
    }

    // Each hand's starting stacks match previous hand's ending stacks
    for (let i = 1; i < completed.length; i++) {
      const prevEnd = completed[i - 1].outcome!.finalStacks;
      const currStart = completed[i].config.startingStacks;
      expect(currStart).toEqual(prevEnd);
    }

    // Dealer rotated each hand (started at 0, should be at 4 after 5 deals)
    // dealNext rotates +1 each time: 0 → 1 → 2 → 0 (wraps at 3 players)
    // After deal() at 0 then 4× dealNext: dealer should be at 4 % 3 = 1
    expect(table.dealerSeatIndex).toBe(4 % 3); // = 1

    // All 5 JSON files on disk
    for (const record of completed) {
      expect(existsSync(join(SCENARIO_DIR, `${record.handId}.json`))).toBe(true);
    }
  });
});
