/**
 * DEPRECATED — The preflop system now uses range classifications
 * (preflopClassification.ts) instead of frequency lookup tables.
 * This generator produced complete_preflop_tables.json which is no
 * longer loaded at runtime. Kept for reference only.
 *
 * Generate Complete Preflop Frequency Table
 *
 * Replaces PokerBench preflop data with solver-quality frequencies derived from:
 * 1. Validated GTO ranges (which hands are in/out for each position)
 * 2. Hand strength ordering (169 hand classes ranked by equity)
 * 3. Edge frequency math (smooth gradients at range boundaries)
 *
 * Output: complete_preflop_table.json — drop-in replacement for PokerBench
 */

import { writeFileSync } from "fs";

// ═══════════════════════════════════════════════════════
// HAND STRENGTH ORDER (from combos.ts)
// ═══════════════════════════════════════════════════════

const HAND_STRENGTH_ORDER = [
  "AA", "KK", "QQ", "AKs", "JJ",
  "AQs", "TT", "AKo", "AJs", "KQs",
  "99", "ATs", "AQo",
  "KJs", "88", "QJs", "KTs", "A9s",
  "AJo", "QTs", "KQo", "77", "JTs",
  "A8s", "K9s", "ATo", "A7s", "KJo",
  "Q9s", "66", "A5s", "A6s", "A4s",
  "QJo", "T9s", "J9s", "KTo", "A3s",
  "A2s", "55", "K8s", "98s", "QTo",
  "K7s", "JTo", "87s", "Q8s", "44",
  "K6s", "T8s", "J8s", "97s", "A9o",
  "76s", "K5s", "33", "Q7s", "K4s",
  "Q9o", "J9o", "65s", "86s", "K3s",
  "22", "T9o", "K2s", "54s", "Q6s",
  "A8o", "75s", "96s", "Q5s", "J7s",
  "T7s", "64s", "A7o", "Q4s", "98o",
  "A5o", "53s", "85s", "Q3s", "A6o",
  "J6s", "87o", "Q2s", "43s", "A4o",
  "74s", "T6s", "A3o", "95s", "76o",
  "J5s", "A2o", "J8o", "Q8o", "63s",
  "84s", "T8o", "J4s", "97o", "52s",
  "65o", "T5s", "86o", "J3s", "54o",
  "73s", "K9o", "J2s", "T4s", "96o",
  "42s", "75o", "T3s", "64o",
  "62s", "T2s", "85o", "53o", "32s",
  "93s", "K8o", "43o", "92s", "74o",
  "83s", "95o", "82s", "K7o", "63o",
  "72s", "K6o", "52o", "K5o", "84o",
  "K4o", "42o", "73o", "K3o", "62o",
  "K2o", "Q7o", "32o", "Q6o", "93o",
  "Q5o", "92o", "Q4o", "83o", "Q3o",
  "82o", "Q2o", "72o",
  "J7o", "J6o", "J5o", "J4o", "J3o", "J2o",
  "T7o", "T6o", "T5o", "T4o", "T3o", "T2o",
  "94s", "94o",
];

// ═══════════════════════════════════════════════════════
// VALIDATED GTO RANGES (from preflopRanges.ts)
// ═══════════════════════════════════════════════════════

