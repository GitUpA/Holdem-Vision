/**
 * OpponentReadLens — equity against opponents' implied ranges (not vacuum).
 *
 * This is where the learning happens. It shows:
 * 1. Each opponent's estimated range (based on profile + actions)
 * 2. Hero's equity against that range (vs vacuum)
 * 3. The delta: "82% in vacuum → 55% against this opponent"
 * 4. Why: explanation tracing back through the opponent's actions
 *
 * Pure TypeScript, zero Convex imports.
 */
import type {
  AnalysisLens,
  AnalysisContext,
  AnalysisResult,
  ExplanationNode,
} from "../types/analysis";
import type { VisualDirective, RangeHighlight } from "../types/visuals";
import type { CardIndex } from "../types/cards";
import type {
  WeightedRange,
  SituationKey,
} from "../types/opponents";
import { monteCarloEquity, type EquityResult } from "./monteCarlo";
import { estimateRange } from "../opponents/rangeEstimator";
import { resolveProfile } from "../opponents/profileResolver";
import { comboToCards, rangePct } from "../opponents/combos";
import { evaluateHand, compareHandRanks } from "../primitives/handEvaluator";
import { cardToDisplay } from "../primitives/card";
import { foldEquityScenarios, type SolverFoldContext } from "./foldEquity";
import { classifyArchetype, contextFromGameState } from "../gto/archetypeClassifier";
import { lookupFrequencies, hasTable } from "../gto/tables";
import { getModifierMap } from "../opponents/engines/modifierProfiles";
import type { GameState } from "../state/game-state";

export interface OpponentReadValue {
  /** Per-opponent breakdown */
  opponents: OpponentAnalysis[];
  /** Aggregate equity against all opponents' ranges */
  aggregateEquity: EquityResult;
  /** Raw vacuum equity for comparison */
  vacuumEquity: EquityResult;
  /** The delta: how much the opponents' actions change your equity */
  equityDelta: number;
}

export interface OpponentAnalysis {
  label: string;
  profileName: string;
  position?: string;
  estimatedRange: WeightedRange;
  rangePct: number;
  equityAgainst: EquityResult;
  rangeExplanation: ExplanationNode;
  foldEquity?: import("./foldEquity").FoldEquityScenario[];
}

export const opponentReadLens: AnalysisLens = {
  id: "opponent-read",
  name: "Opponent Read",
  description:
    "Equity against opponents' implied ranges based on their profiles and actions",

  analyze(context: AnalysisContext): AnalysisResult<OpponentReadValue> {
    const { heroCards, communityCards, deadCards, opponents } = context;

    // If no opponents have profiles, return a helpful "no data" result
    if (
      opponents.length === 0 ||
      opponents.every((o) => !o.profile && o.actions.length === 0)
    ) {
      return noOpponentResult(context);
    }

    const knownCards = [...heroCards, ...communityCards, ...deadCards];

    // Compute vacuum equity for comparison
    const vacuumEquity = monteCarloEquity(heroCards, communityCards, {
      numOpponents: Math.max(opponents.length, 1),
      deadCards,
      trials: 5000,
    });

    // Analyze each opponent
    const opponentAnalyses: OpponentAnalysis[] = [];

    for (const opp of opponents) {
      if (!opp.profile && opp.actions.length === 0) continue;

      const profile = opp.profile;
      let estimatedRange: WeightedRange;
      let rangeExplanation: ExplanationNode;
      let rpct: number;

      if (profile) {
        const estimation = estimateRange(profile, opp.actions, knownCards, opp.position);
        estimatedRange = estimation.range;
        rangeExplanation = estimation.explanation;
        rpct = estimation.rangePctOfAll;
      } else {
        // No profile — use actions alone with generic assumptions
        estimatedRange = opp.impliedRange;
        rangeExplanation = opp.rangeDerivation;
        rpct = rangePct(opp.impliedRange);
      }

      // Calculate equity against this opponent's specific range
      const equityAgainst = equityVsRange(
        heroCards,
        communityCards,
        estimatedRange,
        deadCards,
      );

      // Compute fold equity scenarios when game context is available
      let foldEq: import("./foldEquity").FoldEquityScenario[] | undefined;
      if (context.gameContext && profile) {
        const potBB =
          context.gameContext.blinds.big > 0
            ? context.gameContext.pot / context.gameContext.blinds.big
            : context.gameContext.pot;
        // Resolve profile and pick the facing_bet situation params for fold equity
        const resolved = resolveProfile(profile, () => undefined);
        const situationKey: SituationKey =
          context.street === "preflop"
            ? "preflop.facing_raise"
            : "postflop.facing_bet";
        const params = resolved[situationKey];

        // Try solver-informed fold equity
        const solverCtx = context.gameState
          ? buildSolverFoldContext(context.gameState, opp.seatIndex, profile.id, situationKey)
          : undefined;

        foldEq = foldEquityScenarios(
          equityAgainst.win,
          params,
          potBB,
          context.street as "preflop" | "flop" | "turn" | "river",
          profile.name,
          solverCtx,
        );
      }

      opponentAnalyses.push({
        label: opp.label,
        profileName: profile?.name ?? "Unknown",
        position: opp.position,
        estimatedRange,
        rangePct: rpct,
        equityAgainst,
        rangeExplanation,
        foldEquity: foldEq,
      });
    }

    // Aggregate equity (simplified: average across opponents)
    const aggregateEquity =
      opponentAnalyses.length === 1
        ? opponentAnalyses[0].equityAgainst
        : averageEquity(opponentAnalyses.map((o) => o.equityAgainst));

    const equityDelta = aggregateEquity.win - vacuumEquity.win;

    const value: OpponentReadValue = {
      opponents: opponentAnalyses,
      aggregateEquity,
      vacuumEquity,
      equityDelta,
    };

    const explanation = buildExplanation(context, value);
    const visuals = buildVisuals(value, opponentAnalyses);

    return {
      value,
      context,
      explanation,
      visuals,
      lensId: "opponent-read",
      dependencies: ["raw-equity"],
    };
  },
};

