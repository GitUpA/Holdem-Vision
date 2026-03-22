/**
 * Scenario Runner — captures ALL outputs through the full pipeline
 * for a given hand scenario. Not pass/fail — produces structured
 * snapshots for human analysis.
 *
 * Usage:
 *   const snapshot = runScenario({ archetypeId: "ace_high_dry_rainbow", seed: 42 });
 *   // snapshot contains every input/output at every stage
 *   // Write to JSON, review, analyze trends
 *
 * Pure TypeScript, zero React, zero Convex.
 */

import type { ArchetypeId } from "../../convex/lib/gto/archetypeClassifier";
import type { ActionFrequencies, GtoAction } from "../../convex/lib/gto/tables/types";
import type { ExplanationNode } from "../../convex/lib/types/analysis";
import { executeDrillPipeline } from "../../convex/lib/gto/drillPipeline";
import { buildBoardNarrative } from "../../convex/lib/gto/narrativeContext";
import { analyzeBoard } from "../../convex/lib/opponents/engines/boardTexture";
import { scoreAction } from "../../convex/lib/gto/evScoring";
import { coachingLens } from "../../convex/lib/analysis/coachingLens";
import { cardToString } from "../../convex/lib/primitives/card";
import type { CardIndex } from "../../convex/lib/types/cards";
import type { CoachingValue } from "../../convex/lib/analysis/coachingLens";

// ═══════════════════════════════════════════════════════
// TYPES — structured snapshot of the full pipeline
// ═══════════════════════════════════════════════════════

export interface ScenarioConfig {
  archetypeId: ArchetypeId;
  seed: number;
  /** Action hero takes (if omitted, tests all legal actions) */
  heroAction?: GtoAction;
}

export interface ScenarioSnapshot {
  config: ScenarioConfig;
  timestamp: string;

  // Stage 1: Deal
  deal: {
    heroCards: string[];           // e.g., ["Ah", "Kd"]
    communityCards: string[];      // e.g., ["As", "7h", "2d"]
    archetypeId: string;
    archetypeDescription: string;
    archetypeCategory: string;
    archetypeConfidence: number;
    handCategory: string;          // e.g., "top_pair_top_kicker"
    handDescription: string;
    relativeStrength: number;
    isInPosition: boolean;
    numPlayers: number;
    hasFrequencyData: boolean;
  };

  // Stage 2: Board narrative
  narrative: {
    headline: string;
    context: string;
    question: string;
  };

  // Stage 3: Board texture (if postflop)
  boardTexture?: {
    wetness: number;
    description: string;
  };

  // Stage 4: GTO solution
  solution: {
    frequencies: ActionFrequencies;
    optimalAction: string;
    optimalFrequency: number;
    availableActions: string[];
    isExactMatch: boolean;
    resolvedCategory: string;
    hasBands: boolean;
    hasAccuracy: boolean;
    accuracyLabel?: string;
    accuracyImpactBB?: number;
    explanationSummary: string;
    explanationTags: string[];
  } | null;

  // Stage 5: Coaching (all 5 profiles)
  coaching: {
    profileName: string;
    action: string;
    amount?: number;
    engineId: string;
    narrativeOneLiner?: string;
    narrativeParagraph?: string;
    characterLabel?: string;
    explanationSummary: string;
  }[];

  // Stage 6: Scoring (for each possible action)
  scoring: {
    action: string;
    verdict: string;
    evLoss: number;
    optimalAction: string;
    userFrequency: number;
    optimalFrequency: number;
  }[];

  // Analysis flags — things a reviewer should look at
  flags: string[];
}

// ═══════════════════════════════════════════════════════
// SEEDED RNG
// ═══════════════════════════════════════════════════════

function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

function cardNames(cards: CardIndex[]): string[] {
  return cards.map((c) => cardToString(c));
}

