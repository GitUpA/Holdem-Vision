# Preflop Situation Registry — Implementation Plan

## Goal

Replace the scattered preflop classification logic (3 independent systems) with a single
registry that serves all consumers: grid pipeline, decision engine, coaching, drill, audit.

## Architecture

### New Module: `convex/lib/preflop/`

```
convex/lib/preflop/
  situationRegistry.ts  — types, registry data, classifier function
  situationRanges.ts    — resolves symbolic range sources → Set<string>
  rangeUtils.ts         — normalize6Max, compressRangeByStack (moved from preflopGrid.ts)
  index.ts              — barrel export
```

### Core Types

```typescript
// ── Situation IDs (the registry keys) ──

export type PreflopSituationId =
  | "rfi"
  | "facing_open"
  | "facing_open_multiway"
  | "facing_3bet"
  | "facing_4bet"
  | "blind_vs_blind"
  | "facing_limpers"
  | "bb_vs_limpers"
  | "bb_vs_sb_complete"
  | "bb_uncontested";
// NOTE: "squeeze" is NOT a separate ID. It's a sub-case of facing_open_multiway.
// The registry entry for facing_open_multiway includes squeeze coaching metadata.
// Drill mode filters for squeeze by checking numCallers > 0 && hero in blinds.

// ── Situation Context (ID + game state details) ──

export interface PreflopSituationContext {
  id: PreflopSituationId;
  heroPosition: Position;
  tableSize: number;
  openerPosition: Position | null;
  numCallers: number;
  numLimpers: number;
  firstLimperPosition: Position | null;
  threeBettorPosition: Position | null;
  raiseCount: number;
  isSqueezeOpportunity: boolean;  // true when raise + callers + hero can 3-bet
}
```

### Registry Entry

Each entry is a static data object — no behavior, no range imports.

```typescript
export interface PreflopSituationEntry {
  id: PreflopSituationId;
  displayName: string;
  description: string;

  // Engine
  engineKey: SituationKey;

  // Ranges (symbolic — resolved by situationRanges.ts)
  opponentRangeSource: RangeSource;
  heroRangeSource: RangeSource;

  // Equity
  opponentCountRule: OpponentCountRule;

  // Pot arithmetic
  heroPostedRule: "none" | "sb" | "bb" | "from_position";

  // Coaching metadata
  callMeaning: string;
  raiseMeaning: string;
  keyPrinciple: string;

  // Coaching scene template (generates narrative context)
  // Uses {position}, {openerPosition}, {numCallers}, {numLimpers} interpolation
  sceneTemplate: string;

  // Drill
  drillPriority: number;
  requiresDecision: boolean;
}
```

Supporting types:

```typescript
export type RangeSource =
  | { type: "none" }
  | { type: "rfi_by_position" }
  | { type: "bb_defense_by_opener" }
  | { type: "cold_call_plus_3bet" }
  | { type: "bvb_defense" }
  | { type: "four_bet" }
  | { type: "four_bet_call_plus_value" }
  | { type: "limper_by_profile" }
  | { type: "iso_raise_by_position" }
  | { type: "bb_raise_vs_limpers" }
  | { type: "sb_complete_range" }
  | { type: "bb_raise_vs_sb_complete" };

export type OpponentCountRule =
  | { type: "players_behind" }
  | { type: "opener_plus_callers_plus_behind" }
  | { type: "aggressor_plus_callers" }
  | { type: "fixed"; count: number }
  | { type: "limpers_plus_behind" }
  | { type: "limpers_only" };
```

### The Registry (10 entries)