const GTO_RFI_RANGES = {
  utg: new Set([
    "AA", "KK", "QQ", "JJ", "TT", "99", "88", "77", "66",
    "AKs", "AQs", "AJs", "ATs", "A5s", "A4s",
    "AKo", "AQo", "AJo",
    "KQs", "KJs", "KTs",
    "QJs", "QTs",
    "JTs",
    "T9s", "98s", "87s", "76s", "65s",
  ]),
  hj: new Set([
    "AA", "KK", "QQ", "JJ", "TT", "99", "88", "77", "66",
    "AKs", "AQs", "AJs", "ATs", "A9s", "A5s", "A4s", "A3s",
    "AKo", "AQo", "AJo", "ATo",
    "KQs", "KJs", "KTs", "K9s", "KQo",
    "QJs", "QTs", "Q9s", "QJo",
    "JTs", "J9s",
    "T9s", "T8s", "98s", "97s", "87s", "86s", "76s", "75s", "65s", "64s", "54s",
  ]),
  co: new Set([
    "AA", "KK", "QQ", "JJ", "TT", "99", "88", "77", "66", "55", "44",
    "AKs", "AQs", "AJs", "ATs", "A9s", "A8s", "A7s", "A6s", "A5s", "A4s", "A3s", "A2s",
    "AKo", "AQo", "AJo", "ATo", "A9o", "A8o",
    "KQs", "KJs", "KTs", "K9s", "K8s", "K7s", "KQo", "KJo", "KTo",
    "QJs", "QTs", "Q9s", "Q8s", "QJo", "QTo",
    "JTs", "J9s", "J8s", "JTo",
    "T9s", "T8s", "T7s", "T9o",
    "98s", "97s", "96s", "98o",
    "87s", "86s", "85s", "76s", "75s", "74s", "65s", "64s", "63s", "54s", "53s", "43s",
  ]),
  btn: new Set([
    "AA", "KK", "QQ", "JJ", "TT", "99", "88", "77", "66", "55", "44", "33", "22",
    "AKs", "AQs", "AJs", "ATs", "A9s", "A8s", "A7s", "A6s", "A5s", "A4s", "A3s", "A2s",
    "AKo", "AQo", "AJo", "ATo", "A9o", "A8o", "A7o", "A6o", "A5o", "A4o", "A3o", "A2o",
    "KQs", "KJs", "KTs", "K9s", "K8s", "K7s", "K6s", "K5s", "K4s", "K3s", "K2s",
    "KQo", "KJo", "KTo", "K9o", "K8o", "K7o", "K6o", "K5o",
    "QJs", "QTs", "Q9s", "Q8s", "Q7s", "Q6s", "Q5s", "Q4s", "Q3s", "Q2s",
    "QJo", "QTo", "Q9o", "Q8o",
    "JTs", "J9s", "J8s", "J7s", "J6s", "J5s", "JTo", "J9o", "J8o",
    "T9s", "T8s", "T7s", "T6s", "T9o", "T8o",
    "98s", "97s", "96s", "95s", "98o", "97o",
    "87s", "86s", "85s", "84s", "87o", "86o",
    "76s", "75s", "74s", "73s", "76o", "75o",
    "65s", "64s", "63s", "62s", "65o", "64o",
    "54s", "53s", "52s", "54o",
    "43s", "42s", "32s",
  ]),
  sb: new Set([
    "AA", "KK", "QQ", "JJ", "TT", "99", "88", "77", "66", "55", "44", "33", "22",
    "AKs", "AQs", "AJs", "ATs", "A9s", "A8s", "A7s", "A6s", "A5s", "A4s", "A3s", "A2s",
    "AKo", "AQo", "AJo", "ATo", "A9o", "A8o", "A7o", "A6o", "A5o", "A4o",
    "KQs", "KJs", "KTs", "K9s", "K8s", "K7s", "K6s", "K5s", "K4s",
    "KQo", "KJo", "KTo", "K9o",
    "QJs", "QTs", "Q9s", "Q8s", "Q7s", "Q6s", "Q5s",
    "QJo", "QTo", "Q9o",
    "JTs", "J9s", "J8s", "J7s", "J6s", "JTo", "J9o",
    "T9s", "T8s", "T7s", "T6s", "T9o",
    "98s", "97s", "96s", "95s",
    "87s", "86s", "85s",
    "76s", "75s", "74s",
    "65s", "64s", "63s",
    "54s", "53s", "52s",
    "43s", "42s", "32s",
  ]),
};

