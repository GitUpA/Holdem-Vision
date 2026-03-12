/**
 * Five opponent profile presets — situation-based behavioral models.
 *
 * Each preset defines all 11 standard poker situations with behavioral
 * parameters (continuePct, raisePct, positionAwareness, bluffFrequency,
 * sizings, explanation). These are the "same variables, different values"
 * that define each player type.
 *
 * Profiles: Nit, Fish/Calling Station, TAG, LAG, GTO Approximation
 *
 * Pure TypeScript, zero Convex imports.
 */
import type {
  OpponentProfile,
  BehavioralParams,
  SituationKey,
} from "../types/opponents";

/** Helper to build a complete BehavioralParams. */
function bp(params: BehavioralParams): BehavioralParams {
  return params;
}

// ═══════════════════════════════════════════════════════
// 1. NIT — ultra-tight, only plays premium hands
// ═══════════════════════════════════════════════════════
//
// Old tendencies: vpip=12, pfr=10, agg=1.5, 3bet=3,
//   cbet=65, foldToCBet=55, posAware=0.4

const nitSituations: Record<SituationKey, BehavioralParams> = {
  "preflop.open": bp({
    continuePct: 12,
    raisePct: 83,
    positionAwareness: 0.4,
    bluffFrequency: 0.02,
    sizings: [
      { action: "raise", sizingPct: 300, weight: 0.8 },
      { action: "raise", sizingPct: 250, weight: 0.2 },
    ],
    explanation:
      "Nits are ultra-tight. They only enter pots with premium hands — top pairs, AK, AQ suited. From any position, expect at most the top 12% of starting hands.",
  }),
  "preflop.facing_raise": bp({
    continuePct: 5,
    raisePct: 60,
    positionAwareness: 0.4,
    bluffFrequency: 0.0,
    sizings: [{ action: "raise", sizingPct: 300, weight: 1.0 }],
    explanation:
      "Nits fold most of their already-tight range to raises. They only 3-bet with AA, KK, QQ, AKs. They call with JJ, TT, AKo, AQs.",
  }),
  "preflop.facing_3bet": bp({
    continuePct: 3,
    raisePct: 80,
    positionAwareness: 0.4,
    bluffFrequency: 0.0,
    sizings: [{ action: "raise", sizingPct: 250, weight: 1.0 }],
    explanation:
      "Only continues with absolute premiums. AA, KK always 4-bet. Everything else folds.",
  }),
  "preflop.facing_4bet": bp({
    continuePct: 2,
    raisePct: 90,
    positionAwareness: 0.4,
    bluffFrequency: 0.0,
    sizings: [],
    explanation:
      "Only AA, maybe KK. A nit facing a 4-bet folds almost everything.",
  }),
  "postflop.aggressor.ip": bp({
    continuePct: 65,
    raisePct: 15,
    positionAwareness: 0.4,
    bluffFrequency: 0.05,
    sizings: [
      { action: "bet", sizingPct: 60, weight: 0.5 },
      { action: "bet", sizingPct: 75, weight: 0.4 },
    ],
    explanation:
      "Nits c-bet with top pair or better. They rarely bluff — a postflop bet from a Nit usually means real strength.",
  }),
  "postflop.aggressor.oop": bp({
    continuePct: 55,
    raisePct: 10,
    positionAwareness: 0.4,
    bluffFrequency: 0.03,
    sizings: [{ action: "bet", sizingPct: 60, weight: 0.6 }],
    explanation:
      "Out of position, nits c-bet even less and are almost exclusively value-heavy.",
  }),
  "postflop.caller.ip": bp({
    continuePct: 50,
    raisePct: 10,
    positionAwareness: 0.4,
    bluffFrequency: 0.05,
    sizings: [{ action: "bet", sizingPct: 50, weight: 0.5 }],
    explanation:
      "As a caller in position, nits mostly check back. They probe rarely and only with made hands.",
  }),
  "postflop.caller.oop": bp({
    continuePct: 40,
    raisePct: 5,
    positionAwareness: 0.4,
    bluffFrequency: 0.02,
    sizings: [],
    explanation:
      "As a caller out of position, nits almost never lead. They check and fold to aggression unless they connected strongly.",
  }),
  "postflop.facing_bet": bp({
    continuePct: 45,
    raisePct: 10,
    positionAwareness: 0.4,
    bluffFrequency: 0.02,
    sizings: [{ action: "raise", sizingPct: 300, weight: 0.8 }],
    explanation:
      "When nits raise a bet, they always have it. Very few bluff raises. They fold 55% of the time to a c-bet.",
  }),
  "postflop.facing_raise": bp({
    continuePct: 25,
    raisePct: 5,
    positionAwareness: 0.4,
    bluffFrequency: 0.0,
    sizings: [],
    explanation:
      "Facing a raise, nits only continue with very strong hands. Check-raises are very rare and always indicate a monster.",
  }),
  "postflop.facing_allin": bp({
    continuePct: 15,
    raisePct: 0,
    positionAwareness: 0.4,
    bluffFrequency: 0.0,
    sizings: [],
    explanation:
      "Nits need the nuts to call an all-in. They fold everything but the absolute best hands.",
  }),
};