function collectTags(node: ExplanationNode): string[] {
  const tags: string[] = [...(node.tags || [])];
  for (const child of node.children || []) {
    tags.push(...collectTags(child));
  }
  return [...new Set(tags)];
}

// ═══════════════════════════════════════════════════════
// MAIN RUNNER
// ═══════════════════════════════════════════════════════

export function runScenario(config: ScenarioConfig): ScenarioSnapshot {
  const rng = seededRng(config.seed);
  const flags: string[] = [];

  // ── Stage 1: Deal ──
  const result = executeDrillPipeline(config.archetypeId, rng);
  const { deal, state, solution } = result;

  // ── Stage 2: Narrative context ──
  const boardTexture = deal.communityCards.length >= 3
    ? analyzeBoard(deal.communityCards)
    : undefined;

  const narrative = buildBoardNarrative(
    deal.archetype,
    deal.handCategory,
    boardTexture,
    deal.isInPosition,
  );

  // Flag: narrative headline is empty
  if (!narrative.headline) flags.push("EMPTY_NARRATIVE_HEADLINE");

  // ── Stage 3: Solution ──
  let solutionSnapshot: ScenarioSnapshot["solution"] = null;
  if (solution) {
    solutionSnapshot = {
      frequencies: solution.frequencies,
      optimalAction: solution.optimalAction,
      optimalFrequency: solution.optimalFrequency,
      availableActions: solution.availableActions,
      isExactMatch: solution.isExactMatch,
      resolvedCategory: solution.resolvedCategory,
      hasBands: !!solution.bands,
      hasAccuracy: !!solution.archetypeAccuracy,
      accuracyLabel: solution.archetypeAccuracy?.confidenceLabel,
      accuracyImpactBB: solution.accuracyImpact?.maxEvImpactBB,
      explanationSummary: solution.explanation.summary,
      explanationTags: collectTags(solution.explanation),
    };

    // Flag: solution has no frequency data
    if (Object.keys(solution.frequencies).length === 0) {
      flags.push("EMPTY_FREQUENCIES");
    }
    // Flag: optimal action has very low frequency
    if (solution.optimalFrequency < 0.3) {
      flags.push("LOW_OPTIMAL_FREQUENCY:" + solution.optimalFrequency.toFixed(2));
    }
  } else {
    flags.push("NO_SOLUTION");
  }

  // ── Stage 4: Coaching ──
  const coachingSnapshots: ScenarioSnapshot["coaching"] = [];
  try {
    const coachingResult = coachingLens.analyze({
      gameState: state,
      heroCards: deal.heroCards,
      heroSeatIndex: deal.heroSeatIndex,
      communityCards: deal.communityCards,
      deadCards: [],
      opponents: [],
      street: deal.archetype.category === "preflop" ? "preflop" : "flop",
    });

    const coachingValue = coachingResult.value as CoachingValue | undefined;
    if (coachingValue) {
      for (const advice of coachingValue.advices) {
        coachingSnapshots.push({
          profileName: advice.profileName,
          action: advice.actionType,
          amount: advice.amount,
          engineId: advice.engineId,
          narrativeOneLiner: advice.narrative?.oneLiner,
          narrativeParagraph: advice.narrative?.paragraph,
          characterLabel: advice.narrative?.character?.label,
          explanationSummary: advice.explanation.summary,
        });
      }
    }
  } catch {
    flags.push("COACHING_FAILED");
  }

  // Flag: GTO coaching action disagrees with solution optimal
  if (solution && coachingSnapshots.length > 0) {
    const gtoAdvice = coachingSnapshots.find((a) => a.profileName === "GTO");
    if (gtoAdvice && gtoAdvice.action !== solution.optimalAction) {
      // Check if it maps to same action family
      const sameFamily =
        (gtoAdvice.action.startsWith("bet") && solution.optimalAction.startsWith("bet")) ||
        (gtoAdvice.action === "call" && solution.optimalAction === "call") ||
        (gtoAdvice.action === "fold" && solution.optimalAction === "fold") ||
        (gtoAdvice.action === "check" && solution.optimalAction === "check");
      if (!sameFamily) {
        flags.push(`GTO_COACHING_DISAGREES:${gtoAdvice.action}≠${solution.optimalAction}`);
      }
    }
  }

  // ── Stage 5: Scoring (test all available actions) ──
  const scoringSnapshots: ScenarioSnapshot["scoring"] = [];
  if (solution) {
    const actionsToTest = config.heroAction
      ? [config.heroAction]
      : solution.availableActions;

    for (const action of actionsToTest) {
      const score = scoreAction(
        deal.archetype,
        deal.handCategory,
        action,
        state.pot.total,
        deal.isInPosition,
        deal.archetype.category === "preflop" ? "preflop" : "flop",
      );
      if (score) {
        scoringSnapshots.push({
          action,
          verdict: score.verdict,
          evLoss: score.evLoss,
          optimalAction: score.optimalAction,
          userFrequency: score.userActionFrequency,
          optimalFrequency: score.optimalFrequency,
        });
      }
    }
  }

  // ── Stage 6: Consistency flags ──
  // Flag: narrative question doesn't match hand category
  const catStrength = deal.handCategory.relativeStrength;
  if (catStrength > 0.7 && narrative.question.toLowerCase().includes("nothing")) {
    flags.push("NARRATIVE_QUESTION_MISMATCH:strong_hand_but_weak_question");
  }
  if (catStrength < 0.2 && narrative.question.toLowerCase().includes("value")) {
    flags.push("NARRATIVE_QUESTION_MISMATCH:weak_hand_but_value_question");
  }

  // Flag: all coaching profiles agree (interesting or boring?)
  const uniqueActions = new Set(coachingSnapshots.map((a) => a.action));
  if (uniqueActions.size === 1 && coachingSnapshots.length >= 4) {
    flags.push("ALL_PROFILES_AGREE:" + [...uniqueActions][0]);
  }

  return {
    config,
    timestamp: new Date().toISOString(),
    deal: {
      heroCards: cardNames(deal.heroCards),
      communityCards: cardNames(deal.communityCards),
      archetypeId: deal.archetype.archetypeId,
      archetypeDescription: deal.archetype.description,
      archetypeCategory: deal.archetype.category,
      archetypeConfidence: deal.archetype.confidence,
      handCategory: deal.handCategory.category,
      handDescription: deal.handCategory.description,
      relativeStrength: deal.handCategory.relativeStrength,
      isInPosition: deal.isInPosition,
      numPlayers: deal.numPlayers,
      hasFrequencyData: deal.hasFrequencyData,
    },
    narrative,
    boardTexture: boardTexture
      ? { wetness: boardTexture.wetness, description: boardTexture.description }
      : undefined,
    solution: solutionSnapshot,
    coaching: coachingSnapshots,
    scoring: scoringSnapshots,
    flags,
  };
}

