/**
 * Fold equity calculator — answers "if I bet X, should they fold?"
 *
 * Given hero's equity vs an opponent's range, the opponent's behavioral
 * params for the current situation, and a bet size, it calculates:
 * - How likely they are to fold
 * - The expected value (in BB) of betting vs checking
 * - Whether the bet is +EV
 *
 * When solver data is available, GTO defense frequencies are used as the base
 * and the opponent's profile modifier (foldScale) adjusts from there.
 * Falls back to profile continuePct when no solver data exists.
 *
 * All amounts are in big blind (BB) increments for universal readability.
 *
 * Pure TypeScript, zero Convex imports.
 */
import type { BehavioralParams } from "../types/opponents";
import type { ExplanationNode } from "../types/analysis";

export interface FoldEquityResult {
  /** How likely they fold to this bet (0-1) */
  foldProbability: number;
  /** Expected value of betting in BB */
  betEV: number;
  /** Pot size in BB */
  potBB: number;
  /** Bet size in BB */
  betBB: number;
  /** Minimum fold% for the bet to be +EV purely on folds */
  breakEvenFoldPct: number;
  /** Simple recommendation */
  recommendation: "bet" | "check" | "marginal";
  /** Reasoning tree */
  explanation: ExplanationNode;
}

export interface FoldEquityScenario {
  betSizePct: number;
  result: FoldEquityResult;
}

/** Solver-informed fold rate context. When provided, overrides the profile heuristic. */
export interface SolverFoldContext {
  /** GTO fold frequency for this texture/hand/street (0-1) */
  gtoFoldFrequency: number;
  /** Profile's foldScale modifier (>1 = folds more than GTO, <1 = folds less) */
  foldScale: number;
  /** Source label for explanation */
  archetypeLabel: string;
}

/**
 * Calculate fold equity for a specific bet size.
 *
 * @param heroEquityVsRange - Hero's equity vs opponent's range (0-1)
 * @param params - Opponent's behavioral params for the current situation
 * @param betSizePct - Bet as percentage of pot (e.g., 75 = 75% pot)
 * @param potBB - Current pot in big blinds
 * @param street - Current street (affects fold frequency)
 * @param profileName - For explanation text
 * @param solverCtx - Optional solver-informed fold context (overrides heuristic)
 */
