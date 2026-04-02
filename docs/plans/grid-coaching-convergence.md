# Grid ↔ Coaching Convergence Plan (v2)

The grid pipeline (new, clean) and coaching pipeline (old, independent) compute some of the
same information through separate code paths. This document maps every function to its
correct home after three rounds of architectural validation.

## The Principle

The grid pipeline produces the **situational foundation** (what situation is this, what are
the GTO ranges, what is the pot math). The coaching pipeline produces **opponent-specific
analysis** (weighted ranges from observed behavior, equity against specific opponents) and
**narrative rendering** (words). These are complementary, not redundant.

**What was wrong in v1:** The original plan claimed 7 coaching computations were redundant.
Validation revealed only 3 are truly shareable. The rest compute fundamentally different
things (per-opponent weighted equity ≠ per-hand-class unweighted equity, absolute hand
strength ≠ relative-within-category strength).

## What IS Shared (do once, consume everywhere)

| Computation | Single Source | Consumers |
|---|---|---|
| Situation classification | `classifySituationFromState()` in registry | Grid, coaching, engine, audit |
| Hero continue range | `resolveHeroRange()` in situationRanges | Grid, coaching |
| GTO frequency lookup | `lookupGtoFrequencies()` in frequencyLookup | Engine, coaching (already shared) |
| Pot arithmetic / SPR | `computePotAtAction()` + trivial SPR | Grid, coaching |
| Hand classification (preflop) | `classifyPreflopHand()` in preflopClassification | Grid coaching text, coaching narrative |

## What Is NOT Shared (different data, different purpose)

| Grid Computes | Coaching Computes | Why Different |
|---|---|---|
| Equity for all 169 hand classes vs generic GTO range (unweighted, preflop-only) | Equity for hero's specific hand vs specific opponent's weighted range (any street) | Different algorithm, different inputs, different output shape |
| V/M/B/F facing classification (4 buckets, range-gated) | fold/call/bet/raise/check recommendation (5 actions, equity + hero strength) | Different outputs, different thresholds, different scope |
| Generic GTO opponent range from position | Per-opponent weighted range from profile + observed actions | GTO default vs behavioral inference |
| Hand class boundary distance (categorical) | Absolute hero hand strength 0-1 (numeric) | Categorical vs absolute scale |

These are not redundant — they answer different questions:
- Grid: "Given this SITUATION, what does the 13×13 look like?"
- Coaching: "Given this OPPONENT's behavior, what should hero do with THIS hand?"

## Architecture

### Current (three parallel pipelines)

```
GameState ──→ Grid Pipeline ──→ PreflopGridResult (local to HandGrid component)
GameState ──→ Coaching Lens ──→ CoachingValue (via AnalysisLens system)
GameState ──→ Snapshot ──→ FullSnapshot (for audit/replay)
           (each independently classifies, estimates ranges, computes equity)
```

### Target (shared foundation, independent analysis, unified rendering)

```
GameState ──→ Shared Foundation
              ├── classifySituationFromState() → PreflopSituationContext
              ├── resolveHeroRange() → hero continue range
              ├── computePotAtAction() → pot + SPR
              └── classifyPreflopHand() → PreflopClassification

              ↓ consumed by ↓

         ┌── Grid Pipeline (situation-level, stateless)
         │   ├── resolveOpponentRange() → generic GTO range
         │   ├── computeEquityGrid() → 169 equities (unweighted)
         │   ├── classifyFacingGrid() → V/M/B/F per cell
         │   └── → PreflopGridResult → hand-grid.tsx
         │
         ├── Opponent Analysis (per-opponent, session-aware)
         │   ├── estimateRange() → weighted range from actions
         │   ├── equityVsRange() → hero equity vs specific opponent
         │   ├── inferBehavior() → tight/loose/aggressive/passive
         │   └── → OpponentStory → coaching narrative
         │
         └── Coaching Narrative (rendering layer)
             ├── reads PreflopSituationContext (from foundation)
             ├── reads PreflopClassification (from foundation)
             ├── reads OpponentStory (from opponent analysis)
             ├── reads GTO frequencies (from shared lookup)
             └── → prose for coaching-section.tsx
```

### Key difference from v1

The grid pipeline and opponent analysis are **siblings**, not parent-child. The grid doesn't
feed the coaching. They both consume the shared foundation independently. The coaching
narrative then renders data from BOTH.

