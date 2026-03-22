import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ═══════════════════════════════════════════════════════
// SAVE DRILL RESULT (one per hand)
// ═══════════════════════════════════════════════════════

export const saveResult = mutation({
  args: {
    archetypeId: v.string(),
    handCategory: v.string(),
    street: v.string(),
    isInPosition: v.boolean(),
    userAction: v.string(),
    optimalAction: v.string(),
    verdict: v.string(),
    evLoss: v.number(),
    narrativeChoice: v.optional(v.string()),
    narrativeAlignment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) throw new Error("User not found");

    return ctx.db.insert("trainingResults", {
      userId: user._id,
      ...args,
      createdAt: Date.now(),
    });
  },
});

// ═══════════════════════════════════════════════════════
// SAVE DRILL SESSION (one per completed multi-hand drill)
// ═══════════════════════════════════════════════════════

export const saveSession = mutation({
  args: {
    archetypeId: v.string(),
    handsPlayed: v.number(),
    accuracy: v.number(),
    avgEvLoss: v.number(),
    verdicts: v.string(),
    narrativeAlignmentRate: v.optional(v.number()),
    insights: v.optional(v.string()),
    duration: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) throw new Error("User not found");

    return ctx.db.insert("drillSessions", {
      userId: user._id,
      ...args,
      createdAt: Date.now(),
    });
  },
});

// ═══════════════════════════════════════════════════════
// LIST SESSIONS
// ═══════════════════════════════════════════════════════

export const listSessions = query({
  args: {
    archetypeId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) throw new Error("User not found");

    const limit = args.limit ?? 20;

    if (args.archetypeId) {
      return ctx.db
        .query("drillSessions")
        .withIndex("by_user_archetype", (q) =>
          q.eq("userId", user._id).eq("archetypeId", args.archetypeId!),
        )
        .order("desc")
        .take(limit);
    }

    return ctx.db
      .query("drillSessions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(limit);
  },
});

// ═══════════════════════════════════════════════════════
// SESSION STATS (aggregate for dashboard)
// ═══════════════════════════════════════════════════════

export const getSessionStats = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) throw new Error("User not found");

    const sessions = await ctx.db
      .query("drillSessions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    if (sessions.length === 0) {
      return {
        totalSessions: 0,
        totalHands: 0,
        overallAccuracy: 0,
        avgEvLoss: 0,
        byArchetype: {} as Record<string, { sessions: number; accuracy: number; hands: number }>,
      };
    }

    const totalHands = sessions.reduce((s, sess) => s + sess.handsPlayed, 0);
    const overallAccuracy = sessions.reduce((s, sess) => s + sess.accuracy * sess.handsPlayed, 0) / totalHands;
    const avgEvLoss = sessions.reduce((s, sess) => s + sess.avgEvLoss * sess.handsPlayed, 0) / totalHands;

    const byArchetype: Record<string, { sessions: number; accuracy: number; hands: number }> = {};
    for (const sess of sessions) {
      if (!byArchetype[sess.archetypeId]) {
        byArchetype[sess.archetypeId] = { sessions: 0, accuracy: 0, hands: 0 };
      }
      const arch = byArchetype[sess.archetypeId];
      arch.sessions++;
      arch.hands += sess.handsPlayed;
      arch.accuracy = (arch.accuracy * (arch.hands - sess.handsPlayed) + sess.accuracy * sess.handsPlayed) / arch.hands;
    }

    return {
      totalSessions: sessions.length,
      totalHands,
      overallAccuracy,
      avgEvLoss,
      byArchetype,
    };
  },
});

// ═══════════════════════════════════════════════════════
// RECENT RESULTS (last N hands for quick display)
// ═══════════════════════════════════════════════════════

export const getRecentResults = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) throw new Error("User not found");

    return ctx.db
      .query("trainingResults")
      .withIndex("by_user_date", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(args.limit ?? 10);
  },
});
