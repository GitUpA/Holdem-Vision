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
import type { DecisionEngine, DecisionContext, EngineDecision } from "./types";
import type { ExplanationNode } from "../../types/analysis";
import { sampleActionFromParams } from "../autoPlay";
import { registerEngine } from "./engineRegistry";

export const basicEngine: DecisionEngine = {
  id: "basic",
  name: "Basic Profile Engine",
  description:
    "Samples actions from behavioral percentages. " +
    "Suitable for simple archetypes like Fish and Nit.",

  decide(ctx: DecisionContext): EngineDecision {
    const { actionType, amount } = sampleActionFromParams(
      ctx.params,
      ctx.legal,
      ctx.potSize,
      ctx.random,
      ctx.holeCards,
    );

    const explanation: ExplanationNode = {
      summary: `${ctx.profile.name} in ${ctx.situationKey}: ${ctx.params.explanation}`,
      sentiment: "neutral",
      children: [
        {
          summary: `Decision: ${actionType}${amount !== undefined ? ` ${amount}` : ""}`,
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
      ],
      tags: ["basic-engine"],
    };

    return {
      actionType,
      amount,
      situationKey: ctx.situationKey,
      engineId: "basic",
      explanation,
    };
  },
};

// ─── Self-register ───
registerEngine(basicEngine);