// ─── Solver-informed fold context ───

/**
 * Build solver-informed fold context for an opponent.
 *
 * Looks up the GTO fold frequency for this board texture + street,
 * then applies the opponent profile's foldScale modifier.
 *
 * Returns undefined if no solver data is available (falls back to heuristic).
 */
function buildSolverFoldContext(
  gameState: GameState,
  villainSeatIndex: number,
  profileId: string,
  situationKey: SituationKey,
): SolverFoldContext | undefined {
  if (gameState.communityCards.length < 3) return undefined; // preflop — no texture

  // Classify the board texture
  const classCtx = contextFromGameState(gameState, villainSeatIndex);
  const archetype = classifyArchetype(classCtx);
  const lookupArchetypeId = archetype.textureArchetypeId ?? archetype.archetypeId;
  const street = gameState.currentStreet;

  if (!hasTable(lookupArchetypeId, street)) return undefined;

  // Look up GTO frequencies for a "generic" hand facing a bet.
  // We use the OOP perspective (villain facing hero's bet) — check + fold frequencies.
  // The "fold" frequency in solver data is implicit: 1 - sum(check, call, bet, raise).
  // But solver tables have: check, bet_small, bet_medium, bet_large.
  // When facing a bet, "check" maps to "call" (via remap), and no "fold" is stored.
  // GTO fold frequency = 1 - sum of all action frequencies for this category.
  //
  // Use a representative category — "middle_pair" is a common marginal spot
  // that captures typical fold/continue frequencies.
  const lookup = lookupFrequencies(lookupArchetypeId, "middle_pair", false, street);
  if (!lookup) return undefined;

  // Sum all action frequencies — GTO fold = 1 - total
  const totalActionFreq = Object.values(lookup.frequencies)
    .reduce((sum, f) => sum + (f ?? 0), 0);
  const gtoFoldFrequency = Math.max(0, 1 - totalActionFreq);

  // Get profile's foldScale for this situation
  const modifierMap = getModifierMap(profileId);
  const modifier = modifierMap[situationKey];
  const foldScale = modifier?.base.foldScale ?? 1.0;

  // Archetype label for explanation
  const archetypeLabel = lookupArchetypeId.replace(/_/g, " ");

  return {
    gtoFoldFrequency,
    foldScale,
    archetypeLabel,
  };
}

// ─── Equity vs specific range ───

/**
 * Compute equity of heroCards against a weighted range of opponent holdings.
 * Samples combos from the range proportional to their weight.
 */