// BB defense ranges by raiser position
const GTO_BB_DEFENSE = {
  vs_utg: {
    threebet: new Set(["AA", "KK", "QQ", "AKs", "AKo", "A5s", "A4s"]),
    call: new Set([
      "JJ", "TT", "99", "88", "77", "66", "55",
      "AQs", "AJs", "ATs", "A9s", "A8s",
      "AQo", "AJo",
      "KQs", "KJs", "KTs",
      "QJs", "QTs",
      "JTs", "J9s",
      "T9s", "98s", "87s", "76s", "65s", "54s",
    ]),
  },
  vs_hj: {
    threebet: new Set(["AA", "KK", "QQ", "AKs", "AKo", "A5s", "A4s"]),
    call: new Set([
      "JJ", "TT", "99", "88", "77", "66", "55",
      "AQs", "AJs", "ATs", "A9s", "A8s",
      "AQo", "AJo", "ATo",
      "KQs", "KJs", "KTs", "K9s",
      "KQo",
      "QJs", "QTs", "Q9s",
      "JTs", "J9s",
      "T9s", "T8s", "98s", "87s", "76s", "65s", "54s",
    ]),
  },
  vs_co: {
    threebet: new Set(["AA", "KK", "QQ", "JJ", "AKs", "AQs", "AKo", "A5s", "A4s", "A3s"]),
    call: new Set([
      "TT", "99", "88", "77", "66", "55", "44", "33", "22",
      "AJs", "ATs", "A9s", "A8s", "A7s", "A6s", "A5s", "A4s", "A3s", "A2s",
      "AQo", "AJo", "ATo",
      "KQs", "KJs", "KTs", "K9s", "K8s",
      "KQo", "KJo",
      "QJs", "QTs", "Q9s",
      "QJo",
      "JTs", "J9s", "J8s",
      "T9s", "T8s",
      "98s", "97s", "87s", "86s", "76s", "75s", "65s", "64s", "54s", "53s", "43s",
    ]),
  },
  vs_btn: {
    threebet: new Set([
      "AA", "KK", "QQ", "JJ", "TT",
      "AKs", "AQs", "AJs", "AKo", "AQo",
      "A5s", "A4s", "A3s", "A2s",
      "KQs", "KJs",
      "76s", "65s", "54s",
    ]),
    call: new Set([
      "99", "88", "77", "66", "55", "44", "33", "22",
      "ATs", "A9s", "A8s", "A7s", "A6s",
      "AJo", "ATo", "A9o",
      "KTs", "K9s", "K8s", "K7s", "K6s", "K5s", "K4s",
      "KQo", "KJo", "KTo", "K9o",
      "QJs", "QTs", "Q9s", "Q8s", "Q7s", "Q6s",
      "QJo", "QTo",
      "JTs", "J9s", "J8s", "J7s",
      "JTo", "J9o",
      "T9s", "T8s", "T7s", "T6s",
      "T9o",
      "98s", "97s", "96s", "95s",
      "87s", "86s", "85s",
      "76s", "75s", "74s",
      "65s", "64s", "63s",
      "54s", "53s", "52s",
      "43s", "42s",
      "32s",
    ]),
  },
};

// 3-bet ranges by position (non-BB facing a raise)
const GTO_3BET_RANGES = {
  btn: new Set([
    "AA", "KK", "QQ", "JJ", "TT",
    "AKs", "AQs", "AJs", "AKo", "AQo",
    "A5s", "A4s", "A3s",
  ]),
  co: new Set(["AA", "KK", "QQ", "JJ", "AKs", "AQs", "AKo", "A5s", "A4s"]),
  sb: new Set([
    "AA", "KK", "QQ", "JJ", "TT",
    "AKs", "AQs", "AJs", "ATs", "AKo", "AQo",
    "A5s", "A4s", "A3s", "A2s", "KQs", "KJs",
  ]),
  hj: new Set(["AA", "KK", "QQ", "JJ", "AKs", "AQs", "AKo", "A5s"]),
  // UTG facing a 3-bet: tight 4-bet range (opened UTG so already strong)
  utg: new Set(["AA", "KK", "QQ", "AKs", "AKo"]),
  // BB facing a 3-bet (open + 3-bet already happened, BB cold-decides)
  bb: new Set(["AA", "KK", "AKs"]),
};

// Hands that 3-bet at MIXED frequency (sometimes 3-bet, sometimes call)
// These get ~30% raise, ~55% call, ~15% fold instead of 90% raise
const GTO_3BET_MIXED = {
  btn: new Set(["KQs", "76s", "65s", "54s"]),
  co: new Set([]),
  sb: new Set(["76s", "65s"]),
  hj: new Set([]),
  utg: new Set([]), // UTG 4-bets are pure, no mixed range
  bb: new Set(["QQ", "AKo"]),
};

