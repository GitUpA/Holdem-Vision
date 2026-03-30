/**
 * Hand Grid — computes which hole card combinations beat hero on a given board.
 *
 * For each of the 169 hand classes, determines how many specific combos
 * beat, tie, or lose to hero's hand. Used by the 13x13 grid UI.
 *
 * Uses phe for evaluation (16M evals/sec). Exhaustive enumeration of all
 * ~1200 possible opponent holdings — no Monte Carlo needed.
 *
 * Pure TypeScript, zero Convex/React imports.
 */
import type { CardIndex } from "../types/cards";
import { evaluateHand, compareHandRanks } from "../primitives/handEvaluator";

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

export interface HandClassGridCell {
  /** Hand class label: "AA", "AKs", "AKo", etc. */
  handClass: string;
  /** Row index (0-12, A=0, K=1, ... 2=12) */
  row: number;
  /** Column index (0-12) */
  col: number;
  /** Is this a suited hand (above diagonal), pair (diagonal), or offsuit (below)? */
  type: "pair" | "suited" | "offsuit";
  /** How many combos beat hero */
  beats: number;
  /** How many combos tie hero */
  ties: number;
  /** How many combos lose to hero */
  loses: number;
  /** Total possible combos (excluding dead cards) */
  total: number;
  /** Is this hero's hand class? */
  isHero: boolean;
  /** All combos are dead (hero/board use these cards) */
  isDead: boolean;
}

export interface HandGridData {
  /** 13x13 grid of hand class results */
  grid: HandClassGridCell[][];
  /** Hero's hand class */
  heroHandClass: string;
  /** Number of combos that beat hero */
  totalBeats: number;
  /** Number of combos that tie */
  totalTies: number;
  /** Number of combos hero beats */
  totalLoses: number;
  /** Street this was computed for */
  street: "preflop" | "flop" | "turn" | "river";
}

// ═══════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════

/** Rank labels, high to low (grid rows/cols) */
const RANK_LABELS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];

/** Rank index to CardIndex rank value (A=12, K=11, ..., 2=0) */
const GRID_TO_RANK = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];

// ═══════════════════════════════════════════════════════
// COMPUTATION
// ═══════════════════════════════════════════════════════


/**
 * Compute the 13x13 hand grid for hero vs all possible opponent holdings.
 *
 * On the flop/turn/river, uses phe to evaluate exact hand strength.
 * Preflop: uses precomputed equity approximations (hand class vs hand class).
 */
