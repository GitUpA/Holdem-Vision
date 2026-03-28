/**
 * Range Generator — converts validated preflop ranges to solver format.
 *
 * Reads the GTO ranges from preflopRanges.ts (exported as JSON) and
 * generates solver-compatible range strings for each preflop scenario.
 *
 * Output: data/solver/range_configs/*.json
 *
 * Run: node data/solver/rangeGenerator.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, "range_configs");

// ═══════════════════════════════════════════════════════
// VALIDATED GTO RANGES (mirrored from preflopRanges.ts)
// ═══════════════════════════════════════════════════════

const RFI_RANGES = {
  utg: [
    "AA", "KK", "QQ", "JJ", "TT", "99", "88", "77", "66",
    "AKs", "AQs", "AJs", "ATs", "A5s", "A4s",
    "AKo", "AQo", "AJo",
    "KQs", "KJs", "KTs",
    "QJs", "QTs",
    "JTs",
    "T9s",
    "98s",
    "87s",
    "76s",
    "65s",
  ],
  hj: [
    "AA", "KK", "QQ", "JJ", "TT", "99", "88", "77", "66",
    "AKs", "AQs", "AJs", "ATs", "A9s", "A5s", "A4s", "A3s",
    "AKo", "AQo", "AJo", "ATo",
    "KQs", "KJs", "KTs", "K9s",
    "KQo",
    "QJs", "QTs", "Q9s",
    "QJo",
    "JTs", "J9s",
    "T9s", "T8s",
    "98s", "97s",
    "87s", "86s",
    "76s", "75s",
    "65s", "64s",
    "54s",
  ],
  co: [
    "AA", "KK", "QQ", "JJ", "TT", "99", "88", "77", "66", "55", "44",
    "AKs", "AQs", "AJs", "ATs", "A9s", "A8s", "A7s", "A6s", "A5s", "A4s", "A3s", "A2s",
    "AKo", "AQo", "AJo", "ATo", "A9o", "A8o",
    "KQs", "KJs", "KTs", "K9s", "K8s", "K7s",
    "KQo", "KJo", "KTo",
    "QJs", "QTs", "Q9s", "Q8s",
    "QJo", "QTo",
    "JTs", "J9s", "J8s",
    "JTo",
    "T9s", "T8s", "T7s",
    "T9o",
    "98s", "97s", "96s",
    "98o",
    "87s", "86s", "85s",
    "76s", "75s", "74s",
    "65s", "64s", "63s",
    "54s", "53s",
    "43s",
  ],
  btn: [
    "AA", "KK", "QQ", "JJ", "TT", "99", "88", "77", "66", "55", "44", "33", "22",
    "AKs", "AQs", "AJs", "ATs", "A9s", "A8s", "A7s", "A6s", "A5s", "A4s", "A3s", "A2s",
    "AKo", "AQo", "AJo", "ATo", "A9o", "A8o", "A7o", "A6o", "A5o", "A4o", "A3o", "A2o",
    "KQs", "KJs", "KTs", "K9s", "K8s", "K7s", "K6s", "K5s", "K4s", "K3s", "K2s",
    "KQo", "KJo", "KTo", "K9o",
    "QJs", "QTs", "Q9s", "Q8s", "Q7s", "Q6s", "Q5s", "Q4s", "Q3s", "Q2s",
    "QJo", "QTo", "Q9o",
    "JTs", "J9s", "J8s", "J7s", "J6s", "J5s",
    "JTo", "J9o",
    "T9s", "T8s", "T7s", "T6s",
    "T9o", "T8o",
    "98s", "97s", "96s", "95s",
    "98o",
    "87s", "86s", "85s", "84s",
    "87o",
    "76s", "75s", "74s", "73s",
    "76o",
    "65s", "64s", "63s", "62s",
    "65o",
    "54s", "53s", "52s",
    "54o",
    "43s", "42s",
    "32s",
  ],
  sb: [
    "AA", "KK", "QQ", "JJ", "TT", "99", "88", "77", "66", "55", "44", "33", "22",
    "AKs", "AQs", "AJs", "ATs", "A9s", "A8s", "A7s", "A6s", "A5s", "A4s", "A3s", "A2s",
    "AKo", "AQo", "AJo", "ATo", "A9o", "A8o", "A7o", "A6o", "A5o", "A4o",
    "KQs", "KJs", "KTs", "K9s", "K8s", "K7s", "K6s", "K5s", "K4s",
    "KQo", "KJo", "KTo", "K9o",
    "QJs", "QTs", "Q9s", "Q8s", "Q7s", "Q6s", "Q5s",
    "QJo", "QTo",
    "JTs", "J9s", "J8s", "J7s", "J6s",
    "JTo", "J9o",
    "T9s", "T8s", "T7s", "T6s",
    "T9o",
    "98s", "97s", "96s", "95s",
    "98o",
    "87s", "86s", "85s",
    "87o",
    "76s", "75s", "74s",
    "76o",
    "65s", "64s", "63s",
    "54s", "53s",
    "43s",
  ],
};

// BB defense ranges by opener position
const BB_DEFENSE = {
  vs_utg: {
    threebet: ["AA", "KK", "QQ", "AKs", "AKo", "A5s", "A4s"],
    call: [
      "JJ", "TT", "99", "88", "77", "66", "55",
      "AQs", "AJs", "ATs", "A9s", "AQo",
      "KQs", "KJs", "KTs",
      "QJs", "QTs",
      "JTs", "J9s",
      "T9s",
      "98s", "87s", "76s", "65s", "54s",
    ],
  },
  vs_co: {
    threebet: ["AA", "KK", "QQ", "JJ", "AKs", "AKo", "AQs", "A5s", "A4s", "A3s", "KQs"],
    call: [
      "TT", "99", "88", "77", "66", "55", "44", "33", "22",
      "AJs", "ATs", "A9s", "A8s", "A7s", "A6s", "A5s", "A4s", "A3s", "A2s",
      "AQo", "AJo", "ATo",
      "KJs", "KTs", "K9s", "K8s", "KQo", "KJo",
      "QJs", "QTs", "Q9s", "QJo",
      "JTs", "J9s", "J8s",
      "T9s", "T8s",
      "98s", "97s",
      "87s", "86s",
      "76s", "75s",
      "65s", "64s",
      "54s", "53s",
      "43s",
    ],
  },
  vs_btn: {
    threebet: [
      "AA", "KK", "QQ", "JJ", "TT", "AKs", "AKo", "AQs", "AQo", "AJs",
      "A5s", "A4s", "A3s", "A2s", "KQs", "KJs", "76s", "65s",
    ],
    call: [
      "99", "88", "77", "66", "55", "44", "33", "22",
      "ATs", "A9s", "A8s", "A7s", "A6s", "AJo", "ATo", "A9o",
      "KTs", "K9s", "K8s", "K7s", "K6s", "K5s", "KQo", "KJo", "KTo",
      "QJs", "QTs", "Q9s", "Q8s", "Q7s", "QJo", "QTo",
      "JTs", "J9s", "J8s", "J7s", "JTo", "J9o",
      "T9s", "T8s", "T7s", "T9o",
      "98s", "97s", "96s", "98o",
      "87s", "86s", "85s", "87o",
      "76s", "75s", "74s",
      "65s", "64s", "63s",
      "54s", "53s", "52s",
      "43s", "42s",
      "32s",
    ],
  },
  vs_sb: {
    threebet: [
      "AA", "KK", "QQ", "JJ", "TT", "99",
      "AKs", "AQs", "AJs", "ATs", "AKo", "AQo", "AJo",
      "A5s", "A4s", "A3s", "A2s",
      "KQs", "KJs", "KTs", "QJs",
      "76s", "65s", "54s",
    ],
    call: [
      "88", "77", "66", "55", "44", "33", "22",
      "A9s", "A8s", "A7s", "A6s",
      "ATo", "A9o", "A8o", "A7o", "A6o", "A5o", "A4o", "A3o", "A2o",
      "K9s", "K8s", "K7s", "K6s", "K5s", "K4s", "K3s", "K2s",
      "KQo", "KJo", "KTo", "K9o", "K8o",
      "Q9s", "Q8s", "Q7s", "Q6s", "Q5s", "Q4s", "Q3s", "Q2s",
      "QJo", "QTo", "Q9o",
      "J9s", "J8s", "J7s", "J6s", "J5s",
      "JTo", "J9o", "J8o",
      "T9s", "T8s", "T7s", "T6s", "T9o", "T8o",
      "98s", "97s", "96s", "95s", "98o", "97o",
      "87s", "86s", "85s", "84s", "87o", "86o",
      "76s", "75s", "74s", "73s", "76o", "75o",
      "65s", "64s", "63s", "62s", "65o",
      "54s", "53s", "52s", "54o",
      "43s", "42s",
      "32s",
    ],
  },
};

// ═══════════════════════════════════════════════════════
// SCENARIO DEFINITIONS
// ═══════════════════════════════════════════════════════

const SCENARIOS = {
  btn_vs_bb: {
    name: "BTN open vs BB defend",
    ip: { position: "btn", range: RFI_RANGES.btn },
    oop: { position: "bb", range: [...BB_DEFENSE.vs_btn.threebet, ...BB_DEFENSE.vs_btn.call] },
    pot: 7,      // 2.5x open + BB call = ~7 BB
    stack: 93,   // 100 - 7 = 93 effective
  },
  co_vs_bb: {
    name: "CO open vs BB defend",
    ip: { position: "co", range: RFI_RANGES.co },
    oop: { position: "bb", range: [...BB_DEFENSE.vs_co.threebet, ...BB_DEFENSE.vs_co.call] },
    pot: 7,
    stack: 93,
  },
  utg_vs_bb: {
    name: "UTG/HJ open vs BB defend",
    ip: { position: "utg", range: [...RFI_RANGES.utg, ...RFI_RANGES.hj.filter(h => !RFI_RANGES.utg.includes(h))] },
    oop: { position: "bb", range: [...BB_DEFENSE.vs_utg.threebet, ...BB_DEFENSE.vs_utg.call] },
    pot: 7,
    stack: 93,
  },
  bvb: {
    name: "SB open vs BB defend (Blind vs Blind)",
    ip: { position: "sb", range: RFI_RANGES.sb },  // SB is OOP in BvB but opens
    oop: { position: "bb", range: [...BB_DEFENSE.vs_sb.threebet, ...BB_DEFENSE.vs_sb.call] },
    pot: 6,      // SB raises to 3x, BB calls = 6 BB
    stack: 94,
  },
};

// ═══════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════

function toSolverRange(hands) {
  // Deduplicate and join with commas
  return [...new Set(hands)].join(",");
}

function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const [scenarioId, scenario] of Object.entries(SCENARIOS)) {
    const config = {
      scenarioId,
      name: scenario.name,
      ip: {
        position: scenario.ip.position,
        rangeString: toSolverRange(scenario.ip.range),
        handCount: new Set(scenario.ip.range).size,
      },
      oop: {
        position: scenario.oop.position,
        rangeString: toSolverRange(scenario.oop.range),
        handCount: new Set(scenario.oop.range).size,
      },
      pot: scenario.pot,
      stack: scenario.stack,
    };

    const filepath = path.join(OUTPUT_DIR, `${scenarioId}.json`);
    fs.writeFileSync(filepath, JSON.stringify(config, null, 2));

    console.log(`${scenarioId}:`);
    console.log(`  ${scenario.name}`);
    console.log(`  IP (${config.ip.position}): ${config.ip.handCount} hand classes`);
    console.log(`  OOP (${config.oop.position}): ${config.oop.handCount} hand classes`);
    console.log(`  Pot: ${config.pot} BB, Stack: ${config.stack} BB`);
    console.log(`  → ${filepath}`);
    console.log();
  }

  console.log(`Generated ${Object.keys(SCENARIOS).length} scenario configs in ${OUTPUT_DIR}`);
}

main();
