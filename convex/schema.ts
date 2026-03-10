import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ─── Users (synced from Clerk) ───
  users: defineTable({
    clerkId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_clerk_id", ["clerkId"]),

  // ─── Analysis Sessions (saved vision workspace states) ───
  analysisSessions: defineTable({
    userId: v.id("users"),
    name: v.string(),
    heroCards: v.array(v.number()),
    communityCards: v.array(v.number()),
    deadCards: v.array(v.number()),
    street: v.string(),
    opponents: v.array(
      v.object({
        label: v.string(),
        profileId: v.optional(v.id("opponentProfiles")),
        seatIndex: v.optional(v.number()),
        position: v.optional(v.string()),
        actions: v.array(
          v.object({
            street: v.string(),
            actionType: v.string(),
            amount: v.optional(v.number()),
          }),
        ),
      }),
    ),
    numPlayers: v.optional(v.number()),
    heroSeatIndex: v.optional(v.number()),
    dealerSeatIndex: v.optional(v.number()),
    activeLenses: v.array(v.string()),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  // ─── Opponent Profiles (situation-based behavioral model) ───
  opponentProfiles: defineTable({
    userId: v.optional(v.id("users")),
    name: v.string(),
    isPreset: v.boolean(),
    description: v.string(),
    /** Optional base profile for inheritance ("based on TAG but more aggressive"). */
    baseProfileId: v.optional(v.id("opponentProfiles")),
    /** JSON-serialized Partial<Record<SituationKey, BehavioralParams>>. */
    situations: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_preset", ["isPreset"]),

  // ─── User Preferences ───
  userPreferences: defineTable({
    userId: v.id("users"),
    defaultLenses: v.array(v.string()),
    cardStyle: v.optional(v.string()),
    theme: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  // ─── Scenario Library (classic spots + user-created) ───
  scenarios: defineTable({
    title: v.string(),
    category: v.string(),
    difficulty: v.string(),
    heroCards: v.array(v.number()),
    communityCards: v.array(v.number()),
    street: v.string(),
    lesson: v.string(),
    tags: v.array(v.string()),
    isBuiltIn: v.boolean(),
    createdBy: v.optional(v.id("users")),
  })
    .index("by_category", ["category"])
    .index("by_difficulty", ["difficulty"])
    .index("by_built_in", ["isBuiltIn"]),
});
