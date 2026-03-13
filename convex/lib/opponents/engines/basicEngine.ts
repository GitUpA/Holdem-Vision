/**
 * Basic Decision Engine — sample actions from behavioral parameters.
 *
 * This is the original autoPlay logic wrapped as a DecisionEngine.
 * Used by Fish and Nit profiles. It rolls against continuePct and
 * raisePct from the profile's BehavioralParams for the current situation.
 *
 * Hand strength modulation is built in: strong hands continue more,
 * weak hands fold more, keeping the overall population frequency
 * close to the profile's continuePct.
 */
import { formatSituation } from "./types";
import type { DecisionEngine, DecisionContext, EngineDecision } from "./types";
import type { ExplanationNode } from "../../types/analysis";
import { sampleActionFromParams, paramsToFrequencies, preflopHandScore } from "../autoPlay";
import { registerEngine } from "./engineRegistry";

export const basicEngine: DecisionEngine = {
  id: "basic",
  name: "Basic Profile Engine",
  description:
    "Samples actions from behavioral percentages. " +
    "Suitable for simple archetypes like Fish and Nit.",

  decide(ctx: DecisionContext): EngineDecision {
    const { actionType, amount, isBluff } = sampleActionFromParams(
      ctx.params,
      ctx.legal,
      ctx.potSize,
      ctx.random,
      ctx.holeCards,
    );

    const children: ExplanationNode[] = [
      {
        summary: `Decision: ${actionType}${amount !== undefined ? ` ${amount}` : ""}${isBluff ? " (BLUFF)" : ""}`,
        sentiment: actionType === "fold" ? "negative" : actionType === "raise" || actionType === "bet" ? "positive" : "neutral",
        tags: ["decision"],
      },
      {
        summary: `Continue ${ctx.params.continuePct}% / Raise ${ctx.params.raisePct}% of continuing`,
        detail: `Bluff frequency: ${(ctx.params.bluffFrequency * 100).toFixed(0)}%, Position awareness: ${ctx.params.positionAwareness}`,
        sentiment: "neutral",
        tags: ["params"],
      },
      {
        summary: ctx.params.explanation,
        sentiment: "neutral",
        tags: ["profile-reasoning"],
      },
    ];

    if (isBluff) {
      children.push({
        summary: `Bluff! Weak hand but betting to pressure opponents`,
        detail: `Bluff frequency: ${(ctx.params.bluffFrequency * 100).toFixed(0)}%`,
        sentiment: "positive",
        tags: ["bluff"],
      });
    }

    const explanation: ExplanationNode = {
      summary: `${ctx.profile.name} — ${formatSituation(ctx.situationKey)}: ${ctx.params.explanation}`,
      sentiment: "neutral",
      children,
      tags: ["basic-engine"],
    };

    // Compute frequencies for unified output format
    const handStrength = ctx.holeCards?.length === 2
      ? preflopHandScore(ctx.holeCards) : undefined;
    const frequencies = paramsToFrequencies(ctx.params, ctx.legal, handStrength);

    return {
      actionType,
      amount,
      situationKey: ctx.situationKey,
      engineId: "basic",
      explanation,
      reasoning: {
        frequencies,
        continuePct: ctx.params.continuePct,
        raisePct: ctx.params.raisePct,
        bluffFrequency: ctx.params.bluffFrequency,
      },
    };
  },
};

// ─── Self-register ───
registerEngine(basicEngine);
