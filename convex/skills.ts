import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { updateSkillProgress, computeTrainingStats } from "./lib/skills/skillAssessment";
import { getNextSkills, type SkillId, type SkillProgress } from "./lib/skills/skillTree";

function parseProgress(json: string): Record<string, SkillProgress> {
  try { return JSON.parse(json); } catch { return {}; }
}

// ═══════════════════════════════════════════════════════
// GET PROGRESS
// ═══════════════════════════════════════════════════════

export const getProgress = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) throw new Error("User not found");

    const doc = await ctx.db
      .query("skillProgress")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();

    if (!doc) {
      return {
        progress: {} as Record<string, SkillProgress>,
        totalHands: 0,
        totalSessions: 0,
        stats: computeTrainingStats({}),
      };
    }

    const progress = parseProgress(doc.progress);
    return {
      progress,
      totalHands: doc.totalHands,
      totalSessions: doc.totalSessions,
      stats: computeTrainingStats(progress),
    };
  },
});

// ═══════════════════════════════════════════════════════
// UPDATE AFTER DRILL
// ═══════════════════════════════════════════════════════

export const updateAfterDrill = mutation({
  args: {
    results: v.array(
      v.object({
        archetypeId: v.string(),
        verdict: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) throw new Error("User not found");

    const existing = await ctx.db
      .query("skillProgress")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();

    const currentProgress = existing ? parseProgress(existing.progress) : {};
    const totalHands = (existing?.totalHands ?? 0) + args.results.length;
    const totalSessions = (existing?.totalSessions ?? 0) + 1;

    const updated = updateSkillProgress(
      currentProgress,
      args.results.map((r) => ({
        archetypeId: r.archetypeId,
        verdict: r.verdict as "optimal" | "acceptable" | "mistake" | "blunder",
      })),
    );

    const doc = {
      userId: user._id,
      progress: JSON.stringify(updated),
      totalHands,
      totalSessions,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, doc);
    } else {
      await ctx.db.insert("skillProgress", doc);
    }

    return { totalHands, totalSessions };
  },
});

// ═══════════════════════════════════════════════════════
// RECOMMENDED SKILLS
// ═══════════════════════════════════════════════════════

export const getRecommendedSkills = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) throw new Error("User not found");

    const doc = await ctx.db
      .query("skillProgress")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();

    const progress = doc ? parseProgress(doc.progress) : {};
    const progressMap = new Map(
      Object.entries(progress).map(([k, v]) => [k as SkillId, v]),
    );

    return getNextSkills(progressMap, 5);
  },
});
