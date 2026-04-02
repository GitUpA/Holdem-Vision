# Grid ↔ Coaching Convergence Plan

The grid pipeline (new, clean) and coaching pipeline (old, independent) compute much of the
same information through separate code paths. This document maps every function to one of
three buckets and defines the convergence path.

## The Principle

The grid pipeline produces the **factual foundation** (situation, ranges, equity, recommendation).
The coaching **consumes** that foundation and adds the **narrative layer** (opponent reads,
exploit advice, teaching context, words). Coaching never independently classifies situations
or computes equity.

## Bucket A: Grid Already Does It Better (remove from coaching)

These coaching computations are redundant — the grid pipeline does the same thing
with cleaner architecture.

| What | Coaching Code | Grid Replacement |
|---|---|---|
| Situation classification | Ad-hoc raise counting in commentator | `classifySituationFromState()` in registry |
| Opponent range | Ad-hoc range filtering in opponentStory | `resolveOpponentRange()` in situationRanges |
| Hero range | Scattered range lookups | `resolveHeroRange()` in situationRanges |
| Hero hand strength | `evaluateHeroStrength()` in opponentStory | `handCat` from hand categorizer (already computed) |
| Equity vs range | `equityVsRange()` in opponentStory (own MC) | `computeEquityGrid()` in preflopGrid (same algorithm) |
| Action recommendation | `computeAdjustedAction()` in opponentStory | `classifyFacing()` → V/M/B/F in preflopGrid |
| Preflop hand classification | Fake GTO percentages | `classifyPreflopHand()` → range-based classification |

**Action:** These coaching functions should receive grid output as input, not recompute.

## Bucket B: Coaching Has Unique Value (add to grid architecture)

These computations exist only in coaching but belong in the pipeline — they enrich
the factual foundation. They should live in the architecture as structured data,
computed alongside the grid result, available to any consumer.

| What | Coaching Source | Why It Belongs in Architecture |
|---|---|---|
| **Opponent behavioral inference** | `buildInferredProfile()` in behaviorInference | Detects tight/loose/aggressive/passive from actions. This is data, not narrative. The grid should know what kind of opponent hero faces. |
| **Observation confidence** | opponentStory confidence logic | Distinguishes "strong read" (3+ actions) from "speculative" (1 action). This affects how much weight to give the range estimate. |
| **SPR / pot-committed detection** | buildRecommendation SPR logic | When SPR < 0.5, hero can't fold. This is arithmetic, not narrative. The grid should flag it. |
| **Equity-based GTO adjustment** | coachingLens lines 180-245 | Scales GTO frequencies based on opponent equity estimate. This is math that should happen before the V/M/B/F classification, not after. |
| **MDF spot detection** | buildRecommendation MDF logic | When equity is poor but bluff-catching has value. The V/M/B/F system should distinguish "B" (bluff-catch) from "F" (fold) here. |
| **Pot odds override** | buildRecommendation override logic | When equity clearly beats pot odds, override GTO fold. This is arithmetic. |

**Action:** These become optional fields on `PreflopGridResult` (or a general `GridResult`
when postflop is built). The grid pipeline computes them. Coaching reads them.

## Bucket C: Genuinely Coaching-Only (narrative layer)

These are about **words**, not data. They take grid output + bucket B enrichments
and produce human-readable teaching text. They stay in the coaching layer.

| What | File/Function | Input From |
|---|---|---|
| Scene-setting narrative | `buildPreflopScene()` | Situation context (registry) |
| Board texture narrative | `buildPostflopScene()` | Community cards + archetype |
| Opponent story paragraph | `buildOpponentSection()` | Inferred profile + range estimate (B) |
| Hero assessment paragraph | `buildHeroAssessment()` | Hand categorization + equity (A) |
| Action explanation | `buildRecommendation()` text | V/M/B/F + pot odds + SPR (A+B) |
| GTO confirmation | `buildGtoConfirmation()` | Frequencies + confidence (A) |
| Summary line | `buildSummary()` | Recommended action (A) |
| Hand-specific insight | `handInsight()` | Hand class + situation (A) |
| Street-by-street interpretation | `buildStreetNarratives()` | Action history + range narrowing |
| Consensus explanation | `detectConsensus()` text | Multi-profile comparison |

**Action:** These functions stay. But they should receive grid/pipeline data as input
parameters, never recompute it. The commentator becomes a pure rendering function:
`renderCoaching(gridResult, enrichments) → narrative string`.

## Convergence Architecture

### Before (current — parallel pipelines)

```
GameState ──→ Grid Pipeline ──→ PreflopGridResult ──→ hand-grid.tsx (visual)
GameState ──→ Coaching Pipeline ──→ CoachingValue ──→ coaching-section.tsx (narrative)
           (recomputes situation, ranges, equity independently)
```

### After (converged — coaching consumes grid)

```
GameState ──→ Grid Pipeline ──→ GridResult
                                  │
                                  ├──→ hand-grid.tsx (visual)
                                  │
                                  ├──→ Enrichment Layer (B)
                                  │     ├── opponent profile inference
                                  │     ├── confidence scoring
                                  │     ├── SPR / pot-committed
                                  │     ├── pot odds override
                                  │     └── MDF detection
                                  │
                                  └──→ Narrative Layer (C)
                                        ├── scene text
                                        ├── opponent story
                                        ├── hero assessment
                                        ├── recommendation prose
                                        └── coaching-section.tsx (narrative)
```

## What This Means for Postflop

When we build the postflop grid (flop/turn/river layers), the same pattern applies:

1. **Grid pipeline** computes board texture, hand strength vs board, draw detection,
   villain range narrowing by street — all as structured data
2. **Enrichment layer** adds opponent behavioral reads, confidence, SPR tracking
3. **Narrative layer** renders it as coaching text

The postflop coaching doesn't need its own board analysis, equity computation, or
range narrowing. It reads from the grid pipeline. This is why getting the architecture
right NOW (before postflop) matters — we don't want to build a second parallel pipeline
for flop/turn/river.

## Implementation Priority

### Do Before Postflop

1. **Remove Bucket A redundancies** — coaching functions that recompute grid data
   should accept grid output as parameters instead
   - `evaluateHeroStrength()` → accept `handCat` parameter
   - `computeAdjustedAction()` → use `classifyFacing()` result
   - `equityVsRange()` → share MC function or accept pre-computed equity

2. **Add Bucket B enrichments to pipeline** — these are data computations that
   should happen once, not in the coaching layer
   - SPR calculation (simple arithmetic)
   - Pot odds override detection (simple arithmetic)
   - Confidence from observation count

3. **Wire coaching to consume grid** — `commentateHand()` receives `GridResult`
   as primary input, not raw game state

### Do After Postflop Grid Exists

4. Move opponent behavioral inference into the pipeline
5. Move MDF detection into the pipeline
6. Move equity-based frequency adjustment into the pipeline
7. Narrative layer becomes a pure renderer

## What NOT to Change

- **Multi-profile comparison** stays in coaching (the grid is single-path)
- **Narrative rendering** stays in coaching (the grid is data, not prose)
- **Action story text** stays in coaching (per-action explanations are words)
- **Consensus detection** stays in coaching (multiple engines is a coaching concept)