```typescript
export const PREFLOP_SITUATIONS: Record<PreflopSituationId, PreflopSituationEntry> = {
  rfi: {
    id: "rfi",
    displayName: "Raise First In",
    description: "No one has entered the pot. Open-raise or fold.",
    engineKey: "preflop.open",
    opponentRangeSource: { type: "none" },
    heroRangeSource: { type: "rfi_by_position" },
    opponentCountRule: { type: "players_behind" },
    heroPostedRule: "from_position",
    callMeaning: "limp (sub-optimal)",
    raiseMeaning: "open-raise to establish initiative",
    keyPrinciple: "Raise or fold. Position determines width.",
    sceneTemplate: "No one has entered the pot. You're deciding whether to open.",
    drillPriority: 1,
    requiresDecision: true,
  },
  facing_open: {
    id: "facing_open",
    displayName: "Facing Open Raise",
    description: "A player has raised. 3-bet, call, or fold.",
    engineKey: "preflop.facing_raise",
    opponentRangeSource: { type: "rfi_by_position" },
    heroRangeSource: { type: "cold_call_plus_3bet" },
    opponentCountRule: { type: "opener_plus_callers_plus_behind" },
    heroPostedRule: "from_position",
    callMeaning: "cold-call (flat)",
    raiseMeaning: "3-bet for value or as a bluff",
    keyPrinciple: "Position and range advantage determine action.",
    sceneTemplate: "{openerPosition} opened.",  // sizing comes from context, not template
    drillPriority: 2,
    requiresDecision: true,
  },
  facing_open_multiway: {
    id: "facing_open_multiway",
    displayName: "Facing Raise + Callers",
    description: "A player raised and others called. Overcall, squeeze, or fold.",
    engineKey: "preflop.facing_raise",
    opponentRangeSource: { type: "rfi_by_position" },
    heroRangeSource: { type: "cold_call_plus_3bet" },
    opponentCountRule: { type: "opener_plus_callers_plus_behind" },
    heroPostedRule: "from_position",
    callMeaning: "overcall (flat into multiway pot)",
    raiseMeaning: "squeeze — 3-bet into dead money from callers",
    keyPrinciple: "Tighter ranges multiway. Squeeze with polarized hands when callers fold ~70%.",
    sceneTemplate: "{openerPosition} raised, {numCallers} caller(s). Dead money in the pot.",
    drillPriority: 5,
    requiresDecision: true,
  },
  facing_3bet: {
    id: "facing_3bet",
    displayName: "Facing 3-Bet",
    description: "You opened and got re-raised. 4-bet, call, or fold.",
    engineKey: "preflop.facing_3bet",
    opponentRangeSource: { type: "none" },
    heroRangeSource: { type: "four_bet_call_plus_value" },
    opponentCountRule: { type: "aggressor_plus_callers" },
    heroPostedRule: "none",
    callMeaning: "call the 3-bet in position",
    raiseMeaning: "4-bet for value or as a bluff",
    keyPrinciple: "Ranges narrow fast. Only continue with strong holdings.",
    sceneTemplate: "You opened, {threeBettorPosition} 3-bet.",
    drillPriority: 4,
    requiresDecision: true,
  },
  facing_4bet: {
    id: "facing_4bet",
    displayName: "Facing 4-Bet",
    description: "The pot has been raised 3+ times. Premium decisions only.",
    engineKey: "preflop.facing_4bet",
    opponentRangeSource: { type: "four_bet" },
    heroRangeSource: { type: "four_bet_call_plus_value" },
    opponentCountRule: { type: "aggressor_plus_callers" },
    heroPostedRule: "none",
    callMeaning: "call with a hand too strong to fold but not strong enough to 5-bet",
    raiseMeaning: "5-bet/jam — committing your stack",
    keyPrinciple: "Only AA/KK and select bluffs. Stacks are on the line.",
    sceneTemplate: "4-bet pot. Stacks are on the line.",
    drillPriority: 8,
    requiresDecision: true,
  },
  blind_vs_blind: {
    id: "blind_vs_blind",
    displayName: "Blind vs Blind",
    description: "Folded to the blinds. Wider ranges, unique dynamic.",
    engineKey: "preflop.facing_raise",  // BB uses facing_raise params (defending vs SB open)
    // NOTE: SB opening uses preflop.open via rfi classification. This entry is for
    // BB's perspective. Current engine already maps BvB-BB to preflop.facing_raise.
    opponentRangeSource: { type: "rfi_by_position" },
    heroRangeSource: { type: "bvb_defense" },
    opponentCountRule: { type: "fixed", count: 1 },
    heroPostedRule: "from_position",
    callMeaning: "defend the blind",
    raiseMeaning: "3-bet or open-raise (SB)",
    keyPrinciple: "Both ranges are wide. Aggression is rewarded.",
    sceneTemplate: "Folded to the blinds.",
    drillPriority: 3,
    requiresDecision: true,
  },
  facing_limpers: {
    id: "facing_limpers",
    displayName: "Facing Limper(s)",
    description: "One or more players limped. Iso-raise, over-limp, or fold.",
    engineKey: "preflop.facing_limpers",
    opponentRangeSource: { type: "limper_by_profile" },
    heroRangeSource: { type: "iso_raise_by_position" },
    opponentCountRule: { type: "limpers_plus_behind" },
    heroPostedRule: "from_position",
    callMeaning: "over-limp (see a cheap flop)",
    raiseMeaning: "iso-raise to isolate the weak limper",
    keyPrinciple: "Limpers have capped ranges. Raise to punish, or see a cheap flop with speculative hands.",
    sceneTemplate: "{numLimpers} limper(s) ahead. Their range is capped — no premiums.",
    drillPriority: 6,
    requiresDecision: true,
  },
  bb_vs_limpers: {
    id: "bb_vs_limpers",
    displayName: "BB vs Limper(s)",
    description: "Limpers came to the BB. Raise for value or check for a free flop.",
    engineKey: "preflop.bb_vs_limpers",
    opponentRangeSource: { type: "limper_by_profile" },
    heroRangeSource: { type: "bb_raise_vs_limpers" },
    opponentCountRule: { type: "limpers_only" },
    heroPostedRule: "bb",
    callMeaning: "check (free flop — never fold)",
    raiseMeaning: "raise for value (you are OOP the whole hand)",
    keyPrinciple: "Free flop is fine. Raise for value, not isolation — you are out of position.",
    sceneTemplate: "{numLimpers} limper(s) to you in the BB. You can check for free or raise.",
    drillPriority: 6,
    requiresDecision: true,
  },
  bb_vs_sb_complete: {
    id: "bb_vs_sb_complete",
    displayName: "BB vs SB Complete",
    description: "SB limped in. Their range is wide and capped — raise aggressively.",
    engineKey: "preflop.open",  // BB is deciding to raise, similar to open
    opponentRangeSource: { type: "sb_complete_range" },
    heroRangeSource: { type: "bb_raise_vs_sb_complete" },
    opponentCountRule: { type: "fixed", count: 1 },
    heroPostedRule: "bb",
    callMeaning: "check (free flop)",
    raiseMeaning: "raise — SB's range is capped, you have range advantage",
    keyPrinciple: "SB completed = weak range. Raise wide for value.",
    sceneTemplate: "SB completed. Their range is wide and capped — no premiums.",
    drillPriority: 7,
    requiresDecision: true,
  },
  bb_uncontested: {
    id: "bb_uncontested",
    displayName: "BB Uncontested",
    description: "Everyone folded to you in the big blind. You win.",
    engineKey: "preflop.open",  // never actually used — requiresDecision is false
    opponentRangeSource: { type: "none" },
    heroRangeSource: { type: "none" },
    opponentCountRule: { type: "fixed", count: 0 },
    heroPostedRule: "bb",
    callMeaning: "n/a",
    raiseMeaning: "n/a",
    keyPrinciple: "Free money. No decision required.",
    sceneTemplate: "Everyone folded. You win the blinds.",
    drillPriority: 99,
    requiresDecision: false,
  },
};
```

