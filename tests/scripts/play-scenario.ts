/**
 * Standalone scenario script — writes audit JSON to data/audits/saved/
 * for manual inspection and analysis.
 *
 * Run with: npx tsx tests/scripts/play-scenario.ts
 *
 * Output is never auto-wiped. Accumulates across runs so you can
 * compare hands, analyze engine decisions, or build a library of
 * reference scenarios.
 */
import { HandSession } from "../../convex/lib/session/handSession";
import { PRESET_PROFILES } from "../../convex/lib/opponents/presets";
import { seededRandom } from "../../convex/lib/primitives/deck";
import { fileAuditWriter, SAVED_AUDIT_DIR } from "../helpers/auditWriter";
import { mkdirSync } from "fs";

const FISH = PRESET_PROFILES["fish"];
const TAG = PRESET_PROFILES["tag"];
const NIT = PRESET_PROFILES["nit"];
const LAG = PRESET_PROFILES["lag"];
const GTO = PRESET_PROFILES["gto"];

mkdirSync(SAVED_AUDIT_DIR, { recursive: true });
const write = fileAuditWriter(SAVED_AUDIT_DIR);

// ═══════════════════════════════════════════════════════
// SCENARIO 1: Hero calls down in 6-max
// ═══════════════════════════════════════════════════════

console.log("--- Scenario 1: Hero calls down in 6-max ---");

const table1 = new HandSession(
  {
    numPlayers: 6,
    dealerSeatIndex: 0,
    heroSeatIndex: 0,
    blinds: { small: 1, big: 2 },
    startingStack: 200,
    seatProfiles: new Map([
      [1, FISH],
      [2, TAG],
      [3, GTO],
      [4, LAG],
      [5, NIT],
    ]),
    seed: 12345,
    random: seededRandom(12345),
  },
  {
    onHandComplete: (r) => {
      write(r);
      console.log(`  → ${r.handId} saved (${r.events.length} events)`);
    },
  },
);

table1.deal();

let safety = 0;
while (
  safety < 100 &&
  table1.state &&
  table1.state.phase !== "complete" &&
  table1.state.phase !== "showdown"
) {
  safety++;
  const idx = table1.state.activePlayerIndex;
  if (idx === null) break;
  if (table1.state.players[idx].seatIndex !== 0) break;
  const hero = table1.state.players.find((p) => p.seatIndex === 0);
  if (hero && table1.state.currentBet > hero.streetCommitted) {
    table1.call();
  } else {
    table1.check();
  }
}

// ═══════════════════════════════════════════════════════
// SCENARIO 2: Hero folds preflop in 3-max
// ═══════════════════════════════════════════════════════

console.log("--- Scenario 2: Hero folds preflop in 3-max ---");

const table2 = new HandSession(
  {
    numPlayers: 3,
    dealerSeatIndex: 0,
    heroSeatIndex: 0,
    blinds: { small: 1, big: 2 },
    startingStack: 200,
    seatProfiles: new Map([
      [1, FISH],
      [2, TAG],
    ]),
    seed: 67890,
    random: seededRandom(67890),
  },
  {
    onHandComplete: (r) => {
      write(r);
      console.log(`  → ${r.handId} saved (${r.events.length} events)`);
    },
  },
);

table2.deal();
if (
  table2.state &&
  table2.state.phase !== "complete" &&
  table2.state.phase !== "showdown"
) {
  const idx = table2.state.activePlayerIndex;
  if (idx !== null && table2.state.players[idx].seatIndex === 0) {
    table2.fold();
  }
}

// ═══════════════════════════════════════════════════════
// SCENARIO 3: Hero raises then folds
// ═══════════════════════════════════════════════════════

console.log("--- Scenario 3: Hero 3x raises preflop, folds flop ---");

const table3 = new HandSession(
  {
    numPlayers: 3,
    dealerSeatIndex: 0,
    heroSeatIndex: 0,
    blinds: { small: 1, big: 2 },
    startingStack: 200,
    seatProfiles: new Map([
      [1, LAG],
      [2, GTO],
    ]),
    seed: 99999,
    random: seededRandom(99999),
  },
  {
    onHandComplete: (r) => {
      write(r);
      console.log(`  → ${r.handId} saved (${r.events.length} events)`);
    },
  },
);

table3.deal();

// Raise preflop if hero's turn
if (
  table3.state &&
  table3.state.phase !== "complete" &&
  table3.state.phase !== "showdown"
) {
  const idx = table3.state.activePlayerIndex;
  if (idx !== null && table3.state.players[idx].seatIndex === 0) {
    table3.raise(6);
  }
}

// Fold on next action
safety = 0;
while (
  safety < 50 &&
  table3.state &&
  table3.state.phase !== "complete" &&
  table3.state.phase !== "showdown"
) {
  safety++;
  const idx = table3.state.activePlayerIndex;
  if (idx === null) break;
  if (table3.state.players[idx].seatIndex !== 0) break;
  table3.fold();
}

// ═══════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════

const totalHands =
  table1.history.length + table2.history.length + table3.history.length;
console.log(`\nDone. ${totalHands} hand(s) written to ${SAVED_AUDIT_DIR}/`);
