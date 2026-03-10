import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";

// ─── List scenarios (optionally filtered) ───
export const list = query({
  args: {
    category: v.optional(v.string()),
    difficulty: v.optional(v.string()),
    builtInOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (args.category) {
      return ctx.db
        .query("scenarios")
        .withIndex("by_category", (q) => q.eq("category", args.category!))
        .collect();
    }
    if (args.difficulty) {
      return ctx.db
        .query("scenarios")
        .withIndex("by_difficulty", (q) => q.eq("difficulty", args.difficulty!))
        .collect();
    }
    if (args.builtInOnly) {
      return ctx.db
        .query("scenarios")
        .withIndex("by_built_in", (q) => q.eq("isBuiltIn", true))
        .collect();
    }
    return ctx.db.query("scenarios").collect();
  },
});

// ─── Get single scenario ───
export const get = query({
  args: { id: v.id("scenarios") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.id);
  },
});

// ─── Create a user scenario ───
export const create = mutation({
  args: {
    title: v.string(),
    category: v.string(),
    difficulty: v.string(),
    heroCards: v.array(v.number()),
    communityCards: v.array(v.number()),
    street: v.string(),
    lesson: v.string(),
    tags: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) throw new Error("User not found");

    return ctx.db.insert("scenarios", {
      ...args,
      isBuiltIn: false,
      createdBy: user._id,
    });
  },
});

// ─── Internal: seed built-in scenarios ───
export const seed = internalMutation({
  args: {
    scenarios: v.array(
      v.object({
        title: v.string(),
        category: v.string(),
        difficulty: v.string(),
        heroCards: v.array(v.number()),
        communityCards: v.array(v.number()),
        street: v.string(),
        lesson: v.string(),
        tags: v.array(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    // Check if already seeded
    const existing = await ctx.db
      .query("scenarios")
      .withIndex("by_built_in", (q) => q.eq("isBuiltIn", true))
      .first();
    if (existing) return;

    for (const scenario of args.scenarios) {
      await ctx.db.insert("scenarios", {
        ...scenario,
        isBuiltIn: true,
      });
    }
  },
});