### Classifier: Pure Function

One classifier, two entry points:

```typescript
// Entry point 1: From explicit params (grid pipeline, tests)
export function classifySituation(params: {
  heroPosition: Position;
  tableSize?: number;
  openerPosition: Position | null;
  numCallers: number;
  numLimpers: number;
  firstLimperPosition: Position | null;
  facing3Bet: boolean;
  threeBettorPosition: Position | null;
  facing4Bet: boolean;
  isSBComplete?: boolean;
}): PreflopSituationContext;

// Entry point 2: From game state (engine, coaching, audit)
export function classifySituationFromState(
  state: GameState,
  heroSeatIndex: number,
): PreflopSituationContext;
```

Classification priority (first match wins):

```
 1. facing4Bet                                         → facing_4bet
 2. facing3Bet && threeBettorPosition                   → facing_3bet
 3. !opener && limpers === 0 && hero === bb
    && everyoneElseFolded                               → bb_uncontested
 4. !opener && limpers === 0                            → rfi
 5. isSBComplete && hero === bb && limpers === 1        → bb_vs_sb_complete
 6. !opener && limpers > 0 && hero === bb               → bb_vs_limpers
 7. !opener && limpers > 0                              → facing_limpers
 8. opener ∈ {sb,bb} && hero ∈ {sb,bb} && callers === 0 → blind_vs_blind
 9. opener && callers > 0                               → facing_open_multiway
                                                          (set isSqueezeOpportunity = true)
10. opener                                              → facing_open
```

