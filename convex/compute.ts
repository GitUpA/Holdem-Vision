import { v } from "convex/values";
import { action } from "./_generated/server";
import { monteCarloEquity } from "./lib/analysis/monteCarlo";

// ─── Server-side Monte Carlo equity calculation ───
// Use this for heavy simulations (50k+ trials) to avoid blocking the UI.
export const computeEquity = action({
  args: {
    heroCards: v.array(v.number()),
    communityCards: v.array(v.number()),
    deadCards: v.optional(v.array(v.number())),
    numOpponents: v.optional(v.number()),
    trials: v.optional(v.number()),
  },
  handler: async (_ctx, args) => {
    const result = monteCarloEquity(args.heroCards, args.communityCards, {
      numOpponents: args.numOpponents ?? 1,
      deadCards: args.deadCards ?? [],
      trials: args.trials ?? 50000,
    });

    return {
      win: result.win,
      tie: result.tie,
      lose: result.lose,
      trials: result.trials,
      handDistribution: result.handDistribution,
    };
  },
});
