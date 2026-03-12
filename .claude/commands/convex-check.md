# Convex Check - Catch Common Convex Antipatterns

Review code for Convex-specific mistakes: wasted bandwidth, wrong function types, missing indexes, client-side work that belongs on the server, and architectural violations.

**Trigger:** Run this check when writing or reviewing Convex functions, React components that consume Convex data, or anything in `convex/`.

## Antipattern 1: Client-Side Filtering of Server Data

The #1 waste pattern. Pulling all rows to the client and filtering/sorting in React when the Convex query should do it.

**DON'T:**
```typescript
// Component pulls ALL profiles, filters client-side
const allProfiles = useQuery(api.profiles.list);
const presets = allProfiles?.filter(p => p.isPreset) ?? [];
```

**DO:**
```typescript
// Convex query filters server-side with an index
export const listPresets = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db
      .query("opponentProfiles")
      .withIndex("by_preset", (q) => q.eq("isPreset", true))
      .collect();
  },
});

// Component gets exactly what it needs
const presets = useQuery(api.profiles.listPresets);
```

**When client-side filtering IS okay:**
- The full dataset is already needed elsewhere on the same page
- The dataset is small (low hundreds of items)
- The filter is a UI-only concern (e.g., search text typed by user)

**Ask yourself:** "Am I downloading rows just to throw them away?"

---

## Antipattern 2: `.filter()` Instead of `.withIndex()`

Convex's `.filter()` on a query scans the ENTIRE table. It's a full table scan with extra steps.

**DON'T:**
```typescript
export const byUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return ctx.db
      .query("analysisSessions")
      .filter((q) => q.eq(q.field("userId"), userId))  // Full table scan!
      .collect();
  },
});
```

**DO:**
```typescript
export const byUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return ctx.db
      .query("analysisSessions")
      .withIndex("by_user", (q) => q.eq("userId", userId))  // Index lookup
      .collect();
  },
});
```

**Rule:** If the field you're filtering on is used in more than one query, it needs an index in `schema.ts`.

---

## Antipattern 3: Unbounded `.collect()`

`.collect()` loads every matching document into memory. Fine for small tables, dangerous for anything that grows.

**DON'T:**
```typescript
// Could be 10 rows or 10,000 rows
const allSessions = await ctx.db.query("analysisSessions").collect();
```

**DO:**
```typescript
// Bounded: get the 50 most recent
const recent = await ctx.db
  .query("analysisSessions")
  .withIndex("by_user", (q) => q.eq("userId", userId))
  .order("desc")
  .take(50);

// Or paginate for UI lists
const page = await ctx.db
  .query("analysisSessions")
  .withIndex("by_user", (q) => q.eq("userId", userId))
  .paginate(paginationOpts);
```

**Ask yourself:** "What happens when this table has 10,000 rows?"

---

## Antipattern 4: Calling Actions Directly from Client

Actions lack auto-retry, optimistic updates, and transaction guarantees. The recommended pattern is mutation-then-schedule.

**DON'T:**
```typescript
// Client calls action directly — no retry, no optimistic update
const compute = useAction(api.compute.computeEquity);
const result = await compute({ heroCards, communityCards });
```

**DO (for heavy computation):**
```typescript
// Mutation records intent + schedules the action
export const requestCompute = mutation({
  args: { sessionId: v.id("analysisSessions"), /* ... */ },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sessionId, { status: "computing" });
    await ctx.scheduler.runAfter(0, internal.compute.run, {
      sessionId: args.sessionId,
      ...args,
    });
  },
});

// Action does the heavy work, writes result back via mutation
export const run = internalAction({
  args: { sessionId: v.id("analysisSessions"), /* ... */ },
  handler: async (ctx, args) => {
    const result = monteCarloEquity(/* ... */);
    await ctx.runMutation(internal.compute.saveResult, {
      sessionId: args.sessionId,
      result,
    });
  },
});
```

