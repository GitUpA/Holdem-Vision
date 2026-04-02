# Layer 3 Cleanup — Unify Preflop Classification

## Problem

Three parallel classification taxonomies for preflop situations:

| System | Type | Values | Classifier | Consumers |
|---|---|---|---|---|
| Registry | `PreflopSituationId` | 10 IDs | `classifySituation()` | Grid pipeline, range resolver |
| Engine | `SituationKey` | 14 keys (7 preflop) | `classifyPreflop()` in autoPlay.ts | Engine decisions, profiles, modifiers |
| Archetype | `PreflopArchetypeId` | 5 IDs | `classifyArchetype()` in archetypeClassifier.ts | preflopClassification.ts → coaching text |

Each has its own classifier that independently analyzes game state. They produce the
same answers today but have no formal contract. Adding a situation means updating all three.

## Goal

**One classifier, one taxonomy, consumed by all.**

The registry's `PreflopSituationId` becomes the canonical preflop classification.
The engine and archetype systems derive their keys from it — not independently.

## Current Data Flow (scattered)

```
GameState ──→ autoPlay.classifyPreflop()      ──→ SituationKey ──→ engine
GameState ──→ archetypeClassifier.classify()   ──→ archetypeId  ──→ preflopClassification ──→ coaching
Params    ──→ situationRegistry.classifySituation() ──→ SituationId ──→ ranges ──→ grid
```

## Target Data Flow (unified)

```
GameState ──→ classifySituationFromState()  ──→ PreflopSituationContext
                                                    │
                                                    ├──→ .id          → grid pipeline
                                                    ├──→ .engineKey   → engine (via registry lookup)
                                                    └──→ .archetypeId → coaching (via registry lookup)
```

## Changes

### 1. Add `classifySituationFromState()` to the registry

The registry currently only has `classifySituation()` (explicit params). Add a second
entry point that takes `GameState + seatIndex` and derives the params internally.

```typescript
// convex/lib/preflop/situationRegistry.ts
export function classifySituationFromState(
  state: GameState,
  seatIndex: number,
): PreflopSituationContext {
  const preflopActions = state.actionHistory.filter(a => a.street === "preflop");
  const heroPosition = state.players[seatIndex].position;
  
  // Derive params from action history (limp detection, raise counting, etc.)
  // Then call classifySituation() with those params
}
```

This is the limp detection + raise counting logic currently in `autoPlay.classifyPreflop()`,
moved to the registry where it belongs.

**Import concern:** The registry is in `convex/lib/preflop/` and `GameState` is in
`convex/lib/state/gameState.ts`. This import is fine — both are pure TS in convex/lib/.
The registry doesn't import from React or Convex runtime.

### 2. Add archetype resolution to registry

The archetype mapping is NOT a simple static field because `facing_open` maps to
different archetypes based on hero position:
- BB facing open → `bb_defense_vs_rfi`
- Non-BB facing open → `three_bet_pots`

**Solution:** A `resolveArchetype(ctx)` function instead of a static field:

```typescript
import type { ArchetypeId } from "../gto/archetypeClassifier";

export function resolveArchetype(ctx: PreflopSituationContext): ArchetypeId {
  if ((ctx.id === "facing_open" || ctx.id === "facing_open_multiway")
      && ctx.heroPosition === "bb") {
    return "bb_defense_vs_rfi";
  }
  return ARCHETYPE_MAP[ctx.id];
}

const ARCHETYPE_MAP: Record<PreflopSituationId, ArchetypeId> = {
  rfi: "rfi_opening",
  facing_open: "three_bet_pots",
  facing_open_multiway: "three_bet_pots",
  facing_3bet: "four_bet_five_bet",
  facing_4bet: "four_bet_five_bet",
  blind_vs_blind: "blind_vs_blind",
  facing_limpers: "rfi_opening",
  bb_vs_limpers: "bb_defense_vs_rfi",
  bb_vs_sb_complete: "blind_vs_blind",
  bb_uncontested: "rfi_opening",
};
```

No new field on `PreflopSituationEntry`. Callers use `resolveArchetype(ctx)`.

**Note:** `bb_vs_sb_complete` uses `engineKey: "preflop.sb_complete"` (not `"preflop.open"`).
This matches autoPlay.ts behavior — profiles may have distinct params for SB complete spots.

### 3. Engine delegates to registry

`autoPlay.ts classifyPreflop()` becomes:

```typescript
function classifyPreflop(state: GameState, seatIndex: number): SituationKey {
  const ctx = classifySituationFromState(state, seatIndex);
  return PREFLOP_SITUATIONS[ctx.id].engineKey;
}
```

Two lines. The 30+ lines of raise counting, limp detection, SB complete logic — deleted.
The registry owns all classification.

### 4. BB-specific logic in range resolver cleaned up

Currently `cold_call_plus_3bet` has a hidden BB branch. Fix by splitting into
situation-specific range sources in the registry entries:

