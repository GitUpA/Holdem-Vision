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

### 2. Add `archetypeId` to registry entries

Each `PreflopSituationEntry` gains an `archetypeId` field mapping to the 5 preflop archetypes.
Use `ArchetypeId` from archetypeClassifier.ts directly (not a narrowed type — the 20
archetype IDs are a union type, adding a subset would be over-engineering):

```typescript
import type { ArchetypeId } from "../gto/archetypeClassifier";

export interface PreflopSituationEntry {
  // ... existing fields ...
  archetypeId: ArchetypeId;  // maps to archetype classifier's preflop IDs
}
```

Mapping:
| PreflopSituationId | archetypeId |
|---|---|
| rfi | rfi_opening |
| facing_open | three_bet_pots |
| facing_open_multiway | three_bet_pots |
| facing_3bet | four_bet_five_bet |
| facing_4bet | four_bet_five_bet |
| blind_vs_blind | blind_vs_blind |
| facing_limpers | rfi_opening |
| bb_vs_limpers | bb_defense_vs_rfi |
| bb_vs_sb_complete | blind_vs_blind |

**Note:** `bb_vs_sb_complete` uses `engineKey: "preflop.sb_complete"` (not `"preflop.open"`).
This matches autoPlay.ts behavior — profiles may have distinct params for SB complete spots.
| bb_uncontested | rfi_opening |

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
- Move limp detection + raise counting logic from `autoPlay.ts` to `situationRegistry.ts`
- Import `GameState` from `../state/gameState`
- Export the new function
- Add to barrel `index.ts`
- Write tests: same scenarios as autoPlay tests, verify identical results

### Step 2: Add `archetypeId` to registry entries
- Import `PreflopArchetypeId` type from archetypeClassifier
- Add `archetypeId` field to `PreflopSituationEntry` interface
- Populate for all 10 entries per mapping table above
- Export function: `situationToArchetype(id: PreflopSituationId): PreflopArchetypeId`

### Step 3: Engine delegates to registry
- `autoPlay.classifyPreflop()` → call `classifySituationFromState()`, return `.engineKey`
- Delete the 30+ lines of inline classification
- Run full test suite — behavior must be identical

### Step 4: Extract BB defense helper in range resolver
- `resolveBBDefense(opener)` extracts shared logic
- `cold_call_plus_3bet` calls it for BB path
- `bb_defense_by_opener` calls it directly
- Add comment explaining BB's continue range IS defense range

### Step 5: Wire archetype → registry in coaching path
- `preflopClassification.classifyPreflopHand()` currently takes `archetypeId: string`
- Add optional `situationId: PreflopSituationId` parameter
- When `situationId` provided, derive `archetypeId` from registry instead of using
  the archetype classifier's output
- Callers that have a `PreflopSituationContext` can pass `.id` directly
- This doesn't change behavior — just routes through registry

### Step 6: Tests + cleanup
- Verify all 1437 tests pass after each step
- Remove any remaining dead code paths
- Type check clean

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
4. `archetypeId` derivable from registry (no independent classifier for preflop archetypes)
5. All 1437 tests pass
6. Adding a new preflop situation = 1 registry entry (includes engineKey + archetypeId)

## Risk Assessment

**Low risk.** Every step is a pure refactor — same behavior, different code path.
The registry already produces correct results. We're just making the engine and
archetype systems delegate to it instead of computing independently.

**Rollback:** Each step is independently committable. If any step breaks, revert
that one commit.