## Implementation Steps

### Step 1: Lift grid computation to workspace level

**The blocking change.** Currently `computePreflopHandGrid()` runs inside HandGrid via
`useMemo`. The result is a local variable never exposed to coaching.

- Move grid computation to `use-workspace.ts` (or a new `use-preflop-grid.ts` hook)
- Store `PreflopGridResult` in workspace state
- Pass to `HandGrid` as a prop (HandGrid becomes a dumb renderer)
- Pass `PreflopSituationContext` to coaching via `AnalysisContext`

This establishes the shared foundation without changing any computation.

**Files:** `src/hooks/use-workspace.ts`, `src/components/analysis/hand-grid.tsx`,
`convex/lib/types/analysis.ts` (AnalysisContext)

### Step 2: Coaching reads situation from shared foundation

Replace coaching's independent situation detection with the shared classification:

- `buildPreflopScene()` receives `PreflopSituationContext` instead of counting raises
  internally (rewire, not delete — it still needs the data for narrative)
- `coachingLens.ts` reads `ctx.situationContext` from AnalysisContext
- Remove any remaining independent raise-counting in the coaching path

**Files:** `handCommentator.ts`, `coachingLens.ts`

### Step 3: Add SPR to grid result

The only Bucket B item that cleanly belongs in the grid.

```typescript
// In PreflopGridResult:
spr: number;             // stackDepthBB / potSizeBB
isPotCommitted: boolean; // spr < 0.5
```

Two lines of computation in `computePreflopHandGrid()`.

**Files:** `preflopGrid.ts`

### Step 4: Share preflop classification

Coaching already partially does this (via `preflopClassification` on CommentaryInput).
Ensure it's always populated and the commentator never falls back to fake GTO percentages.

**Files:** `coachingLens.ts`, `snapshot.ts`

### Step 5: Converge snapshot.ts

`captureFullSnapshot()` is a third parallel pipeline. It should read from the shared
foundation (situation context, hero range, classification) rather than recomputing.
It already accepts pre-computed parameters — just need to populate them from the foundation.

**Files:** `snapshot.ts`

## What NOT to Change

- **Per-opponent equity computation** stays in opponentStory — it uses weighted ranges,
  specific hero cards, and runs on any street. The grid can't replace this.
- **computeAdjustedAction** stays in opponentStory — it returns concrete actions using
  absolute hand strength, not V/M/B/F buckets.
- **evaluateHeroStrength** stays — it computes absolute 0-1 strength, which is different
  from handCat's relative-within-category strength. Future: add `absoluteStrength` field
  to HandCategorization so this CAN be shared, but that's a separate enhancement.
- **Multi-profile comparison** stays in coaching — the grid is single-path.
- **Equity-based GTO adjustment** stays in coaching — it operates on solver frequency
  tables, not on V/M/B/F.

## Resolved Validation Issues

| # | Issue | Resolution |
|---|---|---|
| 1 | No data path between grid and coaching | Step 1: lift grid to workspace, pass situation via AnalysisContext |
| 2 | Bucket B enrichments don't belong on PreflopGridResult | Only SPR added (Step 3). Others stay in their correct layers. |
| 3 | snapshot.ts is a third parallel pipeline | Step 5: converge on shared foundation |
| 4 | Implementation ordering wrong | Reordered: data path first (Step 1), then rewire (Step 2-4), then snapshot (Step 5) |
| 5 | evaluateHeroStrength ≠ handCat | Not replaced. Future: add absoluteStrength to HandCategorization |
| 6 | equityVsRange ≠ computeEquityGrid | Not replaced. Different algorithms for different purposes |
| 7 | computeAdjustedAction ≠ classifyFacing | Not replaced. Different scope and output types |
| 8 | Per-opponent weighted range ≠ generic GTO range | Grid and opponent analysis are siblings, not parent-child |
| 9 | buildPreflopScene raise counting is narrative | Rewire to receive situation context, not delete |

## Success Criteria

1. Situation classification happens ONCE (in the registry), consumed by grid + coaching + snapshot
2. HandGrid is a dumb renderer receiving PreflopGridResult as a prop
3. Coaching reads situation context from AnalysisContext, not from independent analysis
4. SPR computed once in grid, available to coaching
5. No computation is deleted that serves a different purpose than what the grid computes
6. snapshot.ts reads from shared foundation instead of recomputing
7. All 1446+ tests pass