// Cold-call ranges: hands too strong to fold but not 3-betting
const GTO_COLD_CALL_RANGES = {
  btn: new Set([
    "99", "88", "77", "66", "55",
    "ATs", "A9s", "A8s",
    "AJo", "ATo",
    "KQs", "KJs", "KTs", "K9s",
    "KQo",
    "QJs", "QTs",
    "JTs", "J9s",
    "T9s", "98s", "87s", "76s", "65s", "54s",
  ]),
  co: new Set([
    "TT", "99", "88", "77",
    "AJs", "ATs", "A9s",
    "AJo",
    "KQs", "KJs", "KTs",
    "KQo",
    "QJs", "QTs",
    "JTs",
    "T9s", "98s",
  ]),
  sb: new Set([
    "99", "88", "77",
    "A9s", "A8s",
    "AJo",
    "KTs", "K9s",
    "KQo",
    "QJs", "QTs",
    "JTs", "J9s",
    "T9s", "98s", "87s",
  ]),
  // UTG facing a 3-bet: call with medium-strength hands (opened tight)
  utg: new Set([
    "JJ", "TT", "99",
    "AQs", "AJs",
    "AQo",
    "KQs",
  ]),
  hj: new Set([
    "TT", "99", "88",
    "AJs", "ATs",
    "AJo",
    "KQs", "KJs",
    "QJs",
    "JTs",
    "T9s",
  ]),
  // BB facing a 3-bet: call with strong but not 4-bet hands
  bb: new Set([
    "JJ", "TT", "99",
    "AQs", "AJs", "ATs",
    "AQo",
    "KQs", "KJs",
    "QJs", "JTs",
  ]),
};

// BvB ranges
const GTO_BVB = {
  sb_open: GTO_RFI_RANGES.sb,
  bb_3bet: new Set([
    "AA", "KK", "QQ", "JJ", "TT", "99",
    "AKs", "AQs", "AJs", "ATs", "AKo", "AQo",
    "A5s", "A4s", "A3s", "A2s",
    "KQs", "KJs",
    "76s", "65s", "54s",
  ]),
  bb_call: new Set([
    "88", "77", "66", "55", "44", "33", "22",
    "A9s", "A8s", "A7s", "A6s",
    "AJo", "ATo", "A9o", "A8o", "A7o",
    "KTs", "K9s", "K8s", "K7s", "K6s", "K5s",
    "KQo", "KJo", "KTo", "K9o",
    "QJs", "QTs", "Q9s", "Q8s", "Q7s", "Q6s", "Q5s",
    "QJo", "QTo", "Q9o",
    "JTs", "J9s", "J8s", "J7s", "J6s",
    "JTo", "J9o",
    "T9s", "T8s", "T7s", "T6s", "T9o",
    "98s", "97s", "96s", "95s",
    "87s", "86s", "85s", "87o",
    "76s", "75s", "74s", "76o",
    "65s", "64s", "63s", "65o",
    "54s", "53s", "52s", "54o",
    "43s", "42s", "32s",
  ]),
};

// 4-bet / 5-bet ranges
const GTO_4BET = {
  value: new Set(["AA", "KK", "AKs", "AKo"]),
  bluffs: new Set(["A5s", "A4s", "A3s", "A2s"]),
};

const PREMIUMS = new Set(["AA", "KK", "QQ", "JJ", "TT", "AKs", "AQs", "AKo", "AJs", "KQs"]);

// ═══════════════════════════════════════════════════════
// FREQUENCY GENERATION
// ═══════════════════════════════════════════════════════

/**
 * For a hand at a given distance from the range boundary,
 * compute a smooth mixing frequency.
 *
 * distance > 0: inside range (raise heavy)
 * distance = 0: at boundary (50/50 mix)
 * distance < 0: outside range (fold heavy)
 */
function edgeFrequency(distance, maxRaise = 0.90, minRaise = 0.05, edgeWidth = 4) {
  // Sigmoid-like curve centered at boundary
  const t = Math.max(-edgeWidth, Math.min(edgeWidth, distance)) / edgeWidth;
  const raiseFreq = minRaise + (maxRaise - minRaise) * ((t + 1) / 2);
  return Math.round(raiseFreq * 100) / 100;
}