NOTE on rule 3: `everyoneElseFolded` is derived, not a parameter. For the explicit-params
entry point, add an optional `everyoneElseFolded?: boolean` param (default false).
For `classifySituationFromState`, derive it from action history (all non-hero,
non-blind actions are folds). This situation is rare in practice — the state machine
usually auto-awards the pot before BB even acts.

NOTE on rule 5: `bb_vs_sb_complete` MUST precede `bb_vs_limpers` (rule 6), otherwise SB
completing would classify as "BB vs 1 limper" which is semantically wrong — BvB has
distinct ranges and dynamics.

#### Limp Detection in `classifySituationFromState`

A limp is a preflop `call` action that occurs **before any raise**. Note: blind postings
are NOT in `actionHistory` — they're applied directly in `initializeHand()`. So all
preflop `call` actions before the first `raise` are limps.

```typescript
const preflopActions = state.actionHistory.filter(a => a.street === "preflop");
// Find the first raise in preflop actions
const firstRaiseIdx = preflopActions.findIndex(a => a.actionType === "raise");
// Limps: calls before any raise
const limpers = preflopActions.filter(
  (a, i) => a.actionType === "call" && (firstRaiseIdx === -1 || i < firstRaiseIdx)
);
const numLimpers = limpers.length;
// SB complete: SB limped (called, not raised) and no one raised
const isSBComplete = numLimpers > 0
  && limpers.some(a => state.players[a.seatIndex].position === "sb")
  && firstRaiseIdx === -1;
// Callers of the raise (post-raise calls, NOT limps)
const numCallers = firstRaiseIdx === -1 ? 0
  : preflopActions.filter(
      (a, i) => a.actionType === "call" && i > firstRaiseIdx
    ).length;
```

**Important**: `numCallers` must exclude limps. The current `workspace-shell.tsx`
counts ALL preflop calls as callers — this must be fixed in Step 2.6 to separate
limps from cold-calls.

### Range Resolver: `situationRanges.ts`

```typescript
export function resolveOpponentRange(
  ctx: PreflopSituationContext,
  stackDepthBB?: number,
  openerSizingBB?: number,
): Set<string> | null;

export function resolveHeroRange(
  ctx: PreflopSituationContext,
  stackDepthBB?: number,
): Set<string>;

export function resolveOpponentCount(
  entry: PreflopSituationEntry,
  ctx: PreflopSituationContext,
): number;
// NOTE: tableSize is available via ctx.tableSize (added to PreflopSituationContext)
```

Each function reads `entry.opponentRangeSource` / `entry.heroRangeSource` / `entry.opponentCountRule` and dispatches to the appropriate range table in `preflopRanges.ts`. Stack compression and sizing adjustment apply the same way they do today.

### Shared Utilities: `rangeUtils.ts`

Moved from `preflopGrid.ts` to avoid circular dependencies:

```typescript
// convex/lib/preflop/rangeUtils.ts
export function normalize6Max(pos: string): string;
export function compressRangeByStack(range: Set<string>, stackDepthBB: number): Set<string>;
```

`preflopGrid.ts` re-exports these for backward compatibility:
```typescript
export { normalize6Max, compressRangeByStack } from "../preflop/rangeUtils";
```

This preserves all existing imports (`hand-grid.tsx:16`, `preflopGrid.test.ts:15-16`) while
eliminating circular dependency risk.

## Phase 1: Add Registry (additive, no breakage)

### Step 1.1: Move shared utils to `convex/lib/preflop/rangeUtils.ts`
- Move `normalize6Max` and `compressRangeByStack` from `preflopGrid.ts`
- Add re-exports in `preflopGrid.ts` so existing imports don't break
- Run tests to verify