**Before:** `facing_open` uses `heroRangeSource: { type: "cold_call_plus_3bet" }` for all
positions, with BB secretly handled inside the resolver.

**After:** The registry handles BB explicitly:
- `facing_open` (non-BB): `heroRangeSource: { type: "cold_call_plus_3bet" }`
- Create a BB-specific facing_open? No — the classifier already produces `facing_open`
  for BB too. The range source needs to be smart about position.

Better approach: change `cold_call_plus_3bet` to check BB, or split the registry entry
so BB facing an open maps to a different range source. The cleanest option:

**Add `bb_defense_by_opener` as the hero range source for BB facing opens.**

But we can't have two registry entries for the same situation (facing_open for BB vs non-BB).
The real fix: make the resolver position-aware by design. The range source stays
`cold_call_plus_3bet` but the resolver's BB branch is documented and intentional,
not "hidden." Add a comment and accept this is correct behavior: BB's "continue range"
IS the defense range, and that's what `cold_call_plus_3bet` returns for BB.

### 5. Normalize range data shapes

Currently `preflopRanges.ts` has mixed shapes:
- `Record<string, Set<string>>` — RFI, 3-bet, cold-call, iso-raise
- `Record<string, { call: Set<string>; threebet: Set<string> }>` — BB defense
- `{ value, call, bluffs }` — 4-bet
- `{ sb_open, bb_3bet_vs_sb, bb_call_vs_sb }` — BvB
- `Set<string>` — SB complete, BB vs SB complete

The resolver already handles all shapes. Normalizing to a single shape would mean
either: (a) flattening BB defense to a single Set (losing call/3bet distinction), or
(b) wrapping everything in `{ hands: Set<string>, meta?: ... }`.

**Decision:** Don't normalize. The shape differences carry meaning (BB defense has
call vs 3-bet distinction for good reason). The resolver is the adapter layer — that's
its job. Document the shapes clearly. This is acceptable complexity.

### 6. Remove duplicate BB defense logic in resolver

The `bb_defense_by_opener` and `cold_call_plus_3bet` cases share identical BB defense
lookup logic (copy-pasted). Extract a helper:

```typescript
function resolveBBDefense(openerPosition: Position): Set<string> | null {
  const opener = normalize6Max(openerPosition);
  if (opener === "sb") {
    return combineSets(
      (GTO_BVB as Record<string, Set<string>>)["bb_3bet_vs_sb"],
      (GTO_BVB as Record<string, Set<string>>)["bb_call_vs_sb"],
    );
  }
  const key = opener === "co" ? "vs_co" : opener === "btn" ? "vs_btn" 
    : opener === "hj" ? "vs_hj" : "vs_utg";
  const defense = GTO_BB_DEFENSE[key];
  if (!defense) return null;
  return combineSets(defense.threebet, defense.call);
}
```

Both cases call this helper. No duplication.

## Implementation Steps

### Step 1: Add `classifySituationFromState` to registry
- Add function to `situationRegistry.ts` that takes `GameState + seatIndex`
- Import `GameState` from `../state/gameState`
- **Count raises from action history** — filter for `raise` and `bet` actions only,
  explicitly excluding `all_in`. Both `state.raiseCount` and autoPlay's current logic
  count short all-in calls as raises (bug). The fix: only count `actionType === "raise"`
  (and `"bet"` for the initial open). All-in is a sizing decision, not a separate action
  type for classification purposes. If the all-in exceeds `currentBet`, there was already
  a `raise` action recorded. Short all-in calls that don't exceed `currentBet` should not
  count as raises.
  - **Note:** This is a minor behavioral fix. In practice, short-stack preflop all-in calls
    are rare edge cases (require a player with < open raise size). No existing tests depend
    on the wrong behavior.
- Derive `numCallers` (calls AFTER first raise) — new logic, autoPlay doesn't compute this
- Derive `numLimpers` (calls BEFORE any raise) — same as autoPlay
- Derive `threeBettorPosition` (position of 2nd raiser) — new logic
- Derive `openerPosition` (position of 1st raiser)
- Derive `isSBComplete` — same as autoPlay
- Derive `everyoneElseFolded` — check active players
- Export the new function + add to barrel `index.ts`
- Write tests covering ALL scenarios:
  - RFI, facing_raise, facing_3bet, facing_4bet
  - facing_limpers, bb_vs_limpers, sb_complete
  - bb_uncontested
  - Short-stack all-in call (should NOT increment raise count)
  - Hero's own raise in history (UTG opens, gets 3-bet, faces 3-bet)

### Step 2: Add `resolveArchetype()` to registry
- Import `ArchetypeId` type from `../gto/archetypeClassifier`
- Add `ARCHETYPE_MAP` constant and `resolveArchetype(ctx)` function
- Handles BB-specific mapping: facing_open + BB → `bb_defense_vs_rfi`
- Export from barrel `index.ts`
- No change to `PreflopSituationEntry` interface (function, not field)

