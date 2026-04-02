# Preflop Improvements Roadmap

Consolidated from 6 independent reviews (senior poker dev, React architect, poker student,
data architect, adversarial QA, product designer). Ordered by dependencies and logic.

**Updated 2026-04-02** with implementation progress and round 2 reviewer feedback.

## Bugs (fix first — wrong behavior)

### B1: All-in shove invisible to classifier ✅ DONE
**Source:** Adversarial QA (silent failure risk 4/10)
**Problem:** `classifySituationFromState` excluded `all_in` from raise counting.
**Fix:** Walk actions chronologically tracking running bet level. Count `all_in` as raise
only when `amount > currentBetLevel`. 5 edge case tests added.
**Commit:** `795b4d7` (Phase A)

### B2: Heads-up never triggers blind_vs_blind ✅ DONE
**Source:** Adversarial QA (edge case handling 5/10)
**Problem:** BTN is SB in HU but `blinds.has("btn")` was false.
**Fix:** `isBlind(pos, tableSize)` helper — recognizes BTN as SB when `tableSize === 2`.
Also fixed `isSBComplete` for HU where BTN completes. 4 edge case tests added.
**Commit:** `795b4d7` (Phase A)

## Data Layer Improvements

### D1: Move inline limp range to preflopRanges.ts ✅ DONE
**Source:** Data architect (single source of truth 8/10)
**Fix:** Exported `GTO_GENERIC_LIMP_RANGE` from `preflopRanges.ts`. Resolver imports it.
**Commit:** `0f09e07` (Phase B)

### D2: Replace binary range Sets with frequency Maps ⏸️ RECONSIDERED
**Source:** Senior poker dev, poker student, data architect (all three — round 1)
**Round 2 reversal:** All three reviewers independently reversed this recommendation:
- **Senior poker dev (9.3/10):** *"I was wrong. Binary ranges + boundary distance + teaching
  notes is a better pedagogical model than raw solver frequencies."*
- **Poker student (8.5/10):** *"My brain is binary: do I open this or not? A percentage gives
  me false precision I can't act on."*
- **Product designer:** *"Raw frequencies are expert notation, not learning material. They are
  the answer key, not the lesson."*

**New direction:** Instead of exposing raw frequencies, use frequency data internally to power:
- **Confidence labels** ("always" / "usually" / "depends on reads" / "rarely") derived from
  `boundaryDistance` — the senior poker dev's concrete suggestion
- **Visual gradient** (cell opacity/saturation maps to boundary distance) — the product
  designer's recommendation for beginners
- **Interactive boundary slider** (V2) — the product designer's breakthrough suggestion

The `complete_preflop_tables.json` (3380 cells with fold/call/raise frequencies) exists and
can power these features internally. The data serves the system, not the display.

### D3: Profile-aware limp ranges — NOT STARTED
**Source:** Senior poker dev, data architect
**Problem:** `limper_by_profile` returns generic fish range regardless of opponent profile.
**Status:** `GTO_GENERIC_LIMP_RANGE` in place as default. Profile-aware resolution requires
threading profile data through the grid pipeline.

## Code Quality / DRY

### C1: Extract async MC equity into a hook ✅ DONE
**Source:** React architect (component complexity 4/10)
**Fix:** Created `src/hooks/use-async-equity.ts`. ~70 lines of MC computation extracted from
`hand-grid.tsx`. Component calls hook with `(opponentRange, cacheKey)`, gets
`{equityMap, isComputing, progress}`.
**Commit:** `c514587` (Phase C)

### C2: Extract workspace prop derivation ✅ DONE
**Source:** React architect (prop drilling 5/10)
**Fix:** 5 IIFEs in workspace-shell.tsx replaced with single `gridPreflopProps` useMemo.
Derives facingPosition, preflopActions, numCallers, numLimpers in one computation.
**Commit:** `c514587` (Phase C)

### C3: Deduplicate shared constants ✅ DONE
**Source:** React architect
**Fix:** `RANK_LABELS`, `GRID_TO_RANK`, `getHeroHandClass` centralized in
`convex/lib/preflop/rangeUtils.ts`. Removed duplicates from `preflopGrid.ts`,
`hand-grid.tsx`, `handGrid.ts`.
**Commit:** `0f09e07` (Phase B)

### C4: Clean up re-exports ✅ DONE
**Source:** Data architect
**Fix:** Re-exports kept in `preflopGrid.ts` for backward compat (normalize6Max,
compressRangeByStack, getHeroHandClass). `hand-grid.tsx` imports directly from
`preflop/rangeUtils.ts`.
**Commit:** `0f09e07` (Phase B)

## Classification / Coaching Quality

### Q1: Hand-specific teaching notes ✅ DONE
**Source:** Poker student (teaching notes 7/10 → 8.5/10 after fix)
**Fix:** Added `handInsight()` function with hand-category-specific coaching text.
Pairs get set-mining/value notes, suited aces get flush potential, suited connectors get
board coverage, broadways get domination warnings. Wired into all classify functions.
**Commit:** `92c5e62` (Phase D)

### Q2: Multiway tightening formula ✅ DONE
**Source:** Senior poker dev
**Fix:** Distinguished callers from limpers. Callers of a raise: 15BB penalty each (crosses
compression threshold at 2+). Limpers: 8BB penalty each (capped ranges less threatening).
**Commit:** `92c5e62` (Phase D)