### Step 1.2: Create `convex/lib/preflop/situationRegistry.ts`
- Types: `PreflopSituationId`, `PreflopSituationContext`, `PreflopSituationEntry`, `RangeSource`, `OpponentCountRule`
- Data: `PREFLOP_SITUATIONS` registry (10 entries)
- Functions: `classifySituation()`, `classifySituationFromState()`
- Exports everything

### Step 1.3: Create `convex/lib/preflop/situationRanges.ts`
- Functions: `resolveOpponentRange()`, `resolveHeroRange()`, `resolveOpponentCount()`
- Imports range data from `convex/lib/gto/tables/preflopRanges.ts`
- Imports `normalize6Max`, `compressRangeByStack` from `./rangeUtils.ts`

### Step 1.4: Create `convex/lib/preflop/index.ts`
- Barrel re-exports from all three modules

### Step 1.5: Expand `SituationKey` + profiles + modifiers (ATOMIC — single commit)
This step MUST be atomic because `resolveProfile()` throws on missing keys.

All in one commit:
- `convex/lib/types/opponents.ts` — add 3 new keys: `preflop.facing_limpers`, `preflop.bb_vs_limpers`, `preflop.sb_complete`
  - NOTE: NO `preflop.squeeze` — squeeze is a sub-case of facing_open_multiway, not a separate engine key
- `ALL_SITUATION_KEYS` array — add the 3 new keys
- `convex/lib/opponents/presets.ts` — add `BehavioralParams` for each new key in ALL 5 profiles
  - `preflop.facing_limpers` copies from `preflop.open` (similar raise-or-fold decision)
  - `preflop.bb_vs_limpers` copies from `preflop.open` (raise-or-check decision)
  - `preflop.sb_complete` copies from `preflop.open`
- `convex/lib/opponents/engines/modifierProfiles.ts` — add `SituationModifier` for each new key in ALL 4 non-GTO modifier maps (NIT_MODIFIERS, FISH_MODIFIERS, TAG_MODIFIERS, LAG_MODIFIERS)
  - Copy from closest existing key modifier
  - GTO modifiers auto-adapt (loops `ALL_SITUATION_KEYS`)
- `convex/lib/opponents/behaviorInference.ts` — add 3 new keys to the `createProfileFromActions()` literal
  - This function constructs a `Record<SituationKey, BehavioralParams>` with all keys listed as literals
  - Missing keys here = TSC compilation error
- `convex/lib/opponents/engines/types.ts` — add labels to `SITUATION_LABELS` map
  - Separate from `src/lib/format.ts` — this map is used by engine narratives
- `convex/lib/opponents/engines/narrativeEngine.ts` — `buildFallbackModifierMap` uses hardcoded keys
  - Replace hardcoded key list with `ALL_SITUATION_KEYS` loop (like `buildGtoModifiers` does)
- `src/lib/format.ts` — add labels to `SITUATION_LABELS` for new keys
- `tests/opponents/engines/unifiedFrequencies.test.ts` — `makeResolvedParams()` helper has hardcoded 11 keys
  - Add 3 new keys to the helper

### Step 1.6: Write tests
- Test classifier produces correct `PreflopSituationId` for every scenario
- Test backward compat: existing scenarios produce identical results to old classifier
- Test range resolver returns same ranges as current `getOpponentRange()` / `getHeroContinueRange()`
- Test `resolveOpponentCount()` matches current logic in `computePreflopHandGrid()`
- Test limp detection: preflop calls before any raise = limps, after raise = cold calls
- Test SB complete detection: SB calls BB with no raise

## Phase 2: Wire Consumers (one at a time, tests after each)

### Step 2.1: Grid pipeline (`preflopGrid.ts`)
- Add to `PreflopGridParams`: `numLimpers?: number`, `firstLimperPosition?: Position | null`, `facing4Bet?: boolean`
- `computePreflopHandGrid()` calls `classifySituation()` internally
- Replace `getOpponentRange()` body → delegate to `resolveOpponentRange()`
- Replace `getHeroContinueRange()` body → delegate to `resolveHeroRange()`
- Replace opponent count derivation → delegate to `resolveOpponentCount()`
- `PreflopGridResult.situation` keeps `.id` field (same as old `.type` — see migration note)

