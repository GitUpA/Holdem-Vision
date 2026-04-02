# Hand Pipeline — Vetted Implementation Plan (v3)

> **STATUS (2026-04-01):** Phases 1-5 largely superseded by the Preflop Situation Registry
> (`convex/lib/preflop/situationRegistry.ts`). The old functions referenced below
> (`classifyPreflopSituation`, `getOpponentRange`, `getHeroContinueRange`) have been
> deleted. Range resolution now flows through the registry. See `docs/plans/situation-registry-plan.md`
> for the current architecture. Phases 6+ (postflop, confidence model) remain relevant.

## Reference: `docs/first-principles.md` (10 layers)

## Critical Findings From Vetting

1. **Phase 1 data already exists.** `preflopHandClassData.ts` has PokerBench solver data in exactly the shape needed: archetype × opener × position × handClass → {fold, call, raise, sampleCount}. Don't rebuild — validate and promote to single source.

2. **Coach is NOT blind (Layer 7).** `coachingLens.ts` passes profile objects to opponent story. Must refactor to pass only action sequences.

3. **HandStepper uses Math.random.** Blocks deterministic payoff matrix testing. Must thread seeded RNG.

4. **HandContext overlaps FullSnapshot.** Define HandContext as lightweight input that feeds INTO FullSnapshot, not a parallel structure.

5. **SeatContext overlaps RangeEstimation.** SeatContext holds raw observables. Range estimation computed lazily via existing `estimateRange()`.

6. **Small sample confidence has no model.** Need: given N observations matching pattern P, output confidence that pattern is real vs variance.

## Revised Phases

### Phase 1a: Promote preflopHandClass to Single Source
Make `preflopHandClass.ts` (PokerBench data) the single preflop truth.
- Wire `frequencyLookup.ts` to ALWAYS use `lookupPreflopHandClass()` for preflop
- Delete the bypass in `frequencyLookup.ts` that hardcodes `preflopRanges.ts` Sets
- `preflopRanges.ts` becomes a thin delegate (backward compat)
- Validate: count range sizes from the real data, compare to targets

**Files:** `frequencyLookup.ts`, `preflopRanges.ts`
**Risk:** PokerBench data may have quality issues (small samples). Mitigate with Phase 1b.

### Phase 1b: Validate + Patch Preflop Data
Audit the PokerBench preflop data quality. For cells with low sample count (<5):
- Patch with known GTO values (from our validated Sets)
- Mark confidence as "low"
- Ensure KTo from CO has raise frequency ~70% (the KTo test case)

**Files:** `preflopHandClassData.ts`, possibly the source JSON files
**Validation test:** Range size per position matches targets. No "fold 95%" for standard opens.

### Phase 2: Deterministic Engine
Thread seeded RNG through `HandStepper` → `autoAct()` → `chooseActionFromProfile()`.
Accept seed in constructor. Ensure `playFullHand()` is fully deterministic.

**New file:** `convex/lib/pipeline/batchRunner.ts` — runs N hands with deterministic seeds.
**Validation:** GTO vs GTO heads-up, 10K hands → ~50/50 (±2%).

**Files:** `handStepper.ts`, `batchRunner.ts`

### Phase 3: HandContext Type
Lightweight, seat-agnostic, observable-only struct. Feeds INTO FullSnapshot. No profile references.

```typescript
interface SeatContext {
  position: Position;
  actionHistory: PlayerAction[];
  // Range computed lazily via estimateRange(), not stored
}

interface HandContext {
  heroSeat: SeatContext;
  villainSeats: SeatContext[];
  preflopArchetypeId: ArchetypeId;
  streetHistory: Array<{
    street: Street;
    heroAction: string;
    heroActionFrequency: number;
  }>;
  heroInRange: boolean;
}
```

**Relationship to existing types:**
- FullSnapshot: HandContext feeds INTO snapshot capture. Snapshot is the full view.
- ContextFactors: Engine-internal (handStrength, potOdds). Different purpose. No overlap.
- RangeEstimation: SeatContext holds observables. Range computed by calling `estimateRange()`.

**Files:** `convex/lib/pipeline/handContext.ts` (NEW)