### Step 3: Engine delegates to registry
- `autoPlay.classifyPreflop()` → call `classifySituationFromState()`, return `PREFLOP_SITUATIONS[ctx.id].engineKey`
- Delete the 40+ lines of inline classification
- Run full test suite — behavior must be identical EXCEPT the all-in bug fix
  (short all-in calls no longer misclassified as extra raises)

### Step 4: Extract BB defense helper + clean dead code in range resolver
- Extract `resolveBBDefense(openerPosition)` helper
- Three consumers (not two):
  1. `cold_call_plus_3bet` BB branch
  2. `bvb_defense` BB branch (partial overlap — the `opener === "sb"` sub-path)
  3. Remove `bb_defense_by_opener` case entirely — it is UNUSED (no registry entry maps to it)
- Remove `bb_defense_by_opener` from the `RangeSource` type union (dead type)
- Add comment explaining BB's continue range IS defense range in `cold_call_plus_3bet`

### Step 5: Callers derive archetypeId from registry
**NOT:** adding optional param to `classifyPreflopHand()` (that would be dead code —
no caller has `PreflopSituationContext` to pass).

**Instead:** Update callers to use `resolveArchetype(ctx)` from registry when they have game state:
- `frequencyLookup.ts`: after calling `classifySituationFromState()`, use
  `resolveArchetype(ctx)` instead of archetype classifier's output
- `handPipeline.ts`: same pattern
- `drillPipeline.ts`: same pattern
- `constrainedDealer.ts`: uses hardcoded `"rfi_opening"` — leave as-is (it's drill-specific)

This means these callers need `classifySituationFromState()` from Step 1 and the
`archetypeId` field from Step 2. `classifyPreflopHand()` itself doesn't change —
it still takes `archetypeId: string`. The callers just derive it from the registry
instead of the independent archetype classifier.

**Note:** The archetype classifier still runs for POSTFLOP. Only preflop routing changes.
The coaching lens's `tryGtoSolverLookup` path is the last independent consumer —
it calls `classifyArchetype()` which handles both preflop and postflop. For preflop,
it will now route through the registry. For postflop, unchanged.

### Step 6: Tests + cleanup
- Verify all 1437+ tests pass after each step
- Remove dead `bb_defense_by_opener` from RangeSource type and resolver
- Remove dead code paths
- Type check clean
- Add tests for the all-in edge case fix

## What This Does NOT Change

- Range data shapes in `preflopRanges.ts` — kept as-is (intentional variety)
- The archetype classifier itself — still runs for postflop. Only preflop routing changes.
- `PreflopSituationEntry` fields — additive only (new `archetypeId` field)
- Engine `SituationKey` type — no changes
- Postflop classification — untouched

## Success Criteria

1. One classifier (`classifySituationFromState`) for all preflop classification
2. Engine's `classifyPreflop()` is 2 lines (delegate + lookup)
3. No duplicated BB defense logic in range resolver
4. No dead code (`bb_defense_by_opener` removed)
5. `archetypeId` derivable from registry via `resolveArchetype(ctx)` (position-aware, handles BB)
6. All-in call classification fixed (short stacks no longer misclassified)
7. All 1437+ tests pass
8. Adding a new preflop situation = 1 registry entry (includes engineKey + archetypeId)

## Risk Assessment

**Low risk.** Steps 1-4 are pure refactors — same behavior, different code path.
Step 5 changes which callers derive archetypeId but produces the same values.
The only behavioral change is the all-in bug fix (Step 1), which is an improvement.

**Rollback:** Each step is independently committable. If any step breaks, revert
that one commit.

## Resolved Issues from Validation

| # | Issue | Resolution |
|---|---|---|
| 1 | `all_in` over-counting — both autoPlay AND state.raiseCount count short all-in calls as raises | Count only `raise`/`bet` actions from history, exclude `all_in` |
| 2 | Step 5 produces dead code (optional param nobody passes) | Rewritten: callers look up archetypeId from registry |
| 3 | `bb_defense_by_opener` unused range source | Remove from resolver and RangeSource type |
| 4 | `bvb_defense` is third consumer of BB defense logic | Added as third consumer of extracted helper |
| 5 | `PreflopArchetypeId` type doesn't exist | Use `ArchetypeId` throughout |
| 6 | `numCallers` not in autoPlay | Added as new derivation in classifySituationFromState |
| 7 | `threeBettorPosition` not in autoPlay | Added as new derivation |
| 8 | `state.raiseCount` has same all-in bug as autoPlay | Don't use state.raiseCount — count raise/bet only from action history |
| 9 | `facing_open` → `three_bet_pots` wrong for BB (should be `bb_defense_vs_rfi`) | Use `resolveArchetype(ctx)` function instead of static field — handles BB override |