**Migration for `.situation.type` → `.situation.id`:**
Keep `PreflopSituationContext` using `.id`. Add a getter or keep both:
```typescript
// PreflopSituationContext has .id
// For backward compat, PreflopGridResult can use a type that has both:
export interface PreflopGridResult {
  situation: PreflopSituationContext & { type: PreflopSituationId }; // alias
  // ...
}
```
Or simpler: just search-and-replace `.situation.type` → `.situation.id` in the ~20 test sites.
The second approach is cleaner — no backward compat hacks.

### Step 2.2: Engine (`autoPlay.ts`)
- `classifyPreflop()` calls `classifySituationFromState()` and returns `PREFLOP_SITUATIONS[ctx.id].engineKey`
- Delete the old raise-counting logic

### Step 2.3: Coaching (`handCommentator.ts`)
- `buildPreflopScene()` receives `PreflopSituationContext` (computed once upstream in coaching lens)
- Uses `registry[ctx.id].sceneTemplate` for scene-setting text, interpolating position/sizing/limper data from context
- Uses `registry[ctx.id].callMeaning`, `.raiseMeaning`, `.keyPrinciple` for action descriptions
- Handles limps: the `sceneTemplate` for `facing_limpers` and `bb_vs_limpers` includes limp-specific narrative

### Step 2.4: Align `preflopClassification.ts`
- `classifyPreflopHand()` currently dispatches on archetype IDs (`rfi_opening`, `bb_defense_vs_rfi`, etc.)
- Add a mapping: archetype ID → `PreflopSituationId` so both systems stay aligned
- Add cases for new situations (`facing_limpers`, `bb_vs_limpers`, `bb_vs_sb_complete`)
- `classificationToCoachingText()` remains the primary coaching text generator for preflop
  - Registry's `keyPrinciple` supplements it, doesn't replace it
  - Long term: `classificationToCoachingText` may read from registry, but that's a future refactor

