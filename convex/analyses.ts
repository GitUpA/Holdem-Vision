import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ─── Save a vision workspace state ───
export const save = mutation({
  args: {
    name: v.string(),
    heroCards: v.array(v.number()),
    communityCards: v.array(v.number()),
    deadCards: v.array(v.number()),
    street: v.string(),
    opponents: v.array(
      v.object({
        label: v.string(),
        profileId: v.optional(v.id("opponentProfiles")),
        actions: v.array(
          v.object({
            street: v.string(),
            actionType: v.string(),
            amount: v.optional(v.number()),
          }),
        ),
      }),
    ),
    activeLenses: v.array(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) throw new Error("User not found");

    const now = Date.now();
    return ctx.db.insert("analysisSessions", {
      userId: user._id,
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// ─── Update an existing session ───
export const update = mutation({
  args: {
    id: v.id("analysisSessions"),
    name: v.optional(v.string()),
    heroCards: v.optional(v.array(v.number())),
    communityCards: v.optional(v.array(v.number())),
    deadCards: v.optional(v.array(v.number())),
    street: v.optional(v.string()),
    activeLenses: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const session = await ctx.db.get(args.id);
    if (!session) throw new Error("Session not found");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user || session.userId !== user._id) throw new Error("Not authorized");

    const { id, ...updates } = args;
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined),
    );

    await ctx.db.patch(id, { ...filtered, updatedAt: Date.now() });
  },
});

// ─── Delete a session ───
export const remove = mutation({
  args: { id: v.id("analysisSessions") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const session = await ctx.db.get(args.id);
    if (!session) throw new Error("Session not found");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user || session.userId !== user._id) throw new Error("Not authorized");

    await ctx.db.delete(args.id);
  },
});

// ─── List user's sessions ───
export const list = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) return [];

    return ctx.db
      .query("analysisSessions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
  },
});

// ─── Get a single session ───
export const get = query({
  args: { id: v.id("analysisSessions") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.id);
  },
});
