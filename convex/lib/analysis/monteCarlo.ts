/**
 * Monte Carlo simulation engine for equity calculation.
 * Shared infrastructure used by RawEquityLens and future lenses.
 *
 * Pure TypeScript, zero Convex imports.
 */
import type { CardIndex } from "../types/cards";
import { evaluateHand, compareHandRanks } from "../primitives/handEvaluator";
import { shuffle } from "../primitives/deck";
import { createDeck } from "../primitives/card";

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

    // Evaluate hero
    const heroAll = [...heroCards, ...fullCommunity];
    const heroEval = evaluateHand(heroAll);

    // Track hand distribution
    const handName = heroEval.rank.name;
    handCounts[handName] = (handCounts[handName] ?? 0) + 1;

    // Evaluate opponents
    let heroBest = true;
    let heroTied = false;

    for (let opp = 0; opp < numOpponents; opp++) {
      const oppCards = [deck[deckIdx++], deck[deckIdx++]];
      const oppAll = [...oppCards, ...fullCommunity];
      const oppEval = evaluateHand(oppAll);

      const cmp = compareHandRanks(heroEval.rank, oppEval.rank);
      if (cmp < 0) {
        heroBest = false;
        heroTied = false;
        break;
      } else if (cmp === 0) {
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