### Step 2.5: Hand audit
- `HandEvent` stores `PreflopSituationId` string alongside existing fields
- No serialization changes (it's a string)

### Step 2.6: Wire `numLimpers` from UI and fix `numCallers`
- `workspace-shell.tsx` derives `numLimpers` AND fixes `numCallers` from `preflopActions`:
  ```typescript
  const firstRaiseIdx = preflopActions.findIndex(a => a.actionType === "raise");
  const numLimpers = preflopActions.filter(
    (a, i) => a.actionType === "call" && (firstRaiseIdx === -1 || i < firstRaiseIdx)
  ).length;
  // FIX: numCallers should only count post-raise calls, NOT limps
  const numCallers = firstRaiseIdx === -1 ? 0
    : preflopActions.filter(
        (a, i) => a.actionType === "call" && i > firstRaiseIdx
      ).length;
  ```
- Pass `numLimpers` to `HandGrid` props
- `HandGridProps` gains `numLimpers?: number`
- **Critical**: the existing `numCallers` derivation must change to exclude limps.
  Without this fix, a hand with 2 limpers + 1 cold caller = `numCallers: 3` instead of 1.

## Phase 3: Cleanup

### Step 3.1: Remove old classification
- Delete `classifyPreflopSituation()` from `preflopGrid.ts`
- Delete old `PreflopSituation` union type
- Delete `classifyPreflop()` raise-counting logic from `autoPlay.ts`
- Update ~20 test sites: `.situation.type` → `.situation.id`

### Step 3.2: Consolidate range access
- Delete `getOpponentRange()` and `getHeroContinueRange()` switch bodies from `preflopGrid.ts`
- All range access goes through `resolveOpponentRange()` / `resolveHeroRange()`

## Phase 4: Add New Situations (after registry is stable)

### Step 4.1: Add range data in `preflopRanges.ts`
New exports:
- `GTO_ISO_RAISE_RANGES` — iso-raise ranges by position, keyed by limper count
- `GTO_BB_RAISE_VS_LIMPERS` — BB raise range by limper count (1, 2, 3+)
- `GTO_BB_VS_SB_COMPLETE` — BB raise range when SB completes
- `GTO_SB_COMPLETE_RANGE` — what SB's limping range looks like

### Step 4.2: Add range source cases in `situationRanges.ts`
- One `case` per new `RangeSource.type` in the switch statement

### Step 4.3: Tests for new situations
- Classifier tests for each new scenario
- Range resolver tests comparing against expected ranges
- Integration tests in `preflopGrid.test.ts` for limper scenarios

## Resolved Issues from Validation

### Round 1 (3 validators: grid, engine, coaching)

| # | Issue | Resolution |
|---|---|---|
| 1 | `modifierProfiles.ts` — 4 maps need new keys | Step 1.5 is ATOMIC: types + presets + modifiers in one commit |
| 2 | `resolveProfile()` throws on missing keys | Step 1.5 atomic commit. Stored user profiles inherit from presets — safe if base has keys. |
| 3 | `numLimpers` derivation needs limp detection logic | Explicit algorithm in classifier section and Step 2.6 |
| 4 | `preflop.squeeze` as dead SituationKey | REMOVED. `isSqueezeOpportunity` flag in context instead. |
| 5 | `buildPreflopScene` needs full context, not just labels | Step 2.3: receives `PreflopSituationContext`. Uses `sceneTemplate`. |
| 6 | `preflopClassification.ts` uses archetype IDs | Step 2.4: add archetype→situation mapping. |
| 7 | `.situation.type` → `.situation.id` breaks tests | Step 3.1: search-and-replace in ~20 test sites. |
| 8 | Moving `normalize6Max` breaks imports | Step 1.1: move first, add re-exports. |
| 9 | `classificationToCoachingText()` escape hatch | Step 2.4: remains primary. Registry supplements. |
| 10 | `facing4Bet` not in PreflopGridParams | Step 2.1: add `facing4Bet?: boolean` to `PreflopGridParams` |
| 11 | `format.ts` missing labels | Step 1.5: add labels in same atomic commit |

### Round 2 (final validator)

| # | Issue | Resolution |
|---|---|---|
| 12 | `bb_vs_sb_complete` unreachable — rule 7 after rule 5 | FIXED: moved to rule 5, before `bb_vs_limpers` (rule 6) |
| 13 | `allFolded` param missing from `classifySituation` | FIXED: add optional `everyoneElseFolded?: boolean` param. Derived from state in `classifySituationFromState`. |
| 14 | `behaviorInference.ts` hardcodes 11 keys — TSC error | FIXED: added to Step 1.5 atomic commit |
| 15 | Second `SITUATION_LABELS` in `engines/types.ts` | FIXED: added to Step 1.5 atomic commit |
| 16 | Limp detection references nonexistent `source` field | FIXED: removed `a.source !== "system"` — blinds aren't in actionHistory |
| 17 | `sceneTemplate` references `{sizingBB}` not in context | FIXED: removed from template. Sizing passed separately to interpolation. |
| 18 | `numCallers` in workspace-shell counts limps as calls | FIXED: Step 2.6 now fixes numCallers to exclude limps |

### Round 3 (final validator)

| # | Issue | Resolution |
|---|---|---|
| 19 | `narrativeEngine.ts` hardcodes keys in `buildFallbackModifierMap` | FIXED: added to Step 1.5. Replace with `ALL_SITUATION_KEYS` loop. |
| 20 | `blind_vs_blind` engineKey was `preflop.open`, should be `preflop.facing_raise` | FIXED: BB perspective uses `preflop.facing_raise` (matches current engine). |
| 21 | Plan says `createProfileFromActions()`, actual name is `buildInferredProfile()` | NOTED: function found by type signature, name is informational. |
| 22 | `unifiedFrequencies.test.ts` helper has hardcoded 11 keys | FIXED: added to Step 1.5 files list. |

## What Doesn't Change

- `preflopRanges.ts` range data format (Set<string> maps) — stable
- `preflopEquityTable.ts` equity tables (1-9 opponents) — stable
- Postflop situation keys — untouched
- Test count should only grow (additive)

## Success Criteria

1. All 1431 existing tests pass after Phase 2
2. New classifier produces identical results to old classifier for all existing scenarios
3. Adding a new situation requires exactly: 1 registry entry + 1 range table + 1 range resolver case
4. Grid, engine, coaching, drill all derive situation from the same `PreflopSituationContext`
5. Zero duplicated classification logic across consumers
