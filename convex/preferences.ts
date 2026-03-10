import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ─── Get user preferences ───
export const get = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) return null;

    return ctx.db
      .query("userPreferences")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
  },
});

// ─── Upsert user preferences ───
export const upsert = mutation({
  args: {
    defaultLenses: v.optional(v.array(v.string())),
    cardStyle: v.optional(v.string()),
    theme: v.optional(v.string()),
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
      .query("userPreferences")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();

    const now = Date.now();

    if (existing) {
      const updates: Record<string, unknown> = { updatedAt: now };
      if (args.defaultLenses !== undefined) updates.defaultLenses = args.defaultLenses;
      if (args.cardStyle !== undefined) updates.cardStyle = args.cardStyle;
      if (args.theme !== undefined) updates.theme = args.theme;
      await ctx.db.patch(existing._id, updates);
      return existing._id;
    }

    return ctx.db.insert("userPreferences", {
      userId: user._id,
      defaultLenses: args.defaultLenses ?? ["raw-equity", "threats", "outs", "draws"],
      cardStyle: args.cardStyle,
      theme: args.theme,
      updatedAt: now,
    });
  },
});