function generateRfiTable() {
  const positions = ["utg", "hj", "co", "btn", "sb", "bb"];
  const result = {};

  for (const pos of positions) {
    const posFreqs = {};

    // BB in unopened pot: never fold (already posted), raise premiums, check rest
    if (pos === "bb") {
      for (const hand of HAND_STRENGTH_ORDER) {
        if (PREMIUMS.has(hand)) {
          posFreqs[hand] = { fold: 0, call: 0.15, raise: 0.85, sampleCount: 100 };
        } else {
          const idx = HAND_STRENGTH_ORDER.indexOf(hand);
          const raiseFreq = idx < 30 ? 0.40 : idx < 60 ? 0.15 : 0.05;
          posFreqs[hand] = { fold: 0, call: 1 - raiseFreq, raise: raiseFreq, sampleCount: 100 };
        }
      }
      result[pos] = posFreqs;
      continue;
    }

    const range = GTO_RFI_RANGES[pos];

    // Find the boundary index: last hand in the range
    let boundaryIdx = -1;
    for (let i = HAND_STRENGTH_ORDER.length - 1; i >= 0; i--) {
      if (range.has(HAND_STRENGTH_ORDER[i])) {
        boundaryIdx = i;
        break;
      }
    }

    for (let i = 0; i < HAND_STRENGTH_ORDER.length; i++) {
      const hand = HAND_STRENGTH_ORDER[i];
      const inRange = range.has(hand);

      let raise;
      if (PREMIUMS.has(hand)) {
        raise = 0.95; // Premiums always raise
      } else if (inRange) {
        // Hand is explicitly in the range
        const distance = boundaryIdx - i; // positive = well inside
        if (distance > 5) {
          raise = 0.90; // Deep inside range
        } else {
          raise = edgeFrequency(distance);
        }
      } else {
        // Hand is NOT in the range — use negative distance from nearest in-range hand
        // Find the closest range hand that's weaker than this one
        let closestAbove = -1;
        for (let j = i - 1; j >= 0; j--) {
          if (range.has(HAND_STRENGTH_ORDER[j])) { closestAbove = j; break; }
        }
        const distFromRange = closestAbove >= 0 ? closestAbove - i : -10; // always negative
        raise = edgeFrequency(distFromRange);
      }

      const fold = Math.round((1 - raise) * 100) / 100;
      posFreqs[hand] = { fold, call: 0, raise, sampleCount: 100 };
    }

    result[pos] = posFreqs;
  }

  return {
    archetypeId: "rfi_opening",
    source: "Derived from validated GTO ranges + equity-based edge frequencies",
    totalRows: Object.values(result).reduce((sum, pos) => sum + Object.keys(pos).length, 0),
    openers: { any: result },
  };
}

function generateBbDefenseTable() {
  const openerKeys = { vs_utg: "utg", vs_hj: "hj", vs_co: "co", vs_btn: "btn" };
  const openers = {};

  for (const [key, openerPos] of Object.entries(openerKeys)) {
    const def = GTO_BB_DEFENSE[key];
    const bbFreqs = {};

    for (const hand of HAND_STRENGTH_ORDER) {
      if (def.threebet.has(hand)) {
        // 3-bet hands: mostly raise, some call
        const isPremium = PREMIUMS.has(hand);
        bbFreqs[hand] = {
          fold: isPremium ? 0.02 : 0.05,
          call: 0.10,
          raise: isPremium ? 0.88 : 0.85,
          sampleCount: 100,
        };
      } else if (def.call.has(hand)) {
        // Calling hands: mostly call, some fold, rarely raise
        bbFreqs[hand] = { fold: 0.05, call: 0.85, raise: 0.10, sampleCount: 100 };
      } else {
        // Not in defense range — fold, but with position-aware edge
        const idx = HAND_STRENGTH_ORDER.indexOf(hand);
        // Find boundary (last calling hand)
        let boundaryIdx = -1;
        for (let i = HAND_STRENGTH_ORDER.length - 1; i >= 0; i--) {
          if (def.call.has(HAND_STRENGTH_ORDER[i]) || def.threebet.has(HAND_STRENGTH_ORDER[i])) {
            boundaryIdx = i;
            break;
          }
        }
        const distance = boundaryIdx - idx;
        const continueFreq = edgeFrequency(distance, 0.80, 0.02, 5);

        if (continueFreq > 0.10) {
          bbFreqs[hand] = {
            fold: Math.round((1 - continueFreq) * 100) / 100,
            call: Math.round(continueFreq * 0.85 * 100) / 100,
            raise: Math.round(continueFreq * 0.15 * 100) / 100,
            sampleCount: 100,
          };
        } else {
          // Clearly outside range
          const baseFold = key === "vs_btn" ? 0.75 : key === "vs_co" ? 0.85 : key === "vs_hj" ? 0.88 : 0.92;
          bbFreqs[hand] = {
            fold: baseFold,
            call: (1 - baseFold) * 0.8,
            raise: (1 - baseFold) * 0.2,
            sampleCount: 100,
          };
        }
      }
    }

    openers[openerPos] = { bb: bbFreqs };
  }

  return {
    archetypeId: "bb_defense_vs_rfi",
    source: "Derived from validated GTO BB defense ranges + edge frequencies",
    totalRows: Object.values(openers).reduce(
      (sum, o) => sum + Object.keys(Object.values(o)[0]).length, 0
    ),
    openers,
  };
}