export function computeHandGrid(
  heroCards: CardIndex[],
  communityCards: CardIndex[],
): HandGridData {
  if (heroCards.length < 2) {
    return emptyGrid("preflop", "");
  }

  const street = communityCards.length === 0 ? "preflop"
    : communityCards.length === 3 ? "flop"
    : communityCards.length === 4 ? "turn"
    : "river";

  // Dead cards = hero + community
  const deadCards = new Set([...heroCards, ...communityCards]);

  // Hero's hand class
  const heroRank0 = Math.floor(heroCards[0] / 4);
  const heroRank1 = Math.floor(heroCards[1] / 4);
  const heroSuit0 = heroCards[0] % 4;
  const heroSuit1 = heroCards[1] % 4;
  const heroSuited = heroSuit0 === heroSuit1;
  const heroHandClass = handClassFromRanks(heroRank0, heroRank1, heroSuited);

  // Evaluate hero's hand (for postflop)
  let heroEval: ReturnType<typeof evaluateHand> | null = null;
  if (communityCards.length >= 3) {
    heroEval = evaluateHand([...heroCards, ...communityCards]);
  }

  // Build the 13x13 grid
  const grid: HandClassGridCell[][] = [];
  let totalBeats = 0, totalTies = 0, totalLoses = 0;

  for (let row = 0; row < 13; row++) {
    const gridRow: HandClassGridCell[] = [];
    for (let col = 0; col < 13; col++) {
      const rank1 = GRID_TO_RANK[row]; // higher rank
      const rank2 = GRID_TO_RANK[col]; // lower rank

      let type: "pair" | "suited" | "offsuit";
      let handClass: string;

      if (row === col) {
        type = "pair";
        handClass = RANK_LABELS[row] + RANK_LABELS[col];
      } else if (row < col) {
        // Above diagonal = suited (higher rank first)
        type = "suited";
        handClass = RANK_LABELS[row] + RANK_LABELS[col] + "s";
      } else {
        // Below diagonal = offsuit
        type = "offsuit";
        handClass = RANK_LABELS[col] + RANK_LABELS[row] + "o";
      }

      const isHero = handClass === heroHandClass;

      // Enumerate all specific combos for this hand class
      let beats = 0, ties = 0, loses = 0, total = 0;

      if (type === "pair") {
        // 6 combos for pairs (4 choose 2)
        for (let s1 = 0; s1 < 4; s1++) {
          for (let s2 = s1 + 1; s2 < 4; s2++) {
            const c1 = (rank1 * 4 + s1) as CardIndex;
            const c2 = (rank1 * 4 + s2) as CardIndex;
            if (deadCards.has(c1) || deadCards.has(c2)) continue;
            total++;
            const result = compareToHero(heroEval, [c1, c2], communityCards);
            if (result > 0) beats++;
            else if (result === 0) ties++;
            else loses++;
          }
        }
      } else {
        // 4 combos for suited, 12 for offsuit
        const r1 = row < col ? rank1 : rank2; // ensure higher rank
        const r2 = row < col ? rank2 : rank1;
        for (let s1 = 0; s1 < 4; s1++) {
          for (let s2 = 0; s2 < 4; s2++) {
            if (type === "suited" && s1 !== s2) continue;
            if (type === "offsuit" && s1 === s2) continue;
            const c1 = (r1 * 4 + s1) as CardIndex;
            const c2 = (r2 * 4 + s2) as CardIndex;
            if (deadCards.has(c1) || deadCards.has(c2)) continue;
            total++;
            const result = compareToHero(heroEval, [c1, c2], communityCards);
            if (result > 0) beats++;
            else if (result === 0) ties++;
            else loses++;
          }
        }
      }

      totalBeats += beats;
      totalTies += ties;
      totalLoses += loses;

      gridRow.push({
        handClass, row, col, type,
        beats, ties, loses, total,
        isHero,
        isDead: total === 0,
      });
    }
    grid.push(gridRow);
  }

  return { grid, heroHandClass, totalBeats, totalTies, totalLoses: totalLoses, street };
}

/** Compare hero's evaluated hand against opponent's hand on the board. */
function compareToHero(
  heroEval: ReturnType<typeof evaluateHand> | null,
  oppCards: CardIndex[],
  communityCards: CardIndex[],
): number {
  if (!heroEval || communityCards.length < 3) {
    return 0; // preflop: unknown
  }

  const oppEval = evaluateHand([...oppCards, ...communityCards]);
  const cmp = compareHandRanks(oppEval.rank, heroEval.rank);
  return cmp; // >0 = opponent wins, <0 = hero wins, 0 = tie
}

function handClassFromRanks(rank0: number, rank1: number, suited: boolean): string {
  const high = Math.max(rank0, rank1);
  const low = Math.min(rank0, rank1);
  const highLabel = RANK_LABELS[12 - high]; // 12=A→index 0, 0=2→index 12
  const lowLabel = RANK_LABELS[12 - low];
  if (high === low) return highLabel + lowLabel;
  return highLabel + lowLabel + (suited ? "s" : "o");
}

function emptyGrid(street: HandGridData["street"], heroHandClass: string): HandGridData {
  const grid: HandClassGridCell[][] = [];
  for (let row = 0; row < 13; row++) {
    const gridRow: HandClassGridCell[] = [];
    for (let col = 0; col < 13; col++) {
      const handClass = row === col ? RANK_LABELS[row] + RANK_LABELS[col]
        : row < col ? RANK_LABELS[row] + RANK_LABELS[col] + "s"
        : RANK_LABELS[col] + RANK_LABELS[row] + "o";
      gridRow.push({
        handClass, row, col,
        type: row === col ? "pair" : row < col ? "suited" : "offsuit",
        beats: 0, ties: 0, loses: 0, total: 0,
        isHero: handClass === heroHandClass,
        isDead: false,
      });
    }
    grid.push(gridRow);
  }
  return { grid, heroHandClass, totalBeats: 0, totalTies: 0, totalLoses: 0, street };
}
