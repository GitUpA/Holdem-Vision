/**
 * Monte Carlo simulation engine for equity calculation.
 * Shared infrastructure used by RawEquityLens and future lenses.
 *
 * Pure TypeScript, zero Convex imports.
 */
import type { CardIndex } from "../types/cards";
// evaluateHand still used elsewhere for display (hand name, best 5 cards)
// but removed from the MC hot loop in favor of phe (16x faster)
import { shuffle } from "../primitives/deck";
import { createDeck } from "../primitives/card";
// @ts-expect-error — phe doesn't ship types
import { evaluateCardCodes } from "phe";

/**
 * Convert our CardIndex (0-51) to phe card code.
 * Our: rank = floor(card/4) (0=2..12=A), suit = card%4 (0=c,1=d,2=h,3=s)
 * phe: code = rank * 4 + suit (rank 0-12 mapped to 0,4,8,...,48; suit 0-3)
 */
function toPhe(card: CardIndex): number {
  const rank = Math.floor(card / 4);  // 0=2, ..., 12=A
  const suit = card % 4;              // 0=c, 1=d, 2=h, 3=s
  return rank * 4 + suit;
}

/**
 * Map phe rank to hand name (for distribution tracking).
 * phe uses 7462 unique ranks, lower = better.
 * Boundaries from Two Plus Two evaluator:
 */
function pheRankToName(rank: number): string {
  if (rank <= 10) return "Straight Flush";   // includes Royal Flush
  if (rank <= 166) return "Four of a Kind";
  if (rank <= 322) return "Full House";
  if (rank <= 1599) return "Flush";
  if (rank <= 1609) return "Straight";
  if (rank <= 2467) return "Three of a Kind";
  if (rank <= 3325) return "Two Pair";
  if (rank <= 6185) return "One Pair";
  return "High Card";
}

export interface EquityResult {
  /** Win probability 0-1 */
  win: number;
  /** Tie probability 0-1 */
  tie: number;
  /** Loss probability 0-1 */
  lose: number;
  /** Number of trials run */
  trials: number;
  /** Breakdown by hand rank (how often hero makes each hand) */
  handDistribution: Record<string, number>;
}

export interface MonteCarloOptions {
  /** Number of random trials (default: 10000) */
  trials?: number;
  /** Number of opponents to simulate (default: 1) */
  numOpponents?: number;
  /** Cards known to be dead / unavailable */
  deadCards?: CardIndex[];
  /** Optional PRNG for deterministic results */
  random?: () => number;
}

/**
 * Run Monte Carlo equity simulation.
 *
 * Given hero's cards and community cards, simulate random completions
 * of the board and random opponent holdings, then evaluate all hands.
 */
export function monteCarloEquity(
  heroCards: CardIndex[],
  communityCards: CardIndex[],
  options: MonteCarloOptions = {},
): EquityResult {
  const {
    trials = 10000,
    numOpponents = 1,
    deadCards = [],
    random = Math.random,
  } = options;

  // Cards already in play
  const knownCards = new Set([...heroCards, ...communityCards, ...deadCards]);
  const availableCards = createDeck().filter((c) => !knownCards.has(c));

  // How many community cards still need to be dealt
  const communityNeeded = 5 - communityCards.length;
  // Each opponent needs 2 cards
  const cardsNeededPerTrial = communityNeeded + numOpponents * 2;

  if (availableCards.length < cardsNeededPerTrial) {
    throw new Error(
      `Not enough cards: need ${cardsNeededPerTrial}, have ${availableCards.length}`,
    );
  }

  let wins = 0;
  let ties = 0;
  let losses = 0;
  const handCounts: Record<string, number> = {};

  for (let t = 0; t < trials; t++) {
    // Shuffle available cards for this trial
    const deck = shuffle([...availableCards], random);
    let deckIdx = 0;

    // Deal remaining community cards
    const fullCommunity = [...communityCards];
    for (let i = 0; i < communityNeeded; i++) {
      fullCommunity.push(deck[deckIdx++]);
    }

    // Evaluate hero using phe (16M evals/sec vs 1M with our evaluator)
    const communityPhe = fullCommunity.map(toPhe);
    const heroRank = evaluateCardCodes([...heroCards.map(toPhe), ...communityPhe]);

    // Track hand distribution
    const handName = pheRankToName(heroRank);
    handCounts[handName] = (handCounts[handName] ?? 0) + 1;

    // Evaluate opponents
    let heroBest = true;
    let heroTied = false;

    for (let opp = 0; opp < numOpponents; opp++) {
      const oppCards = [deck[deckIdx++], deck[deckIdx++]];
      const oppRank = evaluateCardCodes([...oppCards.map(toPhe), ...communityPhe]);

      // phe: lower rank = better hand
      if (oppRank < heroRank) {
        heroBest = false;
        heroTied = false;
        break;
      } else if (oppRank === heroRank) {
        heroTied = true;
      }
    }

    if (!heroBest) {
      losses++;
    } else if (heroTied) {
      ties++;
    } else {
      wins++;
    }
  }

  // Normalize hand distribution to probabilities
  const handDistribution: Record<string, number> = {};
  for (const [name, count] of Object.entries(handCounts)) {
    handDistribution[name] = count / trials;
  }

  return {
    win: wins / trials,
    tie: ties / trials,
    lose: losses / trials,
    trials,
    handDistribution,
  };
}

/**
 * Quick exhaustive equity for preflop all-in (hero vs 1 opponent).
 * Only feasible for heads-up with all 5 community cards unknown.
 * Falls back to Monte Carlo for larger scenarios.
 */
export function quickEquity(
  heroCards: CardIndex[],
  communityCards: CardIndex[],
  options: MonteCarloOptions = {},
): EquityResult {
  // For now, always use Monte Carlo. Exhaustive enumeration
  // can be added as an optimization for specific cases later.
  return monteCarloEquity(heroCards, communityCards, options);
}
