import { mutation, query } from "./_generated/server";

/**
 * Sync user from Clerk on sign-in.
 * Called client-side after Clerk auth is established.
 * Upserts: creates if new, updates if existing.
 */
export const syncUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const clerkId = identity.subject;
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        email: identity.email ?? existing.email,
        name: identity.name ?? existing.name,
        imageUrl: identity.pictureUrl ?? existing.imageUrl,
      });
      return existing._id;
    }

    return await ctx.db.insert("users", {
      clerkId,
      email: identity.email ?? "unknown",
      name: identity.name,
      imageUrl: identity.pictureUrl,
      createdAt: Date.now(),
    });
  },
});

/**
 * Get the current authenticated user from the users table.
 */
export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    return await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
  },
});