export const NIT_PROFILE: OpponentProfile = {
  id: "nit",
  name: "Nit",
  engineId: "basic",
  description:
    "Ultra-tight player who only enters pots with premium hands. When they bet, they mean it. Exploitable by stealing their blinds and folding to their aggression.",
  situations: nitSituations,
};

// ═══════════════════════════════════════════════════════
// 2. FISH — loose-passive, calls too much, rarely raises
// ═══════════════════════════════════════════════════════
//
// Old tendencies: vpip=55, pfr=8, agg=0.5, 3bet=2,
//   cbet=30, foldToCBet=35, posAware=0.1

const fishSituations: Record<SituationKey, BehavioralParams> = {
  "preflop.open": bp({
    continuePct: 55,
    raisePct: 15,
    positionAwareness: 0.1,
    bluffFrequency: 0.02,
    sizings: [
      { action: "raise", sizingPct: 200, weight: 0.7 },
      { action: "raise", sizingPct: 300, weight: 0.3 },
    ],
    explanation:
      "Fish play too many hands — over half of all starting hands. They limp often and raise rarely. Position doesn't change their behavior much.",
  }),
  "preflop.facing_raise": bp({
    continuePct: 40,
    raisePct: 5,
    positionAwareness: 0.1,
    bluffFrequency: 0.01,
    sizings: [{ action: "raise", sizingPct: 200, weight: 0.7 }],
    explanation:
      "Fish call raises with a very wide range — any two suited, any pair, any connector. They rarely 3-bet, and when they do, it's the nuts.",
  }),
  "preflop.facing_3bet": bp({
    continuePct: 25,
    raisePct: 5,
    positionAwareness: 0.1,
    bluffFrequency: 0.0,
    sizings: [],
    explanation:
      "Even fish tighten up somewhat to 3-bets, but they still call too wide with hands like suited aces and medium pairs.",
  }),
  "preflop.facing_4bet": bp({
    continuePct: 10,
    raisePct: 5,
    positionAwareness: 0.1,
    bluffFrequency: 0.0,
    sizings: [],
    explanation:
      "Fish rarely get this deep in the preflop action. When they do continue, they have a real hand.",
  }),
  "postflop.aggressor.ip": bp({
    continuePct: 30,
    raisePct: 8,
    positionAwareness: 0.1,
    bluffFrequency: 0.03,
    sizings: [
      { action: "bet", sizingPct: 50, weight: 0.5 },
      { action: "bet", sizingPct: 100, weight: 0.3 },
    ],
    explanation:
      "Fish c-bet infrequently (30%). When they do bet, it usually means they connected with the board. Their bets are almost never bluffs.",
  }),
  "postflop.aggressor.oop": bp({
    continuePct: 25,
    raisePct: 5,
    positionAwareness: 0.1,
    bluffFrequency: 0.02,
    sizings: [{ action: "bet", sizingPct: 50, weight: 0.8 }],
    explanation:
      "Out of position, fish bet even less. They tend to check and call rather than lead.",
  }),
  "postflop.caller.ip": bp({
    continuePct: 70,
    raisePct: 5,
    positionAwareness: 0.1,
    bluffFrequency: 0.02,
    sizings: [{ action: "bet", sizingPct: 50, weight: 0.8 }],
    explanation:
      "Fish call with any pair, any draw, any overcard. They justify it as 'seeing what comes.' Their calling range is very wide but mostly weak.",
  }),
  "postflop.caller.oop": bp({
    continuePct: 65,
    raisePct: 3,
    positionAwareness: 0.1,
    bluffFrequency: 0.01,
    sizings: [],
    explanation:
      "Fish are 'calling stations.' They rarely fold to a single bet. You need to value bet aggressively and avoid bluffing.",
  }),
  "postflop.facing_bet": bp({
    continuePct: 65,
    raisePct: 5,
    positionAwareness: 0.1,
    bluffFrequency: 0.02,
    sizings: [{ action: "raise", sizingPct: 200, weight: 0.7 }],
    explanation:
      "Fish call bets with bottom pair, gutshots, and backdoor draws. They'll call you down with middle pair. Bluffing fish is usually -EV.",
  }),
  "postflop.facing_raise": bp({
    continuePct: 50,
    raisePct: 3,
    positionAwareness: 0.1,
    bluffFrequency: 0.0,
    sizings: [],
    explanation:
      "Even fish respect raises somewhat, but they still call more often than they should. If a fish raises back, they have a monster.",
  }),
  "postflop.facing_allin": bp({
    continuePct: 30,
    raisePct: 0,
    positionAwareness: 0.1,
    bluffFrequency: 0.0,
    sizings: [],
    explanation:
      "Fish are more likely than other players to call all-ins with draws and medium pairs. Still, most will fold their junk.",
  }),
};