// ═══════════════════════════════════════════════════════
// BATCH RUNNER — run many scenarios, collect for analysis
// ═══════════════════════════════════════════════════════

export interface BatchResult {
  totalScenarios: number;
  flagSummary: Record<string, number>;
  scenariosByArchetype: Record<string, ScenarioSnapshot[]>;
  allFlags: { scenario: string; flags: string[] }[];
}

export function runBatch(
  archetypes: ArchetypeId[],
  scenariosPerArchetype: number,
  baseSeed = 1000,
): BatchResult {
  const scenariosByArchetype: Record<string, ScenarioSnapshot[]> = {};
  const allFlags: { scenario: string; flags: string[] }[] = [];
  const flagSummary: Record<string, number> = {};
  let total = 0;

  for (const archetypeId of archetypes) {
    const snapshots: ScenarioSnapshot[] = [];
    for (let i = 0; i < scenariosPerArchetype; i++) {
      const seed = baseSeed + total;
      try {
        const snapshot = runScenario({ archetypeId, seed });
        snapshots.push(snapshot);

        if (snapshot.flags.length > 0) {
          allFlags.push({
            scenario: `${archetypeId}#${i} (seed=${seed})`,
            flags: snapshot.flags,
          });
          for (const flag of snapshot.flags) {
            const key = flag.split(":")[0];
            flagSummary[key] = (flagSummary[key] || 0) + 1;
          }
        }
      } catch (err) {
        allFlags.push({
          scenario: `${archetypeId}#${i} (seed=${seed})`,
          flags: [`CRASH:${err instanceof Error ? err.message : String(err)}`],
        });
        flagSummary["CRASH"] = (flagSummary["CRASH"] || 0) + 1;
      }
      total++;
    }
    scenariosByArchetype[archetypeId] = snapshots;
  }

  return { totalScenarios: total, flagSummary, scenariosByArchetype, allFlags };
}

