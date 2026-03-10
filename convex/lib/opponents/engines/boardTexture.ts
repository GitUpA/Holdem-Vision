/**
 * Board texture analysis — classifies community cards for engine reasoning.
 *
 * Evaluates suit distribution, connectivity, pairing, and overall "wetness"
 * to inform how aggressively or defensively an engine should play.
 *
 * Pure TypeScript, zero Convex imports.
 */
import type { CardIndex } from "../../types/cards";
import { rankValue, suitValue } from "../../primitives/card";

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

export interface BoardTexture {
  /** Overall wetness score: 0 = bone dry, 1 = extremely wet. */
  wetness: number;
  /** All cards share one suit (3+ suited on flop, etc.) */
  isMonotone: boolean;
  /** Exactly 2 suits present — flush draws possible. */
  isTwoTone: boolean;
  /** All different suits — no flush draws. */
  isRainbow: boolean;
  /** Board contains a pair. */
  isPaired: boolean;
  /** Board contains trips. */
  isTrips: boolean;
  /** Board has adjacent-rank cards (gap <= 1). */
  hasConnectors: boolean;
  /** Highest rank on board (0=2, 12=A). */
  highCard: number;
  /** 3+ of one suit on board — completed flush possible. */
  flushPossible: boolean;
  /** Many connected cards — straight draws abundant. */
  straightHeavy: boolean;
  /** How many cards are on the board. */
  cardCount: number;
  /** Human-readable description for explanations. */
  description: string;
}

// ═══════════════════════════════════════════════════════
// ANALYSIS
// ═══════════════════════════════════════════════════════

/**
 * Analyze the community cards and return a board texture summary.
 * Works for flop (3 cards), turn (4), or river (5).
 * Returns a neutral texture for 0 cards (preflop).
 */
export function analyzeBoard(communityCards: CardIndex[]): BoardTexture {
  if (communityCards.length === 0) {
    return {
      wetness: 0.5,
      isMonotone: false,
      isTwoTone: false,
      isRainbow: false,
      isPaired: false,
      isTrips: false,
      hasConnectors: false,
      highCard: 0,
      flushPossible: false,
      straightHeavy: false,
      cardCount: 0,
      description: "Preflop — no board cards",
    };
  }

  const ranks = communityCards.map(rankValue);
  const suits = communityCards.map(suitValue);
  const n = communityCards.length;

  // ── Suit analysis ──
  const suitCounts = new Map<number, number>();
  for (const s of suits) {
    suitCounts.set(s, (suitCounts.get(s) ?? 0) + 1);
  }
  const maxSuitCount = Math.max(...suitCounts.values());
  const uniqueSuits = suitCounts.size;

  const isMonotone = uniqueSuits === 1 && n >= 3;
  const isTwoTone = uniqueSuits === 2;
  const isRainbow = uniqueSuits >= 3 && maxSuitCount === 1;
  const flushPossible = maxSuitCount >= 3;

  // ── Rank analysis ──
  const sortedRanks = [...ranks].sort((a, b) => a - b);
  const uniqueRanks = new Set(ranks);

  // Pairing
  const rankCounts = new Map<number, number>();
  for (const r of ranks) {
    rankCounts.set(r, (rankCounts.get(r) ?? 0) + 1);
  }
  const maxRankCount = Math.max(...rankCounts.values());
  const isPaired = maxRankCount >= 2;
  const isTrips = maxRankCount >= 3;

  const highCard = Math.max(...ranks);

  // Connectivity: count adjacent pairs (gap <= 1)
  let connectorCount = 0;
  let smallGapCount = 0; // gap <= 2
  for (let i = 0; i < sortedRanks.length - 1; i++) {
    const gap = sortedRanks[i + 1] - sortedRanks[i];
    if (gap === 1) connectorCount++;
    if (gap <= 2 && gap > 0) smallGapCount++;
  }
  // Check wheel connectivity (A-2)
  if (uniqueRanks.has(12) && uniqueRanks.has(0)) {
    connectorCount++;
    smallGapCount++;
  }

  const hasConnectors = connectorCount > 0;
  const straightHeavy = smallGapCount >= 2;

  // ── Wetness score (0-1) ──
  let wetness = 0;

  // Suit concentration adds wetness (flush draws)
  if (isMonotone) wetness += 0.35;
  else if (isTwoTone) wetness += 0.2;
  // Rainbow is dry: +0

  // Connectivity adds wetness (straight draws)
  wetness += Math.min(connectorCount * 0.15, 0.3);
  wetness += Math.min(smallGapCount * 0.08, 0.2);

  // Pairing reduces wetness slightly (fewer combos connect)
  if (isPaired) wetness -= 0.1;
  if (isTrips) wetness -= 0.15;

  // High cards reduce wetness slightly (fewer straight draws above)
  if (highCard >= 10) wetness -= 0.05; // Broadway-heavy boards

  // Middle cards increase wetness (more connected)
  const avgRank = ranks.reduce((a, b) => a + b, 0) / n;
  if (avgRank >= 4 && avgRank <= 9) wetness += 0.1;

  wetness = Math.max(0, Math.min(1, wetness));

  // ── Description ──
  const parts: string[] = [];
  if (isMonotone) parts.push("monotone");
  else if (isTwoTone) parts.push("two-tone");
  else if (isRainbow) parts.push("rainbow");

  if (isPaired) parts.push("paired");
  if (hasConnectors) parts.push("connected");

  if (wetness >= 0.6) parts.unshift("wet");
  else if (wetness <= 0.25) parts.unshift("dry");
  else parts.unshift("medium");

  const highCardName = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"][highCard] ?? "?";
  parts.push(`(${highCardName} high)`);

  return {
    wetness,
    isMonotone,
    isTwoTone,
    isRainbow,
    isPaired,
    isTrips,
    hasConnectors,
    highCard,
    flushPossible,
    straightHeavy,
    cardCount: n,
    description: parts.join(", "),
  };
}