**When direct `useAction` IS okay:**
- Fire-and-forget calls to external APIs where you don't need the result reactively
- The action is truly standalone (no DB state to update)

---

## Antipattern 5: `Date.now()` in Query Functions

`Date.now()` in a query defeats Convex's caching — the query re-runs on every subscription check because the return value is never stable.

**DON'T:**
```typescript
export const getActive = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();  // Cache-killer!
    const sessions = await ctx.db.query("sessions").collect();
    return sessions.filter(s => s.expiresAt > now);
  },
});
```

**DO:**
```typescript
// Option A: Boolean field updated by scheduled function
export const getActive = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db
      .query("sessions")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();
  },
});

// Option B: Pass time from client, rounded to reduce cache churn
export const getActive = query({
  args: { now: v.number() },
  handler: async (ctx, { now }) => {
    // Client rounds: Math.floor(Date.now() / 60000) * 60000
    const sessions = await ctx.db.query("sessions").collect();
    return sessions.filter(s => s.expiresAt > now);
  },
});
```

---

## Antipattern 6: Fat Convex Functions (Logic in Handlers)

Domain logic inside Convex handlers is untestable without the Convex runtime. This project's architecture: **thin Convex wrappers, pure TS in `convex/lib/`**.

**DON'T:**
```typescript
export const analyze = action({
  args: { heroCards: v.array(v.number()), /* ... */ },
  handler: async (ctx, args) => {
    // 80 lines of equity calculation logic here
    const deck = shuffle([...]);
    let wins = 0;
    for (let i = 0; i < 50000; i++) { /* ... */ }
    return { win: wins / 50000 };
  },
});
```

**DO:**
```typescript
// convex/lib/analysis/monteCarlo.ts — pure TS, tested with Vitest
export function monteCarloEquity(hero: number[], community: number[], opts: MonteCarloOpts) {
  // All logic here, zero Convex imports
}

// convex/compute.ts — thin wrapper
export const computeEquity = action({
  args: { heroCards: v.array(v.number()), /* ... */ },
  handler: async (_ctx, args) => {
    return monteCarloEquity(args.heroCards, args.communityCards, {
      numOpponents: args.numOpponents ?? 1,
      deadCards: args.deadCards ?? [],
      trials: args.trials ?? 50000,
    });
  },
});
```

**Rule:** If it doesn't need `ctx`, it doesn't belong in the handler.

---

## Antipattern 7: Floating Promises

Convex handlers that don't `await` database operations or scheduler calls. The operation may not complete.

**DON'T:**
```typescript
export const save = mutation({
  args: { /* ... */ },
  handler: async (ctx, args) => {
    ctx.db.insert("sessions", { ...args });           // Not awaited!
    ctx.scheduler.runAfter(0, internal.notify, {});    // Not awaited!
    return "saved";
  },
});
```

**DO:**
```typescript
export const save = mutation({
  args: { /* ... */ },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("sessions", { ...args });
    await ctx.scheduler.runAfter(0, internal.notify, { sessionId: id });
    return id;
  },
});
```

**Tip:** Enable the `no-floating-promises` ESLint rule.

---

## Antipattern 8: `api.*` for Scheduled/Internal Calls

Public functions (`api.*`) can be called by anyone. Scheduled tasks and `ctx.runMutation` should use `internal.*`.

**DON'T:**
```typescript
await ctx.scheduler.runAfter(0, api.compute.run, { data });  // Publicly callable!
```

**DO:**
```typescript
await ctx.scheduler.runAfter(0, internal.compute.run, { data });  // Internal only
```

**Rule:** If a function is only called server-to-server, make it `internalQuery`/`internalMutation`/`internalAction`.

---

## Antipattern 9: Sequential `ctx.runQuery`/`ctx.runMutation` in Actions

Each `ctx.runQuery` and `ctx.runMutation` in an action runs in a **separate transaction**. Data can change between calls.

