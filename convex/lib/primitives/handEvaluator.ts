/**
 * Hand evaluator — identifies the best 5-card poker hand from up to 7 cards.
 * Returns HandRank for comparison and ExplanationNode for the user.
 *
 * Pure TypeScript, zero Convex imports.
 */
import type { CardIndex } from "../types/cards";
import type { HandRank, HandRankName } from "../types/cards";
import type { ExplanationNode } from "../types/analysis";
import { rankValue, suitValue, cardToDisplay } from "./card";

export interface EvaluatedHand {
  rank: HandRank;
  bestFive: CardIndex[];
  explanation: ExplanationNode;
}

/**
 * Evaluate the best 5-card hand from 5-7 cards.
 */
export function evaluateHand(cards: CardIndex[]): EvaluatedHand {
  if (cards.length < 5 || cards.length > 7) {
    throw new Error(`Need 5-7 cards, got ${cards.length}`);
  }

  let best: EvaluatedHand | null = null;

  // Try all C(n,5) combinations
  const combos = combinations(cards, 5);
  for (const five of combos) {
    const evaluated = evaluate5(five);
    if (!best || compareHandRanks(evaluated.rank, best.rank) > 0) {
      best = evaluated;
    }
  }

  return best!;
}

/**
 * Compare two HandRanks. Returns >0 if a wins, <0 if b wins, 0 if tie.
 */
