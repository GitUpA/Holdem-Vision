/**
 * Combo and range utilities for opponent modeling.
 *
 * A "combo" is a specific 2-card holding string like "AhKs".
 * A "hand class" is the shorthand like "AKs", "AKo", "TT".
 * A WeightedRange maps combo strings → weight (0-1).
 *
 * Pure TypeScript, zero Convex imports.
 */
import type { CardIndex, Rank } from "../types/cards";
import type { WeightedRange } from "../types/opponents";
import { RANKS, SUITS } from "../types/cards";
import { rankOf, suitOf, cardFromString } from "../primitives/card";

// ─── Hand class generation ───

/**
 * All 169 unique starting hand classes in Hold'em.
 * Pairs: "AA", "KK", ..., "22" (13)
 * Suited: "AKs", "AQs", ..., "32s" (78)
 * Offsuit: "AKo", "AQo", ..., "32o" (78)
 */
export function allHandClasses(): string[] {
  const classes: string[] = [];
  for (let r1 = 12; r1 >= 0; r1--) {
    for (let r2 = r1; r2 >= 0; r2--) {
      if (r1 === r2) {
        classes.push(`${RANKS[r1]}${RANKS[r2]}`);
      } else {
        classes.push(`${RANKS[r1]}${RANKS[r2]}s`);
        classes.push(`${RANKS[r1]}${RANKS[r2]}o`);
      }
    }
  }
  return classes;
}

/**
 * Get all specific card combos for a hand class.
 * E.g., "AKs" → ["AhKh", "AsKs", "AcKc", "AdKd"]
 *       "AA" → ["AhAs", "AhAc", "AhAd", "AsAc", "AsAd", "AcAd"]
 */
export function combosForHandClass(handClass: string): string[] {
  const combos: string[] = [];
  const isPair = handClass.length === 2;
  const isSuited = handClass.endsWith("s");

  const r1 = handClass[0];
  const r2 = isPair ? handClass[1] : handClass[1];

  if (isPair) {
    // C(4,2) = 6 combos
    for (let s1 = 0; s1 < 4; s1++) {
      for (let s2 = s1 + 1; s2 < 4; s2++) {
        combos.push(`${r1}${SUITS[s1]}${r2}${SUITS[s2]}`);
      }
    }
  } else if (isSuited) {
    // 4 suited combos
    for (let s = 0; s < 4; s++) {
      combos.push(`${r1}${SUITS[s]}${r2}${SUITS[s]}`);
    }
  } else {
    // 12 offsuit combos
    for (let s1 = 0; s1 < 4; s1++) {
      for (let s2 = 0; s2 < 4; s2++) {
        if (s1 !== s2) {
          combos.push(`${r1}${SUITS[s1]}${r2}${SUITS[s2]}`);
        }
      }
    }
  }

  return combos;
}

/**
 * Convert a combo string like "AhKs" to two CardIndex values.
 */
export function comboToCards(combo: string): [CardIndex, CardIndex] {
  return [
    cardFromString(combo.substring(0, 2)),
    cardFromString(combo.substring(2, 4)),
  ];
}

/**
 * Convert two CardIndex values to a normalized combo string.
 * Always puts the higher rank first. For same rank, lower suit first.
 */
export function cardsToCombo(a: CardIndex, b: CardIndex): string {
  const rA = Math.floor(a / 4);
  const rB = Math.floor(b / 4);
  if (rA > rB || (rA === rB && a < b)) {
    return `${rankOf(a)}${suitOf(a)}${rankOf(b)}${suitOf(b)}`;
  }
  return `${rankOf(b)}${suitOf(b)}${rankOf(a)}${suitOf(a)}`;
}

/**
 * Get the hand class for a combo. E.g., "AhKh" → "AKs", "AhKd" → "AKo".
 */
export function comboToHandClass(combo: string): string {
  const r1 = combo[0];
  const s1 = combo[1];
  const r2 = combo[2];
  const s2 = combo[3];

  const rv1 = RANKS.indexOf(r1 as Rank);
  const rv2 = RANKS.indexOf(r2 as Rank);

  // Normalize: higher rank first
  const high = rv1 >= rv2 ? r1 : r2;
  const low = rv1 >= rv2 ? r2 : r1;

  if (r1 === r2) return `${high}${low}`;
  return s1 === s2 ? `${high}${low}s` : `${high}${low}o`;
}