export function calculateFoldEquity(
  heroEquityVsRange: number,
  params: BehavioralParams,
  betSizePct: number,
  potBB: number,
  street: "preflop" | "flop" | "turn" | "river",
  profileName: string,
  solverCtx?: SolverFoldContext,
): FoldEquityResult {
  const betBB = potBB * (betSizePct / 100);

  // ─── Fold probability ───
  let baseFoldRate: number;
  let sourceLabel: string;

  if (solverCtx) {
    // Solver-informed: GTO fold frequency × profile's foldScale modifier
    baseFoldRate = clamp(solverCtx.gtoFoldFrequency * solverCtx.foldScale, 0, 1);
    sourceLabel = `solver (${solverCtx.archetypeLabel})`;
  } else {
    // Heuristic fallback: profile's continuePct
    baseFoldRate = getBaseFoldRate(params, street);
    sourceLabel = "profile heuristic";
  }

  // Adjust for bet size: larger bets get more folds
  const sizeAdjustment = betSizeToFoldAdjustment(betSizePct);
  const foldProbability = clamp(baseFoldRate * sizeAdjustment, 0, 0.95);

  // ─── Break-even fold % ───
  const breakEvenFoldPct =
    potBB + betBB > 0 ? (betBB / (potBB + betBB)) * 100 : 0;

  // ─── EV calculation ───
  const callProb = 1 - foldProbability;
  const totalPotIfCalled = potBB + 2 * betBB;
  const evWhenFold = foldProbability * potBB;
  const evWhenCall =
    callProb * (heroEquityVsRange * totalPotIfCalled - betBB);
  const betEV = evWhenFold + evWhenCall;

  // ─── Recommendation ───
  let recommendation: "bet" | "check" | "marginal";
  if (betEV > potBB * 0.05) {
    recommendation = "bet";
  } else if (betEV < -potBB * 0.02) {
    recommendation = "check";
  } else {
    recommendation = "marginal";
  }

  // ─── Explanation ───
  const foldPct = (foldProbability * 100).toFixed(0);
  const evSign = betEV >= 0 ? "+" : "";
  const evStr = `${evSign}${betEV.toFixed(1)}BB`;

  const children: ExplanationNode[] = [
    {
      summary: `Bet ${betBB.toFixed(1)}BB (${betSizePct}% pot) into ${potBB.toFixed(1)}BB pot`,
      sentiment: "neutral",
      tags: ["bet-size"],
    },
    {
      summary: `${profileName} folds ~${foldPct}% of the time`,
      detail: solverCtx
        ? `GTO fold: ${(solverCtx.gtoFoldFrequency * 100).toFixed(0)}% × ${profileName} foldScale ${solverCtx.foldScale.toFixed(1)}x → ${(baseFoldRate * 100).toFixed(0)}% base, adjusted for ${betSizePct}% pot sizing. Source: ${sourceLabel}.`
        : `Base fold rate: ${(baseFoldRate * 100).toFixed(0)}% (${street}), adjusted for ${betSizePct}% pot bet size. Source: ${sourceLabel}.`,
      sentiment:
        foldProbability > breakEvenFoldPct / 100 ? "positive" : "negative",
      tags: ["fold-rate"],
    },
    {
      summary: `Break-even requires ${breakEvenFoldPct.toFixed(0)}% folds`,
      detail: `You need them to fold at least ${breakEvenFoldPct.toFixed(0)}% of the time for this bet to profit purely on folds (ignoring your equity when called).`,
      sentiment:
        foldProbability * 100 >= breakEvenFoldPct ? "positive" : "neutral",
      tags: ["break-even"],
    },
    {
      summary: `Your equity when called: ${(heroEquityVsRange * 100).toFixed(0)}%`,
      sentiment: heroEquityVsRange > 0.5 ? "positive" : "negative",
      tags: ["equity"],
    },
  ];

  const sentiment =
    recommendation === "bet"
      ? "positive"
      : recommendation === "check"
        ? "negative"
        : "neutral";

  return {
    foldProbability,
    betEV,
    potBB,
    betBB,
    breakEvenFoldPct,
    recommendation,
    explanation: {
      summary: `${betSizePct}% pot bet → EV: ${evStr}`,
      detail:
        recommendation === "bet"
          ? `Betting ${betBB.toFixed(1)}BB is profitable. ${profileName} folds ${foldPct}% of the time, and your ${(heroEquityVsRange * 100).toFixed(0)}% equity compensates when called.`
          : recommendation === "check"
            ? `Betting ${betBB.toFixed(1)}BB is -EV. ${profileName} doesn't fold enough (${foldPct}% vs ${breakEvenFoldPct.toFixed(0)}% needed) and your equity (${(heroEquityVsRange * 100).toFixed(0)}%) doesn't compensate.`
            : `Betting ${betBB.toFixed(1)}BB is marginal. Close to break-even — consider other factors like position and board texture.`,
      sentiment: sentiment as "positive" | "negative" | "neutral",
      children,
      tags: ["fold-equity"],
    },
  };
}

/**
 * Calculate fold equity for standard bet sizes (33%, 50%, 75%, 100% pot).
 */
export function foldEquityScenarios(
  heroEquityVsRange: number,
  params: BehavioralParams,
  potBB: number,
  street: "preflop" | "flop" | "turn" | "river",
  profileName: string,
  solverCtx?: SolverFoldContext,
): FoldEquityScenario[] {
  const sizes = [33, 50, 75, 100];
  return sizes.map((betSizePct) => ({
    betSizePct,
    result: calculateFoldEquity(
      heroEquityVsRange,
      params,
      betSizePct,
      potBB,
      street,
      profileName,
      solverCtx,
    ),
  }));
}

// ─── Helpers ───

/**
 * Get the base fold rate for an opponent in a given situation on a given street.
 *
 * The fold rate is derived from the situation's continuePct:
 *   foldRate = (100 - continuePct) / 100
 *
 * Adjusted by street (later streets = stickier players):
 * - Flop: full fold rate
 * - Turn: 85% of fold rate (people who call flop are stickier)
 * - River: 75% of fold rate
 */
function getBaseFoldRate(
  params: BehavioralParams,
  street: string,
): number {
  const baseFold = (100 - params.continuePct) / 100;

  switch (street) {
    case "preflop":
      return baseFold;
    case "flop":
      return baseFold;
    case "turn":
      return baseFold * 0.85;
    case "river":
      return baseFold * 0.75;
    default:
      return baseFold;
  }
}

/**
 * Adjust fold probability based on bet size relative to pot.
 * Larger bets get more folds. Centered around 75% pot = 1.0.
 */
function betSizeToFoldAdjustment(betSizePct: number): number {
  return 0.5 + (betSizePct / 150);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