## Visual / UX

### V1: Guided learning path — NOT STARTED
**Source:** Product designer (discoverability 6/10 → 7.5/10 after improvements)
**Problem:** No scaffolded progression. No "you mastered RFI, now try BB defense."
**Plan:** Situation-based learning progression using registry's `drillPriority`.
**Product designer round 2:** Progressive disclosure by skill level:
- Beginners (< 50 hands): gradient + categories ("always/sometimes/never")
- Intermediate (50-500): contextual rules on hover
- Advanced (500+): raw data + interactive slider
**Dependencies:** Convex persistence for progress tracking.

### V2: Interactive range boundary — NOT STARTED
**Source:** Product designer (breakthrough suggestion, confirmed in round 2)
**Problem:** `boundaryDistance` is computed but hidden from students.
**Fix:** Let students drag a range width slider. V/M/B/F letters update live.
**Product designer round 2:** *"The slider is the breakthrough tool. Dragging the boundary
and watching which hands flip builds deep intuition about range construction that no
amount of reading frequencies achieves."*
**Dependencies:** C1 (async MC hook) ✅ DONE.

### V3: Frequency display mode → REPLACED by confidence labels + visual gradient
**Source:** Poker student, senior poker dev (round 1)
**Round 2 reversal:** Raw frequency display is NOT the right approach for a learning platform.
**New items replacing V3:**

**V3a: Confidence labels** (from senior poker dev round 2)
Add `"always" | "usually" | "depends_on_reads" | "rarely"` derived from `boundaryDistance`.
Maps numeric distance to natural language students can internalize during play.
The `boundaryDistance` number is an implementation detail; the confidence label is the teaching tool.

**V3b: Visual gradient** (from product designer round 2)
Cell opacity/saturation maps to boundary distance (not raw frequency).
Gives spatial intuition without numbers. Beginners see the gradient, advanced see the numbers.
*"The gradient gives spatial intuition without numbers."*

## Implementation Order (updated)

```
Phase A: Bugs ✅ DONE
  B1: All-in shove classification ✅
  B2: Heads-up BvB detection ✅

Phase B: Data cleanup ✅ DONE
  D1: Move inline limp range ✅
  C3: Deduplicate shared constants ✅
  C4: Clean up re-exports ✅

Phase C: React layer cleanup ✅ DONE
  C1: Extract async MC equity hook ✅
  C2: Extract workspace prop derivation ✅

Phase D: Classification quality ✅ DONE
  Q1: Hand-specific teaching notes ✅
  Q2: Multiway tightening formula ✅

Phase E: Pedagogical features (replaces "frequency maps")
  V3a: Confidence labels ("always/usually/depends/rarely")
  V3b: Visual gradient (boundaryDistance → cell opacity)
  D3: Profile-aware limp ranges

Phase F: Interactive / Discovery
  V2: Interactive range boundary slider
  V1: Guided learning path (Convex persistence)
```

## Updated Priority Matrix

| Item | Impact | Effort | Status |
|---|---|---|---|
| B1: All-in fix | High | Low | ✅ Done |
| B2: HU BvB fix | Medium | Low | ✅ Done |
| D1: Limp range cleanup | Low | Low | ✅ Done |
| C3: Deduplicate constants | Low | Low | ✅ Done |
| C4: Clean re-exports | Low | Low | ✅ Done |
| C1: Async MC hook | Medium | Medium | ✅ Done |
| C2: Workspace prop extraction | Medium | Medium | ✅ Done |
| Q1: Hand-specific notes | High | Medium | ✅ Done |
| Q2: Multiway formula | Medium | Medium | ✅ Done |
| ~~D2: Frequency maps~~ | ~~Very High~~ | ~~High~~ | ⏸️ Reconsidered |
| V3a: Confidence labels | High | Low | **Next** |
| V3b: Visual gradient | High | Medium | **Next** |
| D3: Profile-aware limps | Medium | Medium | **Later** |
| V2: Range boundary slider | **Very High** | Medium | **Next** |
| V1: Guided learning | High | High | **Future** |

## Round 2 Reviewer Scores

| Reviewer | Round 1 | Round 2 | Key Feedback |
|---|---|---|---|
| Senior Poker Dev | 8/10 | **9.3/10** | "I was wrong about frequencies. Binary + boundary distance is better pedagogy." |
| Poker Student | 7/10 notes | **8.5/10** | "handInsight is a real improvement. Iso-raise spots are great additions." |
| Product Designer | 6/10 discover | **7.5/10** | "Gradient + boundary slider is the breakthrough. Frequencies are expert notation." |

## Key Insight from Round 2

The original Phase E ("replace binary Sets with frequency Maps") was an engineering solution
to a product problem. The reviewers converged on a better answer: **use the data we already
have (`boundaryDistance`) to power visual and linguistic feedback that matches how humans
learn poker.** The frequency data in `complete_preflop_tables.json` exists and can power
internal computations, but exposing raw percentages to students is counterproductive.

The path forward is confidence labels + visual gradient + interactive boundary slider.
These use the existing `boundaryDistance` mechanism — no data layer changes needed.