**DON'T:**
```typescript
export const process = internalAction({
  handler: async (ctx) => {
    const user = await ctx.runQuery(internal.users.get, { id });
    // ⚠️ User could be deleted between these two calls!
    await ctx.runMutation(internal.users.update, { id, name: user.name + " (processed)" });
  },
});
```

**DO:**
```typescript
// Batch related reads + writes into a single mutation
export const process = internalMutation({
  handler: async (ctx, { id }) => {
    const user = await ctx.db.get(id);
    if (!user) throw new Error("User not found");
    await ctx.db.patch(id, { name: user.name + " (processed)" });
  },
});
```

**When you must use an action** (e.g., calling external API then writing), accept the transaction boundary and handle the race:
```typescript
const result = await fetchExternalAPI();
await ctx.runMutation(internal.sessions.saveIfStillValid, {
  sessionId,
  result,
});
```

---

## Antipattern 10: `ctx.runAction` for Code Reuse

`ctx.runAction` incurs overhead: new function invocation, resource allocation, parent execution freezes. Use plain TS helpers.

**DON'T:**
```typescript
export const processAll = internalAction({
  handler: async (ctx) => {
    // Each runAction has overhead
    await ctx.runAction(internal.compute.step1, {});
    await ctx.runAction(internal.compute.step2, {});
  },
});
```

**DO:**
```typescript
import { step1 } from "./lib/compute/step1";
import { step2 } from "./lib/compute/step2";

export const processAll = internalAction({
  handler: async (ctx) => {
    const r1 = step1(data);    // Plain function call, no overhead
    const r2 = step2(r1);
  },
});
```

---

## Antipattern 11: Conditional `useQuery` Calls

React hooks can't be called conditionally. Convex provides `"skip"` for this.

**DON'T:**
```typescript
// Violates Rules of Hooks!
const profiles = isReady ? useQuery(api.profiles.list) : undefined;
```

**DO:**
```typescript
const profiles = useQuery(api.profiles.list, isReady ? {} : "skip");
```

---

## Antipattern 12: Index Field Order Mistakes

Index fields must be queried in order. You can't skip to a later field.

**DON'T:**
```typescript
// Schema: .index("by_user_and_status", ["userId", "status", "createdAt"])

// Skips userId — can't range on status without eq on userId first!
.withIndex("by_user_and_status", (q) => q.eq("status", "active"))
```

**DO:**
```typescript
// Step through fields in order
.withIndex("by_user_and_status", (q) =>
  q.eq("userId", userId).eq("status", "active")
)
```

**Rule:** Equality fields first, range field last. You can stop at any field but can't skip.

---

## Quick Decision Tree

When writing a Convex function, ask:

1. **Does it need `ctx.db`?** → query or mutation (not action)
2. **Does it call external APIs?** → action (schedule from mutation)
3. **Does it only read?** → query (deterministic, cached)
4. **Does it write?** → mutation (transactional)
5. **Is it called server-to-server only?** → `internal*` prefix
6. **Can the logic be tested without Convex?** → Extract to `convex/lib/`
7. **Am I filtering on a field?** → Does it have an index?
8. **Am I calling `.collect()`?** → Is the result set bounded?

## Red Flags

If you see these patterns in a PR, investigate:

- `.filter()` on a `ctx.db.query()` call
- `.collect()` without `.withIndex()` or `.take()`
- `useAction` in a component (should usually be `useMutation`)
- `Date.now()` inside a query handler
- `ctx.runAction` for calling same-runtime code
- `api.*` in `ctx.scheduler.runAfter` or `ctx.runMutation`
- Domain logic (>10 lines) directly in a Convex handler
- Missing `await` before `ctx.db.*` or `ctx.scheduler.*`
- `useQuery` wrapped in an `if` block
- Large datasets pulled to client then `.filter()`/`.sort()`/`.reduce()` in React