function equityVsRange(
  heroCards: CardIndex[],
  communityCards: CardIndex[],
  range: WeightedRange,
  deadCards: CardIndex[],
  trials: number = 5000,
): EquityResult {
  if (range.size === 0) {
    return { win: 1, tie: 0, lose: 0, trials: 0, handDistribution: {} };
  }

  const knownCards = new Set([...heroCards, ...communityCards, ...deadCards]);

  // Build weighted combo array for sampling
  const combos: { cards: [CardIndex, CardIndex]; weight: number }[] = [];
  let totalWeight = 0;

  for (const [combo, weight] of range) {
    if (weight <= 0) continue;
    const cards = comboToCards(combo);
    // Skip combos that conflict with known cards
    if (knownCards.has(cards[0]) || knownCards.has(cards[1])) continue;
    combos.push({ cards, weight });
    totalWeight += weight;
  }

  if (combos.length === 0 || totalWeight === 0) {
    return { win: 1, tie: 0, lose: 0, trials: 0, handDistribution: {} };
  }

  // Build CDF for weighted sampling
  const cdf: number[] = [];
  let cumulative = 0;
  for (const c of combos) {
    cumulative += c.weight / totalWeight;
    cdf.push(cumulative);
  }

  let wins = 0;
  let ties = 0;
  let losses = 0;
  const handCounts: Record<string, number> = {};
  const communityNeeded = 5 - communityCards.length;

  // Available cards for completing the board
  const baseAvailable = Array.from({ length: 52 }, (_, i) => i).filter(
    (c) => !knownCards.has(c),
  );

  for (let t = 0; t < trials; t++) {
    // Sample an opponent hand from the weighted range
    const r = Math.random();
    let oppIdx = 0;
    for (let i = 0; i < cdf.length; i++) {
      if (r <= cdf[i]) {
        oppIdx = i;
        break;
      }
    }
    const oppCards = combos[oppIdx].cards;

    // Available cards minus the opponent's hand
    const available = baseAvailable.filter(
      (c) => c !== oppCards[0] && c !== oppCards[1],
    );

    if (available.length < communityNeeded) continue;

    // Shuffle and deal remaining community cards
    const shuffled = fisherYatesSample(available, communityNeeded);
    const fullCommunity = [...communityCards, ...shuffled];

    // Evaluate
    const heroAll = [...heroCards, ...fullCommunity];
    const oppAll = [...oppCards, ...fullCommunity];

    const heroEval = evaluateHand(heroAll);
    const oppEval = evaluateHand(oppAll);

    // Track distribution
    const handName = heroEval.rank.name;
    handCounts[handName] = (handCounts[handName] ?? 0) + 1;

    const cmp = compareHandRanks(heroEval.rank, oppEval.rank);
    if (cmp > 0) wins++;
    else if (cmp === 0) ties++;
    else losses++;
  }

  const total = wins + ties + losses;
  if (total === 0) {
    return { win: 1, tie: 0, lose: 0, trials: 0, handDistribution: {} };
  }

  const handDistribution: Record<string, number> = {};
  for (const [name, count] of Object.entries(handCounts)) {
    handDistribution[name] = count / total;
  }

  return {
    win: wins / total,
    tie: ties / total,
    lose: losses / total,
    trials: total,
    handDistribution,
  };
}

/**
 * Fisher-Yates partial shuffle to sample n cards.
 */
