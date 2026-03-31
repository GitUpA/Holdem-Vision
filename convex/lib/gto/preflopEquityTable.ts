/**
 * Preflop Equity Table — equity of every hand class vs a random hand (heads up).
 *
 * Computed via Monte Carlo (100K trials per hand class) using our own evaluateHand().
 * Validated against the 500K trial run: top hands match within 0.1%, all within 0.5%.
 *
 * These are exact enough for teaching purposes (~0.3% precision at 100K trials).
 * The relative ordering across all 169 hands is correct.
 *
 * To regenerate: node data/solver/computePreflopEquity.ts 1 100000
 *
 * Pure TypeScript, zero Convex imports.
 */

/** Preflop equity vs a random hand (0-1) for all 169 hand classes. */
export const PREFLOP_EQUITY: Record<string, number> = {
  // ── Pairs ──
  AA: 0.853, KK: 0.822, QQ: 0.799, JJ: 0.777,
  TT: 0.750, "99": 0.722, "88": 0.690, "77": 0.661,
  "66": 0.635, "55": 0.601, "44": 0.573, "33": 0.536, "22": 0.503,

  // ── Suited aces ──
  AKs: 0.671, AQs: 0.662, AJs: 0.655, ATs: 0.646,
  A9s: 0.629, A8s: 0.618, A7s: 0.611, A6s: 0.599,
  A5s: 0.601, A4s: 0.589, A3s: 0.585, A2s: 0.574,

  // ── Offsuit aces ──
  AKo: 0.650, AQo: 0.644, AJo: 0.639, ATo: 0.628,
  A9o: 0.609, A8o: 0.599, A7o: 0.589, A6o: 0.578,
  A5o: 0.574, A4o: 0.569, A3o: 0.556, A2o: 0.547,

  // ── Suited kings ──
  KQs: 0.635, KJs: 0.624, KTs: 0.619, K9s: 0.600,
  K8s: 0.583, K7s: 0.576, K6s: 0.568, K5s: 0.559,
  K4s: 0.549, K3s: 0.538, K2s: 0.530,

  // ── Offsuit kings ──
  KQo: 0.616, KJo: 0.603, KTo: 0.595, K9o: 0.575,
  K8o: 0.560, K7o: 0.552, K6o: 0.543, K5o: 0.536,
  K4o: 0.524, K3o: 0.514, K2o: 0.506,

  // ── Suited queens ──
  QJs: 0.601, QTs: 0.597, Q9s: 0.579, Q8s: 0.560,
  Q7s: 0.543, Q6s: 0.533, Q5s: 0.527, Q4s: 0.519,
  Q3s: 0.512, Q2s: 0.503,

  // ── Offsuit queens ──
  QJo: 0.581, QTo: 0.576, Q9o: 0.555, Q8o: 0.535,
  Q7o: 0.519, Q6o: 0.510, Q5o: 0.499, Q4o: 0.491,
  Q3o: 0.483, Q2o: 0.474,

  // ── Suited jacks ──
  JTs: 0.576, J9s: 0.556, J8s: 0.539, J7s: 0.520,
  J6s: 0.509, J5s: 0.499, J4s: 0.489, J3s: 0.484,
  J2s: 0.474,

  // ── Offsuit jacks ──
  JTo: 0.552, J9o: 0.530, J8o: 0.515, J7o: 0.496,
  J6o: 0.482, J5o: 0.472, J4o: 0.464, J3o: 0.453,
  J2o: 0.442,

  // ── Suited tens ──
  T9s: 0.540, T8s: 0.523, T7s: 0.505, T6s: 0.490,
  T5s: 0.473, T4s: 0.465, T3s: 0.457, T2s: 0.448,

  // ── Offsuit tens ──
  T9o: 0.515, T8o: 0.498, T7o: 0.479, T6o: 0.462,
  T5o: 0.446, T4o: 0.436, T3o: 0.427, T2o: 0.417,

  // ── Suited connectors/gappers ──
  "98s": 0.509, "97s": 0.491, "96s": 0.476, "95s": 0.456, "94s": 0.439, "93s": 0.433, "92s": 0.425,
  "87s": 0.479, "86s": 0.464, "85s": 0.443, "84s": 0.427, "83s": 0.408, "82s": 0.403,
  "76s": 0.456, "75s": 0.434, "74s": 0.417, "73s": 0.401, "72s": 0.382,
  "65s": 0.432, "64s": 0.414, "63s": 0.394, "62s": 0.376,
  "54s": 0.417, "53s": 0.399, "52s": 0.379,
  "43s": 0.386, "42s": 0.366,
  "32s": 0.360,

  // ── Offsuit connectors/gappers ──
  "98o": 0.483, "97o": 0.465, "96o": 0.446, "95o": 0.428, "94o": 0.407, "93o": 0.398, "92o": 0.390,
  "87o": 0.454, "86o": 0.434, "85o": 0.414, "84o": 0.394, "83o": 0.373, "82o": 0.369,
  "76o": 0.423, "75o": 0.404, "74o": 0.385, "73o": 0.366, "72o": 0.343,
  "65o": 0.400, "64o": 0.379, "63o": 0.362, "62o": 0.345,
  "54o": 0.381, "53o": 0.361, "52o": 0.343,
  "43o": 0.351, "42o": 0.331,
  "32o": 0.325,
};

/**
 * Get preflop equity for a hand class.
 * Returns equity vs random hand (0-1), or 0.45 if not found.
 */
export function getPreflopEquity(handClass: string): number {
  return PREFLOP_EQUITY[handClass] ?? 0.45;
}
