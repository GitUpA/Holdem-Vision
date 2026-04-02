# Preflop Improvements Roadmap

Consolidated from 6 independent reviews (senior poker dev, React architect, poker student,
data architect, adversarial QA, product designer). Ordered by dependencies and logic.

## Bugs (fix first — wrong behavior)

### B1: All-in shove invisible to classifier
**Source:** Adversarial QA (silent failure risk 4/10)
**Problem:** `classifySituationFromState` excludes `all_in` from raise counting. A short-stack
all-in shove (the only raise) makes the next player see RFI instead of facing a raise.
We over-corrected when fixing the short-stack all-in *call* bug — shoves that exceed
currentBet ARE raises and must be counted.
**Fix:** Count `all_in` as a raise when `amount > currentBet` at the time of the action.
This requires checking the action's amount against the bet level, not just the action type.
**Files:** `convex/lib/preflop/situationRegistry.ts` (classifySituationFromState)
**Dependencies:** None — standalone fix.

### B2: Heads-up never triggers blind_vs_blind
**Source:** Adversarial QA (edge case handling 5/10)
**Problem:** In 2-player (HU), positions are `["btn", "bb"]`. BTN is the SB in HU, but
the classifier checks `Set(["sb", "bb"]).has(heroPosition)` — "btn" doesn't match.
BvB ranges and coaching are never used in HU.
**Fix:** Either map "btn" → "sb" in HU context, or expand the BvB check to include
`heroPosition === "btn" && tableSize === 2`.
**Files:** `convex/lib/preflop/situationRegistry.ts` (classifySituation)
**Dependencies:** None — standalone fix.

## Data Layer Improvements

### D1: Move inline limp range to preflopRanges.ts
**Source:** Data architect (single source of truth 8/10)
**Problem:** `situationRanges.ts` has a hardcoded `new Set(...)` for the generic limp range
(~35% of hands) that bypasses `preflopRanges.ts`. Violates single source of truth.
**Fix:** Export `GTO_GENERIC_LIMP_RANGE` from `preflopRanges.ts`. Resolver imports it.
**Files:** `convex/lib/gto/tables/preflopRanges.ts`, `convex/lib/preflop/situationRanges.ts`
**Dependencies:** None.

### D2: Replace binary range Sets with frequency Maps
**Source:** Senior poker dev, poker student, data architect (all three)
**Problem:** Ranges are binary (in/out) but poker is mixed-frequency. 76s opens 43% from UTG,
not 100% or 0%. Binary approximation is Layer 3's precision boundary.
**Fix:** `Map<string, number>` where value is open/continue frequency (0-1). The Sets become
derived: `hand is in range if frequency > threshold`. Classification gains continuous data.
Grid can display frequencies instead of binary outlines.
**Impact:** This is the single highest-leverage improvement. Touches range data, resolver,
classification, and grid display. Needs solver data or published frequency charts.
**Files:** `preflopRanges.ts` (data shape change), `situationRanges.ts` (resolver),
`preflopClassification.ts` (classification), `hand-grid.tsx` (display)
**Dependencies:** D1 should be done first (clean up data layer before reshaping it).

### D3: Profile-aware limp ranges
**Source:** Senior poker dev, data architect
**Problem:** `limper_by_profile` range source returns a generic fish range regardless of
the actual opponent profile. The resolver has a "Future: derive from opponent profile" comment.
**Fix:** Accept profile ID or profile type in the range resolution chain. Fish limps ~40%,
nit limps ~15%, TAG rarely limps. Use the assigned profile to select the right range.
**Files:** `situationRanges.ts`, possibly `situationRegistry.ts` (context needs profile info)
**Dependencies:** D1 (limp range in data file first). May also depend on how profile data
flows to the grid pipeline — currently the grid doesn't know about opponent profiles.

## Code Quality / DRY

### C1: Extract async MC equity into a hook
**Source:** React architect (component complexity 4/10)
**Problem:** `hand-grid.tsx` has ~50 lines of combo generation + requestAnimationFrame
chunking for async MC equity. This is poker math in a React component.
**Fix:** Extract `useAsyncEquityGrid(heroCards, opponentRange, trials)` hook that wraps
`computeEquityGrid` with chunked scheduling. Component calls the hook, renders the result.
**Files:** New `src/hooks/use-async-equity.ts`, modify `hand-grid.tsx`
**Dependencies:** None.

### C2: Extract workspace prop derivation
**Source:** React architect (prop drilling 5/10)
**Problem:** `workspace-shell.tsx` lines 630-665 have 5 IIFEs computing `facingPosition`,
`numCallers`, `numLimpers` from game state. This duplicates logic that
`classifySituationFromState` already does.
**Fix:** Extract `derivePreflopGridProps(gameState, heroSeatIndex)` that returns full
`HandGridProps` shape. One call, zero IIFEs.
**Files:** New function (in `convex/lib/preflop/` or a React helper), modify `workspace-shell.tsx`
**Dependencies:** None, but benefits from C1 being done first.

### C3: Deduplicate shared constants
**Source:** React architect
**Problem:** `RL` (rank labels), `GRID_TO_RANK`, `getHeroHandClass` duplicated across
`preflopGrid.ts` and `hand-grid.tsx`. `classifyFacingLocal` duplicates `classifyFacing`.
**Fix:** Centralize in `convex/lib/preflop/` or `convex/lib/primitives/`. Import everywhere.
**Files:** `preflopGrid.ts`, `hand-grid.tsx`, possibly new shared file
**Dependencies:** None.

