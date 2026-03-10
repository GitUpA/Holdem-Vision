/**
 * MonteCarloLens — opt-in equity simulation.
 * Runs Monte Carlo trials to compute win/tie/lose percentages
 * and hand distribution. Expensive — only runs when the user
 * explicitly enables this lens.
 *
 * Pure TypeScript, zero Convex imports.
 */
import type { AnalysisLens, AnalysisContext, AnalysisResult, ExplanationNode } from "../types/analysis";
import type { VisualDirective } from "../types/visuals";
import { monteCarloEquity, type EquityResult } from "./monteCarlo";
import { cardToDisplay } from "../primitives/card";

export interface MonteCarloValue {
  equity: EquityResult;
}

export const monteCarloLens: AnalysisLens = {
  id: "monte-carlo",
  name: "Equity",
  description: "Win/tie/lose equity against random holdings — exact on river/turn, simulated on flop/preflop",
  heavy: true,

  analyze(context: AnalysisContext): AnalysisResult<MonteCarloValue> {
    const { heroCards, communityCards, deadCards } = context;
    const numOpponents = context.numPlayers ? context.numPlayers - 1 : 1;

    const equity = monteCarloEquity(heroCards, communityCards, {
      numOpponents,
      deadCards,
      trials: 10000,
    });

    const value: MonteCarloValue = { equity };
    const explanation = buildExplanation(context, equity);
    const visuals = buildVisuals(equity);

    return {
      value,
      context,
      explanation,
      visuals,
      lensId: "monte-carlo",
      dependencies: [],
    };
  },
};

function buildExplanation(
  context: AnalysisContext,
  equity: EquityResult,
): ExplanationNode {
  const winPct = (equity.win * 100).toFixed(1);
  const tiePct = (equity.tie * 100).toFixed(1);
  const losePct = (equity.lose * 100).toFixed(1);

  const heroDisplay = context.heroCards.map(cardToDisplay).join(" ");
  const communityDisplay = context.communityCards.length > 0
    ? context.communityCards.map(cardToDisplay).join(" ")
    : "none";

  const sentiment = equity.win > 0.6 ? "positive"
    : equity.win > 0.4 ? "neutral"
    : "negative";

  const children: ExplanationNode[] = [];

  // Win/Tie/Lose breakdown
  const isExact = context.communityCards.length >= 4;
  const methodLabel = isExact
    ? "exact enumeration"
    : `${equity.trials.toLocaleString()} simulated outcomes`;
  children.push({
    summary: `Win ${winPct}% · Tie ${tiePct}% · Lose ${losePct}%`,
    detail: `Based on ${methodLabel} against ${context.numPlayers ? context.numPlayers - 1 : 1} random opponent(s).`,
    sentiment,
    tags: ["equity-breakdown"],
  });

  // Hand distribution
  const distEntries = Object.entries(equity.handDistribution)
    .sort((a, b) => b[1] - a[1])
    .filter(([, pct]) => pct > 0.005);

  if (distEntries.length > 0) {
    children.push({
      summary: "Hand distribution across outcomes",
      children: distEntries.map(([name, pct]) => ({
        summary: `${name}: ${(pct * 100).toFixed(1)}%`,
        sentiment: "neutral" as const,
        tags: ["hand-distribution"],
      })),
      tags: ["hand-distribution"],
    });
  }

  return {
    summary: `${winPct}% equity with ${heroDisplay}${isExact ? " (exact)" : ""}`,
    detail: `Hero holds ${heroDisplay}. Community: ${communityDisplay}. Against random holdings, hero wins ${winPct}% of the time. ${isExact ? "Calculated exactly." : "Estimated via Monte Carlo simulation."}`,
    sentiment,
    children,
    tags: ["equity"],
  };
}

function buildVisuals(equity: EquityResult): VisualDirective[] {
  return [
    {
      type: "equity_bar",
      data: {
        win: equity.win,
        tie: equity.tie,
        lose: equity.lose,
      },
      priority: 9,
      lensId: "monte-carlo",
    },
    {
      type: "equity_breakdown",
      data: {
        handDistribution: equity.handDistribution,
        trials: equity.trials,
      },
      priority: 7,
      lensId: "monte-carlo",
    },
  ];
}