function fisherYatesSample(arr: number[], n: number): number[] {
  const a = [...arr];
  for (let i = a.length - 1; i > a.length - 1 - n && i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(a.length - n);
}

/**
 * Average multiple equity results (simple mean).
 */
function averageEquity(results: EquityResult[]): EquityResult {
  if (results.length === 0) {
    return { win: 0, tie: 0, lose: 0, trials: 0, handDistribution: {} };
  }

  let winSum = 0;
  let tieSum = 0;
  let loseSum = 0;
  let totalTrials = 0;

  for (const r of results) {
    winSum += r.win;
    tieSum += r.tie;
    loseSum += r.lose;
    totalTrials += r.trials;
  }

  const n = results.length;
  return {
    win: winSum / n,
    tie: tieSum / n,
    lose: loseSum / n,
    trials: totalTrials,
    handDistribution: results[0].handDistribution, // Use first for simplicity
  };
}

// ─── Explanation & Visuals ───

function buildExplanation(
  context: AnalysisContext,
  value: OpponentReadValue,
): ExplanationNode {
  const heroDisplay = context.heroCards.map(cardToDisplay).join(" ");
  const vacWin = (value.vacuumEquity.win * 100).toFixed(1);
  const aggWin = (value.aggregateEquity.win * 100).toFixed(1);
  const delta = (value.equityDelta * 100).toFixed(1);
  const deltaSign = value.equityDelta >= 0 ? "+" : "";

  const sentiment =
    value.equityDelta > 0.05
      ? "positive"
      : value.equityDelta < -0.1
        ? "negative"
        : "neutral";

  const children: ExplanationNode[] = [];

  // Delta summary
  children.push({
    summary: `Equity shift: ${vacWin}% (vacuum) → ${aggWin}% (vs reads) [${deltaSign}${delta}%]`,
    detail:
      value.equityDelta < -0.1
        ? "Your equity dropped significantly once we account for what the opponent is likely holding. Their actions suggest strength."
        : value.equityDelta > 0.05
          ? "Your equity actually improves against the opponent's likely range. Their actions suggest weaker holdings than average."
          : "The opponent's actions don't dramatically change your equity — they could have a wide variety of hands.",
    sentiment,
    tags: ["equity-delta"],
  });

  // Per-opponent breakdowns
  for (const opp of value.opponents) {
    const oppWin = (opp.equityAgainst.win * 100).toFixed(1);
    const posLabel = opp.position ? `, ${opp.position.toUpperCase()}` : "";
    children.push({
      summary: `vs ${opp.label} (${opp.profileName}${posLabel}): ${oppWin}% equity, range ~${opp.rangePct.toFixed(0)}%`,
      children: [opp.rangeExplanation],
      sentiment:
        opp.equityAgainst.win > 0.55
          ? "positive"
          : opp.equityAgainst.win < 0.4
            ? "negative"
            : "neutral",
      tags: ["per-opponent"],
    });
  }

  return {
    summary: `${aggWin}% equity vs opponent reads (${deltaSign}${delta}% from vacuum)`,
    detail: `Hero holds ${heroDisplay}. Against random holdings you have ${vacWin}% equity. But accounting for ${value.opponents.length} opponent(s)' profiles and actions, your real equity is ${aggWin}%.`,
    sentiment,
    children,
    tags: ["opponent-read"],
  };
}

function buildVisuals(
  value: OpponentReadValue,
  opponents: OpponentAnalysis[],
): VisualDirective[] {
  const visuals: VisualDirective[] = [];

  // Comparison equity bar (vacuum vs reads)
  visuals.push({
    type: "comparison",
    data: {
      label: "Equity: Vacuum vs Opponent Reads",
      vacuum: {
        win: value.vacuumEquity.win,
        tie: value.vacuumEquity.tie,
        lose: value.vacuumEquity.lose,
      },
      reads: {
        win: value.aggregateEquity.win,
        tie: value.aggregateEquity.tie,
        lose: value.aggregateEquity.lose,
      },
      delta: value.equityDelta,
    },
    priority: 10,
    lensId: "opponent-read",
  });

  // Range grid for each opponent
  for (const opp of opponents) {
    const highlights: RangeHighlight[] = [];
    const handClassWeights: Record<string, { totalWeight: number; count: number }> = {};

    for (const [combo, weight] of opp.estimatedRange) {
      const r1 = combo[0];
      const s1 = combo[1];
      const r2 = combo[2];
      const s2 = combo[3];
      const rv1 = "23456789TJQKA".indexOf(r1);
      const rv2 = "23456789TJQKA".indexOf(r2);
      const high = rv1 >= rv2 ? r1 : r2;
      const low = rv1 >= rv2 ? r2 : r1;
      let hc: string;
      if (r1 === r2) hc = `${high}${low}`;
      else if (s1 === s2) hc = `${high}${low}s`;
      else hc = `${high}${low}o`;

      if (!handClassWeights[hc]) handClassWeights[hc] = { totalWeight: 0, count: 0 };
      handClassWeights[hc].totalWeight += weight;
      handClassWeights[hc].count += 1;
    }

    for (const [hc, { totalWeight, count }] of Object.entries(handClassWeights)) {
      const avgWeight = totalWeight / count;
      if (avgWeight > 0.01) {
        highlights.push({
          combo: hc,
          weight: avgWeight,
          category: avgWeight > 0.7 ? "behind" : avgWeight > 0.3 ? "drawing" : "ahead",
          color: avgWeight > 0.7 ? "#ef4444" : avgWeight > 0.3 ? "#f59e0b" : "#22c55e",
        });
      }
    }

    visuals.push({
      type: "range_grid",
      data: {
        label: `${opp.label}'s Range (${opp.profileName})`,
        highlights,
        rangePct: opp.rangePct,
      },
      priority: 8,
      lensId: "opponent-read",
    });
  }

  return visuals;
}

/**
 * Result when no opponents have profiles or actions.
 */
function noOpponentResult(
  context: AnalysisContext,
): AnalysisResult<OpponentReadValue> {
  const vacuumEquity = monteCarloEquity(
    context.heroCards,
    context.communityCards,
    {
      numOpponents: 1,
      deadCards: context.deadCards,
      trials: 3000,
    },
  );

  return {
    value: {
      opponents: [],
      aggregateEquity: vacuumEquity,
      vacuumEquity,
      equityDelta: 0,
    },
    context,
    explanation: {
      summary: "No opponent data — showing vacuum equity",
      detail:
        "Add an opponent with a profile and record their actions to see how your equity shifts from vacuum to action-informed.",
      sentiment: "neutral",
      tags: ["no-opponents"],
    },
    visuals: [],
    lensId: "opponent-read",
    dependencies: ["raw-equity"],
  };
}
