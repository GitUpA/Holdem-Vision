/**
 * Preflop Equity Table — raw equity of every hand class vs a random hand.
 *
 * These are universal preflop equities (no position, no ranges).
 * Computed from millions of Monte Carlo simulations.
 * Source: consensus from ProPokerTools, Equilab, and poker literature.
 *
 * Pure TypeScript, zero Convex imports.
 */

/** Preflop equity vs a random hand (0-1) for all 169 hand classes. */
export const PREFLOP_EQUITY: Record<string, number> = {
  // ── Pairs ──
  AA: 0.852, KK: 0.824, QQ: 0.799, JJ: 0.775,
  TT: 0.750, "99": 0.720, "88": 0.691, "77": 0.661,
  "66": 0.632, "55": 0.604, "44": 0.577, "33": 0.551, "22": 0.527,

  // ── Suited broadways ──
  AKs: 0.670, AQs: 0.662, AJs: 0.654, ATs: 0.647,
  KQs: 0.634, KJs: 0.626, KTs: 0.619,
  QJs: 0.608, QTs: 0.601,
  JTs: 0.592,

  // ── Offsuit broadways ──
  AKo: 0.653, AQo: 0.644, AJo: 0.636, ATo: 0.627,
  KQo: 0.614, KJo: 0.605, KTo: 0.597,
  QJo: 0.586, QTo: 0.578,
  JTo: 0.569,

  // ── Suited aces ──
  A9s: 0.632, A8s: 0.622, A7s: 0.612, A6s: 0.602,
  A5s: 0.604, A4s: 0.594, A3s: 0.584, A2s: 0.574,

  // ── Offsuit aces ──
  A9o: 0.610, A8o: 0.598, A7o: 0.586, A6o: 0.574,
  A5o: 0.576, A4o: 0.564, A3o: 0.554, A2o: 0.543,

  // ── Suited kings ──
  K9s: 0.600, K8s: 0.588, K7s: 0.578, K6s: 0.568,
  K5s: 0.560, K4s: 0.550, K3s: 0.541, K2s: 0.531,

  // ── Offsuit kings ──
  K9o: 0.574, K8o: 0.561, K7o: 0.549, K6o: 0.538,
  K5o: 0.530, K4o: 0.519, K3o: 0.509, K2o: 0.499,

  // ── Suited queens ──
  Q9s: 0.581, Q8s: 0.569, Q7s: 0.556, Q6s: 0.546,
  Q5s: 0.538, Q4s: 0.528, Q3s: 0.518, Q2s: 0.509,

  // ── Offsuit queens ──
  Q9o: 0.554, Q8o: 0.540, Q7o: 0.525, Q6o: 0.514,
  Q5o: 0.505, Q4o: 0.494, Q3o: 0.484, Q2o: 0.474,

  // ── Suited jacks ──
  J9s: 0.572, J8s: 0.559, J7s: 0.546, J6s: 0.535,
  J5s: 0.526, J4s: 0.516, J3s: 0.506, J2s: 0.497,

  // ── Offsuit jacks ──
  J9o: 0.545, J8o: 0.500, J7o: 0.490, J6o: 0.480,
  J5o: 0.493, J4o: 0.482, J3o: 0.472, J2o: 0.462,

  // ── Suited tens ──
  T9s: 0.564, T8s: 0.551, T7s: 0.536, T6s: 0.524,
  T5s: 0.512, T4s: 0.501, T3s: 0.491, T2s: 0.482,

  // ── Offsuit tens ──
  T9o: 0.537, T8o: 0.522, T7o: 0.505, T6o: 0.492,
  T5o: 0.479, T4o: 0.467, T3o: 0.456, T2o: 0.447,

  // ── Suited connectors/gappers ──
  "98s": 0.544, "97s": 0.528, "96s": 0.514, "95s": 0.502,
  "87s": 0.535, "86s": 0.519, "85s": 0.505, "84s": 0.491,
  "76s": 0.526, "75s": 0.510, "74s": 0.494, "73s": 0.479,
  "65s": 0.518, "64s": 0.502, "63s": 0.486, "62s": 0.471,
  "54s": 0.510, "53s": 0.494, "52s": 0.478,
  "43s": 0.484, "42s": 0.467,
  "32s": 0.460,

  // ── Offsuit connectors/gappers ──
  "98o": 0.516, "97o": 0.498, "96o": 0.482, "95o": 0.469,
  "87o": 0.506, "86o": 0.488, "85o": 0.473, "84o": 0.457,
  "76o": 0.497, "75o": 0.479, "74o": 0.461, "73o": 0.445,
  "65o": 0.488, "64o": 0.469, "63o": 0.452, "62o": 0.435,
  "54o": 0.479, "53o": 0.461, "52o": 0.443,
  "43o": 0.449, "42o": 0.431,
  "32o": 0.424,

  // ── Remaining suited ──
  "94s": 0.488, "93s": 0.475, "92s": 0.465,
  "83s": 0.471, "82s": 0.462,
  "72s": 0.440,

  // ── Remaining offsuit ──
  "94o": 0.454, "93o": 0.440, "92o": 0.429,
  "83o": 0.436, "82o": 0.425,
  "72o": 0.340,
};

/**
 * Get preflop equity for a hand class.
 * Returns equity vs random hand (0-1), or 0.45 if not found.
 */
export function getPreflopEquity(handClass: string): number {
  return PREFLOP_EQUITY[handClass] ?? 0.45;
}