// ─── Range construction ───

/**
 * Build a WeightedRange from a set of hand classes with uniform weight.
 * Filters out combos that conflict with known cards.
 */
export function rangeFromHandClasses(
  handClasses: string[],
  weight: number,
  knownCards: CardIndex[] = [],
): WeightedRange {
  const known = new Set(knownCards);
  const range: WeightedRange = new Map();

  for (const hc of handClasses) {
    for (const combo of combosForHandClass(hc)) {
      const [c1, c2] = comboToCards(combo);
      if (!known.has(c1) && !known.has(c2)) {
        range.set(combo, weight);
      }
    }
  }

  return range;
}

/**
 * Build a range from the top N% of hands (by preflop strength).
 * Uses a standard hand ranking order.
 */
export function topPercentRange(
  pct: number,
  knownCards: CardIndex[] = [],
): WeightedRange {
  const orderedHands = HAND_STRENGTH_ORDER;
  const count = Math.ceil((pct / 100) * orderedHands.length);
  const selected = orderedHands.slice(0, count);
  return rangeFromHandClasses(selected, 1.0, knownCards);
}

/**
 * Filter a range to remove combos that conflict with known cards.
 */
export function filterRange(
  range: WeightedRange,
  knownCards: CardIndex[],
): WeightedRange {
  const known = new Set(knownCards);
  const filtered: WeightedRange = new Map();

  for (const [combo, weight] of range) {
    const [c1, c2] = comboToCards(combo);
    if (!known.has(c1) && !known.has(c2)) {
      filtered.set(combo, weight);
    }
  }

  return filtered;
}

/**
 * Count total combos in a range (sum of weights).
 */
export function rangeSize(range: WeightedRange): number {
  let total = 0;
  for (const w of range.values()) total += w;
  return total;
}

/**
 * Approximate what % of all starting hands a range represents.
 */
export function rangePct(range: WeightedRange): number {
  return (rangeSize(range) / 1326) * 100; // 1326 = C(52,2)
}

// ─── Standard preflop hand ranking ───

/**
 * Hands ordered roughly by preflop equity (best → worst).
 * Standard ordering used by poker software.
 */
export const HAND_STRENGTH_ORDER: string[] = [
  // Tier 1: Premium
  "AA", "KK", "QQ", "AKs", "JJ",
  // Tier 2: Strong
  "AQs", "TT", "AKo", "AJs", "KQs",
  "99", "ATs", "AQo",
  // Tier 3: Playable strong
  "KJs", "88", "QJs", "KTs", "A9s",
  "AJo", "QTs", "KQo", "77", "JTs",
  "A8s", "K9s", "ATo", "A7s", "KJo",
  "Q9s", "66", "A5s", "A6s", "A4s",
  // Tier 4: Playable
  "QJo", "T9s", "J9s", "KTo", "A3s",
  "A2s", "55", "K8s", "98s", "QTo",
  "K7s", "JTo", "87s", "Q8s", "44",
  "K6s", "T8s", "J8s", "97s", "A9o",
  "76s", "K5s", "33", "Q7s", "K4s",
  "Q9o", "J9o", "65s", "86s", "K3s",
  "22", "T9o", "K2s", "54s", "Q6s",
  // Tier 5: Marginal
  "A8o", "75s", "96s", "Q5s", "J7s",
  "T7s", "64s", "A7o", "Q4s", "98o",
  "A5o", "53s", "85s", "Q3s", "A6o",
  "J6s", "87o", "Q2s", "43s", "A4o",
  "74s", "T6s", "A3o", "95s", "76o",
  "J5s", "A2o", "J8o", "Q8o", "63s",
  // Tier 6: Weak
  "84s", "T8o", "J4s", "97o", "52s",
  "65o", "T5s", "86o", "J3s", "54o",
  "73s", "K9o", "J2s", "T4s", "96o",
  "42s", "T9s", "75o", "T3s", "64o",
  "62s", "T2s", "85o", "53o", "32s",
  // Tier 7: Trash
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