function generate3BetTable() {
  const positions = ["btn", "co", "sb", "hj", "utg", "bb"];
  const result = {};

  for (const pos of positions) {
    const range = GTO_3BET_RANGES[pos] ?? new Set();
    const mixedRange = GTO_3BET_MIXED[pos] ?? new Set();
    const coldCallRange = GTO_COLD_CALL_RANGES[pos] ?? new Set();
    const posFreqs = {};

    for (let i = 0; i < HAND_STRENGTH_ORDER.length; i++) {
      const hand = HAND_STRENGTH_ORDER[i];

      if (range.has(hand)) {
        // Pure 3-bet range: raise heavy
        const isPremium = PREMIUMS.has(hand);
        posFreqs[hand] = {
          fold: isPremium ? 0.02 : 0.05,
          call: isPremium ? 0.03 : 0.05,
          raise: isPremium ? 0.95 : 0.90,
          sampleCount: 100,
        };
      } else if (mixedRange.has(hand)) {
        // Mixed 3-bet/call hands (suited connectors as bluffs, etc.)
        // Sometimes 3-bet, sometimes flat, rarely fold
        posFreqs[hand] = {
          fold: 0.15,
          call: 0.55,
          raise: 0.30,
          sampleCount: 100,
        };
      } else if (coldCallRange.has(hand)) {
        // Cold-call range: mostly call, some fold, rarely raise
        posFreqs[hand] = {
          fold: 0.10,
          call: 0.80,
          raise: 0.10,
          sampleCount: 100,
        };
      } else {
        // Outside all ranges — fold heavy, position-aware
        const baseFold = pos === "btn" ? 0.80 : pos === "bb" ? 0.85 : pos === "sb" ? 0.75 : 0.88;
        posFreqs[hand] = {
          fold: baseFold,
          call: Math.round((1 - baseFold) * 0.6 * 100) / 100,
          raise: Math.round((1 - baseFold) * 0.4 * 100) / 100,
          sampleCount: 100,
        };
      }
    }

    result[pos] = posFreqs;
  }

  return {
    archetypeId: "three_bet_pots",
    source: "Derived from validated GTO 3-bet ranges + cold-call edge frequencies",
    totalRows: Object.values(result).reduce((sum, pos) => sum + Object.keys(pos).length, 0),
    openers: { any: result },
  };
}

function generateBvbTable() {
  const result = {};

  // SB open range (same as RFI from SB, no limp)
  const sbFreqs = {};
  const sbRange = GTO_BVB.sb_open;
  let sbBoundary = -1;
  for (let i = HAND_STRENGTH_ORDER.length - 1; i >= 0; i--) {
    if (sbRange.has(HAND_STRENGTH_ORDER[i])) { sbBoundary = i; break; }
  }
  for (let i = 0; i < HAND_STRENGTH_ORDER.length; i++) {
    const hand = HAND_STRENGTH_ORDER[i];
    const distance = sbBoundary - i;
    let raise;
    if (PREMIUMS.has(hand)) raise = 0.95;
    else if (sbRange.has(hand) && distance > 5) raise = 0.90;
    else raise = edgeFrequency(distance, 0.90, 0.05, 5);
    sbFreqs[hand] = { fold: Math.round((1 - raise) * 100) / 100, call: 0, raise, sampleCount: 100 };
  }
  result.sb = sbFreqs;

  // BB defense vs SB (wide defense)
  const bbFreqs = {};
  for (const hand of HAND_STRENGTH_ORDER) {
    if (GTO_BVB.bb_3bet.has(hand)) {
      const isPremium = PREMIUMS.has(hand);
      bbFreqs[hand] = {
        fold: isPremium ? 0.02 : 0.05,
        call: 0.10,
        raise: isPremium ? 0.88 : 0.85,
        sampleCount: 100,
      };
    } else if (GTO_BVB.bb_call.has(hand)) {
      bbFreqs[hand] = { fold: 0.05, call: 0.85, raise: 0.10, sampleCount: 100 };
    } else {
      // Outside BvB defense — but BB defends very wide in BvB
      bbFreqs[hand] = { fold: 0.60, call: 0.30, raise: 0.10, sampleCount: 100 };
    }
  }
  result.bb = bbFreqs;

  return {
    archetypeId: "blind_vs_blind",
    source: "Derived from validated GTO BvB ranges",
    totalRows: Object.keys(sbFreqs).length + Object.keys(bbFreqs).length,
    openers: { any: result },
  };
}