export function compareHandRanks(a: HandRank, b: HandRank): number {
  if (a.tier !== b.tier) return a.tier - b.tier;
  for (let i = 0; i < Math.max(a.tiebreakers.length, b.tiebreakers.length); i++) {
    const av = a.tiebreakers[i] ?? 0;
    const bv = b.tiebreakers[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

// ─── Internal: evaluate exactly 5 cards ───

function evaluate5(cards: CardIndex[]): EvaluatedHand {
  const ranks = cards.map(rankValue).sort((a, b) => b - a);
  const suits = cards.map(suitValue);
  const sorted = [...cards].sort((a, b) => rankValue(b) - rankValue(a));

  const isFlush = suits.every((s) => s === suits[0]);
  const isStraight = checkStraight(ranks);
  const isWheel = checkWheel(ranks);
  const straightHigh = isWheel ? 3 : ranks[0]; // wheel: 5-high

  // Count rank frequencies
  const freqMap = new Map<number, number>();
  for (const r of ranks) freqMap.set(r, (freqMap.get(r) ?? 0) + 1);
  const freqs = [...freqMap.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1]; // by count desc
    return b[0] - a[0]; // then by rank desc
  });

  // Royal Flush
  if (isFlush && isStraight && ranks[0] === 12) {
    return makeResult(sorted, 9, "Royal Flush", [], () => ({
      summary: `Royal Flush! ${displayCards(sorted)}`,
      detail: "The absolute best hand in poker — Ace-high straight flush.",
      sentiment: "positive",
      tags: ["hand-rank"],
    }));
  }

  // Straight Flush
  if (isFlush && (isStraight || isWheel)) {
    return makeResult(sorted, 8, "Straight Flush", [straightHigh], () => ({
      summary: `Straight Flush, ${rankName(straightHigh)}-high: ${displayCards(sorted)}`,
      detail: `Five consecutive cards of the same suit. Only a higher straight flush or royal flush beats this.`,
      sentiment: "positive",
      tags: ["hand-rank"],
    }));
  }

  // Four of a Kind
  if (freqs[0][1] === 4) {
    const quadRank = freqs[0][0];
    const kicker = freqs[1][0];
    const ordered = sortByRankGroup(sorted, [quadRank]);
    return makeResult(ordered, 7, "Four of a Kind", [quadRank, kicker], () => ({
      summary: `Four of a Kind, ${rankName(quadRank)}s: ${displayCards(ordered)}`,
      detail: `Quad ${rankName(quadRank)}s with ${rankName(kicker)} kicker. Only a higher quad or straight flush beats this.`,
      sentiment: "positive",
      tags: ["hand-rank"],
    }));
  }

  // Full House
  if (freqs[0][1] === 3 && freqs[1][1] === 2) {
    const tripsRank = freqs[0][0];
    const pairRank = freqs[1][0];
    const ordered = sortByRankGroup(sorted, [tripsRank, pairRank]);
    return makeResult(ordered, 6, "Full House", [tripsRank, pairRank], () => ({
      summary: `Full House, ${rankName(tripsRank)}s full of ${rankName(pairRank)}s: ${displayCards(ordered)}`,
      detail: `Three ${rankName(tripsRank)}s and two ${rankName(pairRank)}s. Beats all flushes and straights.`,
      sentiment: "positive",
      tags: ["hand-rank"],
    }));
  }

  // Flush
  if (isFlush) {
    return makeResult(sorted, 5, "Flush", ranks, () => ({
      summary: `Flush, ${rankName(ranks[0])}-high: ${displayCards(sorted)}`,
      detail: `Five cards of the same suit. Ranked by highest card, then next highest.`,
      sentiment: "positive",
      tags: ["hand-rank"],
    }));
  }

  // Straight
  if (isStraight || isWheel) {
    return makeResult(sorted, 4, "Straight", [straightHigh], () => ({
      summary: `Straight, ${rankName(straightHigh)}-high: ${displayCards(sorted)}`,
      detail: isWheel
        ? "Ace-to-Five (wheel) — the lowest possible straight."
        : `Five consecutive cards from ${rankName(ranks[4])} to ${rankName(ranks[0])}.`,
      sentiment: "positive",
      tags: ["hand-rank"],
    }));
  }

  // Three of a Kind
  if (freqs[0][1] === 3) {
    const tripsRank = freqs[0][0];
    const kickers = freqs.slice(1).map((f) => f[0]);
    const ordered = sortByRankGroup(sorted, [tripsRank]);
    return makeResult(ordered, 3, "Three of a Kind", [tripsRank, ...kickers], () => ({
      summary: `Three of a Kind, ${rankName(tripsRank)}s: ${displayCards(ordered)}`,
      detail: `Trip ${rankName(tripsRank)}s with ${rankName(kickers[0])}, ${rankName(kickers[1])} kickers.`,
      sentiment: "neutral",
      tags: ["hand-rank"],
    }));
  }

  // Two Pair
  if (freqs[0][1] === 2 && freqs[1][1] === 2) {
    const highPair = Math.max(freqs[0][0], freqs[1][0]);
    const lowPair = Math.min(freqs[0][0], freqs[1][0]);
    const kicker = freqs[2][0];
    const ordered = sortByRankGroup(sorted, [highPair, lowPair]);
    return makeResult(ordered, 2, "Two Pair", [highPair, lowPair, kicker], () => ({
      summary: `Two Pair, ${rankName(highPair)}s and ${rankName(lowPair)}s: ${displayCards(ordered)}`,
      detail: `Pair of ${rankName(highPair)}s and pair of ${rankName(lowPair)}s with ${rankName(kicker)} kicker.`,
      sentiment: "neutral",
      tags: ["hand-rank"],
    }));
  }

  // One Pair
  if (freqs[0][1] === 2) {
    const pairRank = freqs[0][0];
    const kickers = freqs.slice(1).map((f) => f[0]);
    const ordered = sortByRankGroup(sorted, [pairRank]);
    return makeResult(ordered, 1, "One Pair", [pairRank, ...kickers], () => ({
      summary: `Pair of ${rankName(pairRank)}s: ${displayCards(ordered)}`,
      detail: `One pair of ${rankName(pairRank)}s with ${kickers.map(rankName).join(", ")} kickers.`,
      sentiment: "neutral",
      tags: ["hand-rank"],
    }));
  }

  // High Card
  return makeResult(sorted, 0, "High Card", ranks, () => ({
    summary: `${rankName(ranks[0])} High: ${displayCards(sorted)}`,
    detail: `No pair, no draw made. ${rankName(ranks[0])}-high with ${ranks.slice(1).map(rankName).join(", ")} kickers.`,
    sentiment: "negative",
    tags: ["hand-rank"],
  }));
}

// ─── Helpers ───

function checkStraight(sortedRanks: number[]): boolean {
  for (let i = 0; i < 4; i++) {
    if (sortedRanks[i] - sortedRanks[i + 1] !== 1) return false;
  }
  return true;
}

function checkWheel(sortedRanks: number[]): boolean {
  // A-2-3-4-5: ranks are [12, 3, 2, 1, 0]
  return (
    sortedRanks[0] === 12 &&
    sortedRanks[1] === 3 &&
    sortedRanks[2] === 2 &&
    sortedRanks[3] === 1 &&
    sortedRanks[4] === 0
  );
}

function rankName(rankVal: number): string {
  const names = ["Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Jack", "Queen", "King", "Ace"];
  return names[rankVal];
}

function displayCards(cards: CardIndex[]): string {
  return cards.map(cardToDisplay).join(" ");
}

/** Sort cards so that cards matching the given rank groups come first */
function sortByRankGroup(cards: CardIndex[], groupRanks: number[]): CardIndex[] {
  const groups = new Set(groupRanks);
  const inGroup = cards.filter((c) => groups.has(rankValue(c)));
  const rest = cards.filter((c) => !groups.has(rankValue(c)));
  // Within groups, sort by rank group order, then by card index
  inGroup.sort((a, b) => {
    const aIdx = groupRanks.indexOf(rankValue(a));
    const bIdx = groupRanks.indexOf(rankValue(b));
    if (aIdx !== bIdx) return aIdx - bIdx;
    return rankValue(b) - rankValue(a);
  });
  rest.sort((a, b) => rankValue(b) - rankValue(a));
  return [...inGroup, ...rest];
}

function makeResult(
  bestFive: CardIndex[],
  tier: number,
  name: HandRankName,
  tiebreakers: number[],
  makeExplanation: () => ExplanationNode,
): EvaluatedHand {
  return {
    rank: { tier, name, tiebreakers },
    bestFive,
    explanation: makeExplanation(),
  };
}

/** Generate all C(n,k) combinations from an array */
function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const result: T[][] = [];
  const [first, ...rest] = arr;
  // Combinations that include first
  for (const combo of combinations(rest, k - 1)) {
    result.push([first, ...combo]);
  }
  // Combinations that don't include first
  result.push(...combinations(rest, k));
  return result;
}