// ═══════════════════════════════════════════════════════
// PRETTY PRINT — human-readable scenario summary
// ═══════════════════════════════════════════════════════

export function formatSnapshot(s: ScenarioSnapshot): string {
  const lines: string[] = [];

  lines.push(`═══ SCENARIO: ${s.deal.archetypeId} (seed=${s.config.seed}) ═══`);
  lines.push(`Hero: ${s.deal.heroCards.join(" ")} | Board: ${s.deal.communityCards.join(" ") || "(preflop)"}`);
  lines.push(`Hand: ${s.deal.handCategory} (${s.deal.handDescription}) | Strength: ${s.deal.relativeStrength.toFixed(2)}`);
  lines.push(`Position: ${s.deal.isInPosition ? "IP" : "OOP"} | Archetype: ${s.deal.archetypeDescription}`);
  lines.push("");

  lines.push(`── NARRATIVE ──`);
  lines.push(`Headline: ${s.narrative.headline}`);
  lines.push(`Context: ${s.narrative.context}`);
  lines.push(`Question: ${s.narrative.question}`);
  lines.push("");

  if (s.solution) {
    lines.push(`── GTO SOLUTION ──`);
    lines.push(`Optimal: ${s.solution.optimalAction} (${(s.solution.optimalFrequency * 100).toFixed(0)}%)`);
    const freqStr = Object.entries(s.solution.frequencies)
      .filter(([, v]) => v > 0.01)
      .sort(([, a], [, b]) => b - a)
      .map(([k, v]) => `${k}: ${(v * 100).toFixed(0)}%`)
      .join(", ");
    lines.push(`Frequencies: ${freqStr}`);
    lines.push(`Category: ${s.solution.resolvedCategory} | Exact: ${s.solution.isExactMatch}`);
    if (s.solution.accuracyLabel) {
      lines.push(`Accuracy: ${s.solution.accuracyLabel} (±${s.solution.accuracyImpactBB?.toFixed(2) ?? "?"} BB)`);
    }
    lines.push("");
  }

  lines.push(`── COACHING ──`);
  for (const c of s.coaching) {
    const narrativeNote = c.narrativeOneLiner ? ` | "${c.narrativeOneLiner}"` : "";
    const charNote = c.characterLabel ? ` [${c.characterLabel}]` : "";
    lines.push(`  ${c.profileName}${charNote}: ${c.action}${c.amount ? " " + c.amount : ""}${narrativeNote}`);
  }
  lines.push("");

  if (s.scoring.length > 0) {
    lines.push(`── SCORING (all actions) ──`);
    for (const sc of s.scoring) {
      lines.push(`  ${sc.action}: ${sc.verdict} (EV loss: ${sc.evLoss.toFixed(1)} BB, freq: ${(sc.userFrequency * 100).toFixed(0)}%)`);
    }
    lines.push("");
  }

  if (s.flags.length > 0) {
    lines.push(`── FLAGS ──`);
    for (const f of s.flags) {
      lines.push(`  ⚠ ${f}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