export const FISH_PROFILE: OpponentProfile = {
  id: "fish",
  name: "Fish / Calling Station",
  engineId: "basic",
  description:
    "Loose-passive player who plays too many hands and calls too much. Rarely bluffs. Exploit by value-betting relentlessly and avoiding bluffs.",
  situations: fishSituations,
};

// ═══════════════════════════════════════════════════════
// 3. TAG — tight-aggressive, the solid winning player
// ═══════════════════════════════════════════════════════
//
// Old tendencies: vpip=22, pfr=18, agg=3.0, 3bet=7,
//   cbet=70, foldToCBet=45, posAware=0.8

const tagSituations: Record<SituationKey, BehavioralParams> = {
  "preflop.open": bp({
    continuePct: 22,
    raisePct: 82,
    positionAwareness: 0.8,
    bluffFrequency: 0.08,
    sizings: [
      { action: "raise", sizingPct: 300, weight: 0.6 },
      { action: "raise", sizingPct: 250, weight: 0.3 },
    ],
    explanation:
      "TAGs play a solid, selective-aggressive style. They choose good starting hands (~22%) and raise most of them. Position significantly affects their range.",
  }),
  "preflop.facing_raise": bp({
    continuePct: 20,
    raisePct: 50,
    positionAwareness: 0.8,
    bluffFrequency: 0.05,
    sizings: [
      { action: "raise", sizingPct: 300, weight: 0.6 },
      { action: "raise", sizingPct: 250, weight: 0.3 },
    ],
    explanation:
      "TAGs respect raises but still 3-bet with a balanced range of value hands and occasional bluffs. They call with suited connectors and medium pairs.",
  }),
  "preflop.facing_3bet": bp({
    continuePct: 25,
    raisePct: 30,
    positionAwareness: 0.8,
    bluffFrequency: 0.03,
    sizings: [{ action: "raise", sizingPct: 250, weight: 1.0 }],
    explanation:
      "TAGs defend ~25% vs 3-bets. They call with suited connectors, medium pairs, AQ, and 4-bet with AA, KK, AKs plus occasional bluffs.",
  }),
  "preflop.facing_4bet": bp({
    continuePct: 4,
    raisePct: 75,
    positionAwareness: 0.8,
    bluffFrequency: 0.01,
    sizings: [],
    explanation:
      "Facing a 4-bet, TAGs play very tight. Only premium hands continue, and most of those are shoving.",
  }),
  "postflop.aggressor.ip": bp({
    continuePct: 70,
    raisePct: 30,
    positionAwareness: 0.8,
    bluffFrequency: 0.20,
    sizings: [
      { action: "bet", sizingPct: 66, weight: 0.5 },
      { action: "bet", sizingPct: 75, weight: 0.3 },
    ],
    explanation:
      "TAGs c-bet frequently in position (70%) with a good mix of value and bluffs. They use position to apply pressure and take down pots.",
  }),
  "postflop.aggressor.oop": bp({
    continuePct: 60,
    raisePct: 25,
    positionAwareness: 0.8,
    bluffFrequency: 0.15,
    sizings: [
      { action: "bet", sizingPct: 66, weight: 0.5 },
      { action: "bet", sizingPct: 50, weight: 0.3 },
    ],
    explanation:
      "Out of position, TAGs c-bet slightly less but still maintain aggression. They check back more marginal hands for pot control.",
  }),
  "postflop.caller.ip": bp({
    continuePct: 55,
    raisePct: 25,
    positionAwareness: 0.8,
    bluffFrequency: 0.15,
    sizings: [
      { action: "bet", sizingPct: 66, weight: 0.5 },
      { action: "bet", sizingPct: 50, weight: 0.3 },
    ],
    explanation:
      "As a caller in position, TAGs probe and float flops with draws and overcards. They use position to bluff on later streets.",
  }),
  "postflop.caller.oop": bp({
    continuePct: 45,
    raisePct: 15,
    positionAwareness: 0.8,
    bluffFrequency: 0.10,
    sizings: [{ action: "bet", sizingPct: 66, weight: 0.5 }],
    explanation:
      "As a caller out of position, TAGs play more defensively. They check-call with medium-strength hands and check-raise with strong ones.",
  }),
  "postflop.facing_bet": bp({
    continuePct: 55,
    raisePct: 20,
    positionAwareness: 0.8,
    bluffFrequency: 0.12,
    sizings: [
      { action: "raise", sizingPct: 300, weight: 0.6 },
      { action: "raise", sizingPct: 250, weight: 0.3 },
    ],
    explanation:
      "TAGs defend well against bets, continuing with ~55% of their range. They raise with strong hands and occasionally as bluffs.",
  }),
  "postflop.facing_raise": bp({
    continuePct: 35,
    raisePct: 15,
    positionAwareness: 0.8,
    bluffFrequency: 0.05,
    sizings: [{ action: "raise", sizingPct: 300, weight: 0.7 }],
    explanation:
      "TAGs tighten considerably against raises. They need a strong hand to continue and rarely get into re-raise wars without the goods.",
  }),
  "postflop.facing_allin": bp({
    continuePct: 20,
    raisePct: 0,
    positionAwareness: 0.8,
    bluffFrequency: 0.0,
    sizings: [],
    explanation:
      "Facing all-in, TAGs make disciplined decisions based on pot odds and hand strength. They fold marginal hands.",
  }),
};

