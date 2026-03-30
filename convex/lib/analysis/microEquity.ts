/**
 * Micro Equity — fast board-specific equity using phe evaluator.
 *
 * Runs 50-100 trial Monte Carlo with the phe hand evaluator (~16M evals/sec)
 * to compute actual equity for a specific hand on a specific board.
 * Takes ~0.06ms per call — fast enough for every engine decision.
 *
 * This replaces category-averaged equity lookups with real per-board numbers.
 * "77 on a dry board" and "77 on a 3-flush board" now get different equities.
 *
 * Pure TypeScript, zero Convex imports.
 */

// @ts-expect-error — phe doesn't ship types
import { evaluateCardCodes } from "phe";
import type { CardIndex } from "../types/cards";

// ═══════════════════════════════════════════════════════
// CARD ENCODING CONVERSION
// ═══════════════════════════════════════════════════════

/**
 * Convert our CardIndex (0-51) to phe card code.
 *
 * Our encoding: rank = floor(card/4) (0=2..12=A), suit = card%4 (0=c,1=d,2=h,3=s)
 * phe encoding: code = rank * 4 + suit
 */
function toPheCode(card: CardIndex): number {
  const rank = Math.floor(card / 4);  // 0=2, ..., 12=A
  const suit = card % 4;              // 0=c, 1=d, 2=h, 3=s
  return rank * 4 + suit;
}

// ═══════════════════════════════════════════════════════
// MICRO EQUITY
// ═══════════════════════════════════════════════════════

/**
 * Compute equity for a specific hand on a specific board via micro Monte Carlo.
 *
 * @param holeCards - hero's 2 hole cards
 * @param communityCards - 3-5 community cards (flop/turn/river)
 * @param numOpponents - number of opponents to simulate (default 1)
 * @param trials - number of MC trials (default 75, ~0.06ms)
 * @param rng - optional deterministic random function
 * @returns equity 0-1
 */
export function microEquity(
  holeCards: CardIndex[],
  communityCards: CardIndex[],
  numOpponents: number = 1,
  trials: number = 75,
  rng: () => number = Math.random,
): number {
  if (holeCards.length < 2) return 0.5;

  // Build deck minus known cards
  const known = new Set<number>([...holeCards, ...communityCards]);
  const deck: number[] = [];
  for (let i = 0; i < 52; i++) {
    if (!known.has(i)) deck.push(i);
  }

  const deckLen = deck.length;
  const boardLen = communityCards.length;
  const boardToFill = 5 - boardLen;

  // Pre-convert hero hole cards to phe codes
  const heroPheCodes = holeCards.map(toPheCode);
  // Pre-convert known community cards
  const boardPheCodes = communityCards.map(toPheCode);

  let wins = 0;

  for (let t = 0; t < trials; t++) {
    // Pick random cards for opponents + remaining board
    const cardsNeeded = numOpponents * 2 + boardToFill;
    const picked: number[] = [];
    const usedIndices = new Set<number>();

    while (picked.length < cardsNeeded) {
      const idx = Math.floor(rng() * deckLen);
      if (!usedIndices.has(idx)) {
        usedIndices.add(idx);
        picked.push(deck[idx]);
      }
    }

    // Split picked cards: first N*2 for opponents, rest for board
    const fullBoardPhe = [...boardPheCodes];
    for (let b = 0; b < boardToFill; b++) {
      fullBoardPhe.push(toPheCode(picked[numOpponents * 2 + b] as CardIndex));
    }

    // Evaluate hero
    const heroAll = [...heroPheCodes, ...fullBoardPhe];
    const heroRank = evaluateCardCodes(heroAll);

    // Evaluate each opponent
    let heroBest = true;
    for (let o = 0; o < numOpponents; o++) {
      const oppPhe = [
        toPheCode(picked[o * 2] as CardIndex),
        toPheCode(picked[o * 2 + 1] as CardIndex),
        ...fullBoardPhe,
      ];
      const oppRank = evaluateCardCodes(oppPhe);

      if (oppRank < heroRank) {
        heroBest = false;
        break; // at least one opponent beats hero
      } else if (oppRank === heroRank) {
        wins += 0.5 / numOpponents; // split
        heroBest = false;
        break;
      }
    }

    if (heroBest) wins++;
  }

  return wins / trials;
}

/**
 * Quick equity check — is this hand significantly weaker on THIS board
 * than its category average would suggest?
 *
 * Returns the equity difference: negative means board hurts the hand,
 * positive means board helps.
 */
export function equityDelta(
  holeCards: CardIndex[],
  communityCards: CardIndex[],
  categoryAverageEquity: number,
  trials: number = 75,
  rng?: () => number,
): number {
  const actual = microEquity(holeCards, communityCards, 1, trials, rng);
  return actual - categoryAverageEquity;
}