function generate4BetTable() {
  const result = {};

  // Hero facing a 3-bet (deciding to 4-bet, call, or fold)
  for (const pos of ["btn", "co", "sb", "utg", "hj", "bb"]) {
    const posFreqs = {};
    for (const hand of HAND_STRENGTH_ORDER) {
      if (GTO_4BET.value.has(hand)) {
        posFreqs[hand] = { fold: 0.02, call: 0.08, raise: 0.90, sampleCount: 100 };
      } else if (GTO_4BET.bluffs.has(hand)) {
        posFreqs[hand] = { fold: 0.20, call: 0.10, raise: 0.70, sampleCount: 100 };
      } else if (PREMIUMS.has(hand)) {
        // QQ, JJ, AQs etc — mostly call the 3-bet
        posFreqs[hand] = { fold: 0.05, call: 0.80, raise: 0.15, sampleCount: 100 };
      } else {
        // Everything else folds to a 3-bet (with position-aware edge)
        const idx = HAND_STRENGTH_ORDER.indexOf(hand);
        // Hands just below premiums might call sometimes
        if (idx < 25) {
          posFreqs[hand] = { fold: 0.40, call: 0.50, raise: 0.10, sampleCount: 100 };
        } else if (idx < 45) {
          posFreqs[hand] = { fold: 0.70, call: 0.25, raise: 0.05, sampleCount: 100 };
        } else {
          posFreqs[hand] = { fold: 0.92, call: 0.05, raise: 0.03, sampleCount: 100 };
        }
      }
    }
    result[pos] = posFreqs;
  }

  return {
    archetypeId: "four_bet_five_bet",
    source: "Derived from validated GTO 4-bet/5-bet ranges",
    totalRows: Object.values(result).reduce((sum, pos) => sum + Object.keys(pos).length, 0),
    openers: { any: result },
  };
}

// ═══════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════

const tables = [
  generateRfiTable(),
  generateBbDefenseTable(),
  generate3BetTable(),
  generateBvbTable(),
  generate4BetTable(),
];

// Validate
let totalCells = 0;
for (const table of tables) {
  console.log(`${table.archetypeId}: ${table.totalRows} cells`);
  totalCells += table.totalRows;

  // Check premiums
  for (const [opener, positions] of Object.entries(table.openers)) {
    for (const [pos, hands] of Object.entries(positions)) {
      for (const premium of ["AA", "KK"]) {
        const freq = hands[premium];
        if (freq && freq.fold > 0.10) {
          console.warn(`  WARNING: ${premium} ${pos} (${opener}) has fold=${freq.fold}`);
        }
      }
      // Check no limp in RFI/BvB (BB is exempt — checking is free, not a limp)
      const isLimpableSpot = (table.archetypeId === "rfi_opening" && pos !== "bb")
        || (table.archetypeId === "blind_vs_blind" && pos === "sb");
      if (isLimpableSpot) {
        for (const [hand, freq] of Object.entries(hands)) {
          if (freq.call > 0.001) {
            console.warn(`  WARNING: Limp detected: ${hand} ${pos} call=${freq.call}`);
          }
        }
      }
    }
  }
}

console.log(`\nTotal: ${totalCells} cells across ${tables.length} archetypes`);

const outputPath = new URL("./complete_preflop_tables.json", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
writeFileSync(outputPath, JSON.stringify(tables, null, 2));
console.log(`\nWritten to: ${outputPath}`);