export const TAG_PROFILE: OpponentProfile = {
  id: "tag",
  name: "TAG (Tight-Aggressive)",
  engineId: "range-aware",
  description:
    "Solid, selective-aggressive player. Plays good hands, bets them hard, adjusts for position. The baseline winning strategy. Hard to exploit without reads.",
  situations: tagSituations,
};

// ═══════════════════════════════════════════════════════
// 4. LAG — loose-aggressive, creative and hard to read
// ═══════════════════════════════════════════════════════
//
// Old tendencies: vpip=35, pfr=28, agg=4.0, 3bet=12,
//   cbet=80, foldToCBet=30, posAware=0.9

const lagSituations: Record<SituationKey, BehavioralParams> = {
  "preflop.open": bp({
    continuePct: 35,
    raisePct: 80,
    positionAwareness: 0.9,
    bluffFrequency: 0.15,
    sizings: [
      { action: "raise", sizingPct: 300, weight: 0.5 },
      { action: "raise", sizingPct: 250, weight: 0.3 },
      { action: "raise", sizingPct: 400, weight: 0.2 },
    ],
    explanation:
      "LAGs play many hands aggressively — top 35%. They put constant pressure with raises from all positions, especially late position.",
  }),
  "preflop.facing_raise": bp({
    continuePct: 28,
    raisePct: 55,
    positionAwareness: 0.9,
    bluffFrequency: 0.12,
    sizings: [
      { action: "raise", sizingPct: 300, weight: 0.5 },
      { action: "raise", sizingPct: 400, weight: 0.2 },
    ],
    explanation:
      "LAGs 3-bet light frequently. Their wide 3-bet range includes many bluffs (suited connectors, suited aces) alongside premium hands.",
  }),
  "preflop.facing_3bet": bp({
    continuePct: 35,
    raisePct: 40,
    positionAwareness: 0.9,
    bluffFrequency: 0.10,
    sizings: [{ action: "raise", sizingPct: 250, weight: 1.0 }],
    explanation:
      "LAGs defend ~35% vs 3-bets. They call with a wide range including suited connectors and broadways, and 4-bet light with suited aces and blockers.",
  }),
  "preflop.facing_4bet": bp({
    continuePct: 8,
    raisePct: 60,
    positionAwareness: 0.9,
    bluffFrequency: 0.05,
    sizings: [],
    explanation:
      "Facing 4-bets, LAGs tighten significantly but still shove wider than most players.",
  }),
  "postflop.aggressor.ip": bp({
    continuePct: 80,
    raisePct: 40,
    positionAwareness: 0.9,
    bluffFrequency: 0.35,
    sizings: [
      { action: "bet", sizingPct: 75, weight: 0.4 },
      { action: "bet", sizingPct: 100, weight: 0.3 },
      { action: "bet", sizingPct: 130, weight: 0.15 },
    ],
    explanation:
      "LAGs c-bet very frequently (80%) with a high bluff frequency. If you check, they bet. If you call, they barrel again. Their aggression wins many pots uncontested.",
  }),
  "postflop.aggressor.oop": bp({
    continuePct: 70,
    raisePct: 35,
    positionAwareness: 0.9,
    bluffFrequency: 0.30,
    sizings: [
      { action: "bet", sizingPct: 80, weight: 0.4 },
      { action: "bet", sizingPct: 120, weight: 0.3 },
    ],
    explanation:
      "Even out of position, LAGs maintain high aggression. They lead and barrel frequently, using their unpredictability as a weapon.",
  }),
  "postflop.caller.ip": bp({
    continuePct: 65,
    raisePct: 35,
    positionAwareness: 0.9,
    bluffFrequency: 0.25,
    sizings: [
      { action: "bet", sizingPct: 75, weight: 0.4 },
      { action: "bet", sizingPct: 100, weight: 0.3 },
    ],
    explanation:
      "As a caller in position, LAGs attack weakness aggressively. They float wide and fire on later streets.",
  }),
  "postflop.caller.oop": bp({
    continuePct: 55,
    raisePct: 25,
    positionAwareness: 0.9,
    bluffFrequency: 0.20,
    sizings: [
      { action: "bet", sizingPct: 75, weight: 0.5 },
    ],
    explanation:
      "LAGs donk-bet more than other player types. They use unorthodox lines to keep opponents off-balance.",
  }),
  "postflop.facing_bet": bp({
    continuePct: 70,
    raisePct: 30,
    positionAwareness: 0.9,
    bluffFrequency: 0.20,
    sizings: [
      { action: "raise", sizingPct: 300, weight: 0.5 },
      { action: "raise", sizingPct: 400, weight: 0.2 },
    ],
    explanation:
      "LAGs rarely fold to bets. They call wide and raise aggressively with both value and bluffs. Bluffing a LAG is usually -EV.",
  }),
  "postflop.facing_raise": bp({
    continuePct: 40,
    raisePct: 20,
    positionAwareness: 0.9,
    bluffFrequency: 0.10,
    sizings: [{ action: "raise", sizingPct: 300, weight: 0.7 }],
    explanation:
      "Good LAGs know when to back off. Against strong resistance, they tighten up significantly. The key is they bluff a lot but aren't reckless against resistance.",
  }),
  "postflop.facing_allin": bp({
    continuePct: 25,
    raisePct: 0,
    positionAwareness: 0.9,
    bluffFrequency: 0.0,
    sizings: [],
    explanation:
      "Facing all-in, LAGs make calculated decisions. They call wider than TAGs but still need a hand.",
  }),
};