### C4: Clean up re-exports
**Source:** Data architect
**Problem:** `preflopGrid.ts` re-exports `normalize6Max` and `compressRangeByStack` from
`preflop/rangeUtils.ts` for backward compatibility. Migration residue.
**Fix:** Update any remaining direct importers to use `preflop/rangeUtils` directly.
Remove re-exports from `preflopGrid.ts`.
**Files:** `preflopGrid.ts`, any files still importing from it
**Dependencies:** C3 (do all centralization at once).

## Classification / Coaching Quality

### Q1: Hand-specific teaching notes
**Source:** Poker student (teaching notes 7/10)
**Problem:** Teaching notes are tier-based templates ("Raise for value and initiative")
not hand-specific ("ATs dominates Ax in caller's range"). Students with 6+ months
experience find them generic.
**Fix:** Add hand-class-specific notes for the ~30 most common hands in each situation.
E.g., suited connectors get "board coverage on low flops," Ax suited gets "nut flush
potential," broadways get "domination risk."
**Files:** `preflopClassification.ts` (classify functions)
**Dependencies:** None, but D2 (frequency maps) would make notes more precise.

### Q2: Multiway tightening formula
**Source:** Senior poker dev
**Problem:** Hero range multiway adjustment uses `effectiveStack - numCallers * 15` — a
crude heuristic. Real multiway tightening depends on callers' positions and ranges.
**Fix:** Position-weighted tightening. A caller in late position with a wide range
tightens less than a caller in early position with a narrow range.
**Files:** `situationRanges.ts` (resolveHeroRange)
**Dependencies:** D3 (profile-aware ranges) would make this more accurate.

## Visual / UX

### V1: Guided learning path
**Source:** Product designer (discoverability 6/10)
**Problem:** No scaffolded progression. Student can look at grid for 30 seconds and never
discover Layer 4. No "you mastered RFI, now try BB defense" progression.
**Fix:** Situation-based learning progression. Track which situations the student has
practiced. Suggest the next one. Show mastery indicators per situation.
**Files:** New UI component, possibly Convex persistence for progress tracking.
**Dependencies:** The registry's `drillPriority` field already exists for ordering.

### V2: Interactive range boundary
**Source:** Product designer (breakthrough suggestion)
**Problem:** `boundaryDistance` is computed but hidden from the student. The range edge
is the most educational part — which hands are just in vs just out.
**Fix:** Let students drag a range width slider. As they widen/narrow the range,
V/M/B/F letters update live. The boundary distance data is already there.
**Files:** `hand-grid.tsx` (new interactive mode)
**Dependencies:** C1 (async MC hook) so the grid recomputes efficiently.

### V3: Frequency display mode
**Source:** Poker student, senior poker dev
**Problem:** Binary in/out doesn't show "76s opens 43% from UTG." Students want to see
the mixed frequencies that solvers produce.
**Fix:** Grid cells show frequency percentage instead of (or alongside) binary outline.
Color gradient by frequency.
**Files:** `hand-grid.tsx` display, `preflopRanges.ts` data
**Dependencies:** D2 (frequency maps) — can't display frequencies without frequency data.

## Implementation Order (by dependencies)

```
Phase A: Bugs (no dependencies, fix immediately)
  B1: All-in shove classification
  B2: Heads-up BvB detection

Phase B: Data cleanup (independent, prepares for bigger changes)
  D1: Move inline limp range to preflopRanges.ts
  C3: Deduplicate shared constants (RL, GRID_TO_RANK, getHeroHandClass)
  C4: Clean up re-exports

Phase C: React layer cleanup (independent of data changes)
  C1: Extract async MC equity hook
  C2: Extract workspace prop derivation

Phase D: Classification quality (benefits from clean data layer)
  Q1: Hand-specific teaching notes
  Q2: Multiway tightening formula improvement

Phase E: Data evolution (biggest lift, most impact)
  D2: Replace binary Sets with frequency Maps
  D3: Profile-aware limp ranges

Phase F: Visual / UX (depends on data + clean React layer)
  V3: Frequency display mode (depends on D2)
  V2: Interactive range boundary (depends on C1)
  V1: Guided learning path (depends on drill infrastructure)
```

## Priority Matrix

| Item | Impact | Effort | Priority |
|---|---|---|---|
| B1: All-in fix | High (bug) | Low | **Now** |
| B2: HU BvB fix | Medium (edge) | Low | **Now** |
| D1: Limp range cleanup | Low | Low | **Soon** |
| C3: Deduplicate constants | Low | Low | **Soon** |
| C4: Clean re-exports | Low | Low | **Soon** |
| C1: Async MC hook | Medium | Medium | **Next** |
| C2: Workspace prop extraction | Medium | Medium | **Next** |
| Q1: Hand-specific notes | High | Medium | **Next** |
| Q2: Multiway formula | Medium | Medium | **Later** |
| D2: Frequency maps | **Very High** | **High** | **Major milestone** |
| D3: Profile-aware limps | Medium | Medium | **After D2** |
| V3: Frequency display | High | Medium | **After D2** |
| V2: Range boundary | High | Medium | **After C1** |
| V1: Guided learning | High | High | **Future** |

## Notes

- D2 (frequency maps) is the **inflection point**. Everything before it improves the
  binary-range architecture. Everything after it requires the frequency data.
- V2 (interactive range boundary) is the product designer's "breakthrough" — it uses
  data we already compute (`boundaryDistance`) but hide from the user.
- V1 (guided learning path) is the biggest UX gap but requires Convex persistence
  and is architecturally separate from the grid pipeline.
- Q1 (hand-specific notes) delivers the most immediate user-visible improvement
  for the least architectural risk.