### Phase 4: Pre-computed Equity Tables
Replace MC equity with category-based lookup for headless/Convex.
~1,400 entries: handCategory × boardTexture × rangeWidth → equity.
Pre-computed at build time from MC runs. Optional MC in browser for precision.

**Files:** `convex/lib/gto/tables/equityLookup.ts` (NEW), `opponentStory.ts`

### Phase 5: Coach Blind Refactor
Stop passing profile objects to coaching. Coach infers from action sequences only.
Key change: `estimateRange()` gets a behavioral-inference path that builds a synthetic behavioral model from action patterns without needing a pre-assigned profile.

**Files:** `coachingLens.ts`, `opponentStory.ts`, `rangeEstimator.ts`

### Phase 6: Constrained Dealer Upgrade
Replace `isReasonablePreflop()` with Phase 1 data lookup.
Add `preflopContext` to `ConstrainedDeal`.
Constrain primary villain's hand to preflop range for postflop drills.

**Files:** `constrainedDealer.ts`

### Phase 7: Cross-Street Scoring
Extend `ActionScore` with `conditionalVerdict` and `preflopContribution`.
Add `handContext` to `HandRecord` for audit trail.

**Files:** `evScoring.ts`, `audit/types.ts`

### Phase 8: Pipeline Orchestration
Orchestrator builds HandContext at preflop, updates at each street transition.
Same code path for HandSession (UI) and HandStepper (headless).

**Files:** `convex/lib/pipeline/handPipeline.ts` (NEW), `handSession.ts`

### Phase 9a: Payoff Matrix + Confidence Model
PayoffMatrix data structure. Batch runner integration.
Statistical confidence model: N observations → confidence that pattern is real.

**Files:** `convex/lib/pipeline/payoffMatrix.ts` (NEW)

### Phase 9b: Counter-Strategy Map
Compute optimal counter-profiles from matrix. Wire into coaching.
Static lookup: behavior pattern → counter-advice with narrative + confidence.

**Files:** `convex/lib/pipeline/counterStrategyMap.ts` (NEW)

## Execution Order

```
Phase 1a (promote data) → Phase 1b (validate data)
    ↓
Phase 2 (deterministic)  ←→  Phase 3 (HandContext)     [PARALLEL]
    ↓                              ↓
Phase 4 (equity tables)   →  Phase 5 (coach blind)      [SEQUENTIAL]
    ↓                              ↓
Phase 6 (dealer)  ←→  Phase 7 (scoring)                 [PARALLEL]
    ↓
Phase 8 (orchestration)
    ↓
Phase 9a (matrix + confidence) → Phase 9b (counter-strategies)
```

## Minimum Viable Set

**Phases 1a, 1b, 2, 3, 5, 8** — validates the architecture:
- Unified preflop data (1a+1b)
- Deterministic engine for testing (2)
- Seat-agnostic context (3)
- Coach blind to setup (5)
- Pipeline orchestration (8)

Deferrable: Phase 4 (equity tables — MC in browser is OK short term), Phase 6 (dealer — villain hand quality acceptable), Phase 7 (scoring — nice but not blocking), Phase 9 (matrix — validation/discovery, not core functionality).

## What Does NOT Change
- Postflop solver tables (TexasSolver)
- Engine architecture (modifiedGtoEngine, modifiers)
- UI components
- Archetype classifier
- Hand evaluator, draw detector, board texture

## Verification Per Phase
- Phase 1: Range sizes match targets, KTo from CO = raise ~70%
- Phase 2: GTO vs GTO 10K hands = ~50/50
- Phase 3: `HandContext` compiles, no profile references (grep check)
- Phase 5: `coachingLens.ts` has zero profile imports (grep check)
- Phase 8: HandContext populated at each street in both UI and headless mode
- Phase 9a: Matrix symmetry test passes

## Failure Points + Mitigations
- PokerBench data quality → Phase 1b patches low-confidence cells
- HandContext leaks profiles → grep test catches this
- Equity tables too coarse → compare vs MC on 100 boards
- Coach blind breaks opponent stories → A/B test coaching quality
- Batch runner too slow → profile timing at Phase 2 (expect ~1K hands/sec)
- Counter-strategy overfitting → sample modifier ranges, not exact values