export const LAG_PROFILE: OpponentProfile = {
  id: "lag",
  name: "LAG (Loose-Aggressive)",
  engineId: "range-aware",
  description:
    "Creative, aggressive player who plays many hands and applies constant pressure. Hard to read because they bluff frequently. Exploit by trapping with strong hands.",
  situations: lagSituations,
};

// ═══════════════════════════════════════════════════════
// 5. GTO — game-theory optimal approximation
// ═══════════════════════════════════════════════════════
//
// Old tendencies: vpip=27, pfr=22, agg=2.5, 3bet=9,
//   cbet=55, foldToCBet=40, posAware=1.0

const gtoSituations: Record<SituationKey, BehavioralParams> = {
  "preflop.open": bp({
    continuePct: 27,
    raisePct: 81,
    positionAwareness: 1.0,
    bluffFrequency: 0.10,
    sizings: [
      { action: "raise", sizingPct: 250, weight: 0.5 },
      { action: "raise", sizingPct: 300, weight: 0.3 },
    ],
    explanation:
      "GTO players open ~27% of hands with full position adjustment. Their range is balanced with a correct ratio of value and speculative hands.",
  }),
  "preflop.facing_raise": bp({
    continuePct: 22,
    raisePct: 56,
    positionAwareness: 1.0,
    bluffFrequency: 0.08,
    sizings: [
      { action: "raise", sizingPct: 300, weight: 0.5 },
      { action: "raise", sizingPct: 350, weight: 0.3 },
    ],
    explanation:
      "GTO 3-bet ranges are balanced with value and bluffs at theoretically correct frequencies. They 3-bet ~9% with a mix of premiums and suited blocker hands.",
  }),
  "preflop.facing_3bet": bp({
    continuePct: 30,
    raisePct: 35,
    positionAwareness: 1.0,
    bluffFrequency: 0.05,
    sizings: [{ action: "raise", sizingPct: 250, weight: 1.0 }],
    explanation:
      "GTO defends ~30% vs 3-bets. Calls with suited connectors, pairs 55+, AQ, and 4-bets with AA, KK, AKs plus balanced bluffs. Position-dependent.",
  }),
  "preflop.facing_4bet": bp({
    continuePct: 5,
    raisePct: 70,
    positionAwareness: 1.0,
    bluffFrequency: 0.02,
    sizings: [],
    explanation:
      "GTO 4-bet defense is very tight. Only premium hands continue, mostly as shoves.",
  }),
  "postflop.aggressor.ip": bp({
    continuePct: 55,
    raisePct: 35,
    positionAwareness: 1.0,
    bluffFrequency: 0.28,
    sizings: [
      { action: "bet", sizingPct: 33, weight: 0.3 },
      { action: "bet", sizingPct: 66, weight: 0.4 },
      { action: "bet", sizingPct: 130, weight: 0.2 },
    ],
    explanation:
      "GTO uses multiple bet sizes for different board textures. Small bets on dry boards (range advantage small) and large bets on wet boards (polarize effectively). Bluffs at theoretically correct frequency.",
  }),
  "postflop.aggressor.oop": bp({
    continuePct: 45,
    raisePct: 30,
    positionAwareness: 1.0,
    bluffFrequency: 0.25,
    sizings: [
      { action: "bet", sizingPct: 33, weight: 0.4 },
      { action: "bet", sizingPct: 75, weight: 0.3 },
    ],
    explanation:
      "GTO c-bets less out of position, preferring smaller sizes. Check-raises are part of the balanced strategy.",
  }),
  "postflop.caller.ip": bp({
    continuePct: 55,
    raisePct: 25,
    positionAwareness: 1.0,
    bluffFrequency: 0.22,
    sizings: [
      { action: "bet", sizingPct: 33, weight: 0.3 },
      { action: "bet", sizingPct: 66, weight: 0.4 },
    ],
    explanation:
      "As a caller in position, GTO probes at balanced frequencies. They bet for thin value and include a correct proportion of bluffs.",
  }),
  "postflop.caller.oop": bp({
    continuePct: 45,
    raisePct: 20,
    positionAwareness: 1.0,
    bluffFrequency: 0.18,
    sizings: [
      { action: "bet", sizingPct: 33, weight: 0.4 },
      { action: "bet", sizingPct: 75, weight: 0.3 },
    ],
    explanation:
      "GTO donk-betting frequencies are low but non-zero. They lead on boards that favor their range over the aggressor's.",
  }),
  "postflop.facing_bet": bp({
    continuePct: 60,
    raisePct: 25,
    positionAwareness: 1.0,
    bluffFrequency: 0.15,
    sizings: [
      { action: "raise", sizingPct: 250, weight: 0.5 },
      { action: "raise", sizingPct: 350, weight: 0.3 },
    ],
    explanation:
      "GTO defends against bets at the minimum defense frequency. A pot-sized bet should have ~33% bluffs, so they call/raise enough to make bluffs unprofitable.",
  }),
  "postflop.facing_raise": bp({
    continuePct: 35,
    raisePct: 20,
    positionAwareness: 1.0,
    bluffFrequency: 0.08,
    sizings: [{ action: "raise", sizingPct: 250, weight: 0.5 }],
    explanation:
      "Against raises, GTO continues with a tight but balanced range. They include enough calls and re-raises to prevent exploitation.",
  }),
  "postflop.facing_allin": bp({
    continuePct: 22,
    raisePct: 0,
    positionAwareness: 1.0,
    bluffFrequency: 0.0,
    sizings: [],
    explanation:
      "GTO calls all-ins based on pot odds and range equity. They make mathematically correct decisions regardless of emotional pressure.",
  }),
};

export const GTO_PROFILE: OpponentProfile = {
  id: "gto",
  name: "GTO (Balanced)",
  engineId: "lookup-gto",
  description:
    "Game-theory optimal player who balances value bets and bluffs at theoretically correct frequencies. Hard to exploit because their strategy is mathematically sound.",
  situations: gtoSituations,
};

// ═══════════════════════════════════════════════════════
// Preset registry
// ═══════════════════════════════════════════════════════

export const PRESET_PROFILES: Record<string, OpponentProfile> = {
  nit: NIT_PROFILE,
  fish: FISH_PROFILE,
  tag: TAG_PROFILE,
  lag: LAG_PROFILE,
  gto: GTO_PROFILE,
};

export const PRESET_IDS = ["nit", "fish", "tag", "lag", "gto"] as const;
export type PresetId = (typeof PRESET_IDS)[number];

export function getPreset(id: PresetId): OpponentProfile {
  return PRESET_PROFILES[id];
}

export function getAllPresets(): OpponentProfile[] {
  return PRESET_IDS.map((id) => PRESET_PROFILES[id]);
}
