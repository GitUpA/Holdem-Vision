/**
 * Opponent Profile CRUD — Convex functions for managing opponent profiles.
 *
 * Profiles use a situation-based behavioral model with 11 standard situations.
 * They can be:
 * - Built-in presets (Nit, Fish, TAG, LAG, GTO) — shared, no userId
 * - User-created custom profiles — owned by a specific user
 * - Derived profiles — inherit from a base profile with overrides
 */
import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { getAllPresets } from "./lib/opponents/presets";

// ─── Queries ───

/**
 * List all profiles available to the current user:
 * built-in presets + their custom profiles.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();

    // Always include presets
    const presets = await ctx.db
      .query("opponentProfiles")
      .withIndex("by_preset", (q) => q.eq("isPreset", true))
      .collect();

    if (!identity) return presets;

    // Add user's custom profiles
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) return presets;

    const custom = await ctx.db
      .query("opponentProfiles")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    return [...presets, ...custom];
  },
});

/**
 * Get a single profile by ID.
 */
export const get = query({
  args: { id: v.id("opponentProfiles") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

// ─── Mutations ───

/**
 * Create a custom opponent profile.
 */
export const create = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    situations: v.string(), // JSON-serialized Partial<Record<SituationKey, BehavioralParams>>
    baseProfileId: v.optional(v.id("opponentProfiles")),
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
    return await ctx.db.insert("opponentProfiles", {
      userId: user._id,
      isPreset: false,
      name: args.name,
      description: args.description,
      situations: args.situations,
      baseProfileId: args.baseProfileId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Update a custom profile. Cannot update presets.
 */
export const update = mutation({
  args: {
    id: v.id("opponentProfiles"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    situations: v.optional(v.string()),
    baseProfileId: v.optional(v.id("opponentProfiles")),
  },
  handler: async (ctx, { id, ...updates }) => {
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("Profile not found");
    if (existing.isPreset) throw new Error("Cannot modify preset profiles");

    // Verify ownership
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user || existing.userId !== user._id) {
      throw new Error("Not your profile");
    }

    // Remove undefined values
    const cleanUpdates: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(updates)) {
      if (val !== undefined) cleanUpdates[k] = val;
    }

    await ctx.db.patch(id, { ...cleanUpdates, updatedAt: Date.now() });
  },
});

/**
 * Delete a custom profile. Cannot delete presets.
 */
export const remove = mutation({
  args: { id: v.id("opponentProfiles") },
  handler: async (ctx, { id }) => {
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("Profile not found");
    if (existing.isPreset) throw new Error("Cannot delete preset profiles");

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user || existing.userId !== user._id) {
      throw new Error("Not your profile");
    }

    await ctx.db.delete(id);
  },
});

/**
 * Clone a preset into a custom profile for the user.
 * Copies all situations (full clone, no inheritance).
 */
export const clonePreset = mutation({
  args: { presetId: v.id("opponentProfiles") },
  handler: async (ctx, { presetId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) throw new Error("User not found");

    const preset = await ctx.db.get(presetId);
    if (!preset) throw new Error("Preset not found");

    const now = Date.now();
    return await ctx.db.insert("opponentProfiles", {
      userId: user._id,
      name: `${preset.name} (Custom)`,
      isPreset: false,
      description: preset.description,
      situations: preset.situations,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// ─── Internal: Seed preset profiles ───

/**
 * Seed the 5 built-in preset profiles. Idempotent.
 */
export const seedPresets = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Check if presets already exist
    const existing = await ctx.db
      .query("opponentProfiles")
      .withIndex("by_preset", (q) => q.eq("isPreset", true))
      .collect();

    if (existing.length > 0) return;

    const presets = getAllPresets();
    const now = Date.now();

    for (const p of presets) {
      await ctx.db.insert("opponentProfiles", {
        userId: undefined,
        name: p.name,
        isPreset: true,
        description: p.description,
        situations: JSON.stringify(p.situations),
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});
