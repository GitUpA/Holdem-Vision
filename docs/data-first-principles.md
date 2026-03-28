# Data Quality Framework — From First Principles

## Reference: `docs/first-principles.md`

## The Fundamental Problem

Perfect GTO solver data for every position × every hand × every board × every action history = ~10^160 unique game states. Impractical.

We approximate. The question: **how close are we to the right answer, and how do we know?**

## Layer 1: What Makes a Poker Decision "Correct"

A decision is correct if it matches the Nash Equilibrium strategy for that exact game state. The NE strategy produces **frequency distributions**: "with AKo from CO facing a BTN 3-bet, call 60%, 4-bet 35%, fold 5%."

The frequencies depend on the FULL context: cards, board, positions, stacks, pot, and every prior action.

## Layer 2: How We Approximate

Each approximation trades precision for coverage:

| Level | What It Does | Precision | Coverage |
|---|---|---|---|
| Exact solver | Runs solver on THIS board/range/tree | 100% | ~200 boards |
| Archetype aggregate | Averages across similar boards | ~95% | 8 texture types |
| Hand-class data | Per AKo/T9o across boards | ~90% | 169 classes |
| Category data | Per "top pair"/"air" across hands | ~80% | 14 categories |
| Validated ranges | Binary in/out (raise or fold) | Direction only | Full coverage |
| Equity heuristic | Hand strength vs pot odds | ~60% | Full coverage |

**Key insight:** Each level is "good enough" when the TOP ACTION GAP is large. If GTO says fold 80% / call 15% / raise 5%, even category-level data gets this right. The precision only matters in CLOSE SPOTS (40/35/25 splits).

## Layer 3: Measuring Confidence Mathematically

For any frequency estimate with N samples and standard deviation σ:

```
Standard Error = σ / √N
95% Confidence Interval = frequency ± 1.96 × SE
```

If fold frequency = 40%, σ = 15%, N = 25:
- SE = 15% / √25 = 3%
- CI = 40% ± 5.9% → true fold is between 34% and 46%
- The DIRECTION (fold > call) is clear
- The EXACT PERCENTAGE is ±6%

**The "good enough" threshold:** When `topActionGap > 2 × CI`, no reasonable data improvement would flip the recommendation. The answer is settled.

## Layer 4: The Statistical Sweet Spots

Where does more data help most?

| Investment | Current | Marginal Value | Cost |
|---|---|---|---|
| 25→40 boards per archetype | 24 boards | SE drops 26% | 16 boards |
| 40→100 boards per archetype | 40 boards | SE drops 37% more | 60 boards |
| N=5→30 preflop samples | N≈5 | Direction confirmed, freq ±10% | Needs solver runs |
| Turn/river facing-bet | 0 boards | NEW CAPABILITY (currently heuristic) | Parse from existing |
| Per-hand-class postflop | Category level | Finer granularity | Already in solver data |

**Sweet spot:** 25-40 boards per archetype gives most value. Beyond 40, diminishing returns. For preflop, N=30 per hand-class is the minimum for frequency confidence.

## Layer 5: What We Have vs What We Need

### Current Data Inventory

| Source | Quality | Coverage | Key Issue |
|---|---|---|---|
| Postflop solver (flop) | High | 8 archetypes × 24 boards | ✓ Good |
| Postflop solver (turn/river) | High | 8 archetypes × 24 boards | Missing facing-bet |
| Flop facing-bet | High | 8 archetypes | ✓ Just parsed |
| PokerBench RFI | Moderate | 512 cells, 67% low-sample | Noisy but directional |
| PokerBench BB Defense | Moderate-Good | 504 cells, 14% reliable | Best preflop source |
| PokerBench 3-bet | WRONG LABEL | 548 cells, 47% reliable | Data is "facing 3-bet" not "making 3-bet" |
| PokerBench 4-bet | WRONG LABEL | 422 cells, 23% reliable | Data is "facing 4-bet" |
| PokerBench BvB | WRONG LABEL | 206 cells, 4% reliable | Perspective unclear |
| Validated ranges | Correct direction | Full preflop coverage | No frequency granularity |
| Equity tables | Approximate | 14 × 4 entries | Lookup, no MC needed |

### The Label Swap Opportunity

PokerBench `three_bet_pots` data is actually "hero facing a 3-bet after opening." This is EXACTLY what our `four_bet_five_bet` archetype needs! And PokerBench `four_bet_five_bet` is "hero facing a 4-bet" — even deeper.

| PokerBench Label | What It Actually Is | Our Archetype | Action |
|---|---|---|---|
| `three_bet_pots` | Hero faces 3-bet after opening | `four_bet_five_bet` (facing 3-bet) | SWAP |
| `four_bet_five_bet` | Hero faces 4-bet after 3-betting | Beyond current archetypes | USE for deep 4-bet defense |
| `blind_vs_blind` | Unclear perspective | Skip | KEEP using validated ranges |

### What's Missing After Swap

| Spot | Current Source | After Swap | Still Missing? |
|---|---|---|---|
| Hero opening (RFI) | PokerBench ✓ | Same | No |
| BB defending vs raise | PokerBench ✓ | Same | No |
| Hero deciding to 3-bet | Validated ranges (binary) | Same | YES — needs solver data |
| Hero facing 3-bet | Validated ranges (binary) | PokerBench (was mislabeled) ✓ | No |
| Hero facing 4-bet | Validated ranges (binary) | PokerBench (was mislabeled) ✓ | No |
| BvB | Validated ranges (binary) | Same | YES — needs solver data |
| Turn/river facing-bet | Heuristic | Parse from existing | Partially fixable |

## Layer 6: The Unified Confidence Type

Every frequency lookup returns confidence alongside the frequency:

```typescript
interface DataConfidence {
  /** Overall 0-1 score */
  score: number;
  /** Statistical precision */
  precision: { standardError: number; sampleCount: number; ci95HalfWidth: number };
  /** How well data matches actual game state */
  representational: { score: number; abstractions: string[] };
  /** Data source identifier */
  source: DataSource;
  /** Pre-computed coaching implications */
  implications: {
    maxEvImpactBB: number;
    couldFlipOptimal: boolean;
    tier: "solver-verified" | "high-confidence" | "directional" | "approximate" | "speculative";
    description: string;
  };
}
```

**Coaching language by tier:**
- `solver-verified`: "GTO strongly recommends fold here (52%)"
- `high-confidence`: "GTO recommends fold"
- `directional`: "GTO leans toward fold — this is a close spot"
- `approximate`: "Our best estimate suggests fold"
- `speculative`: "Without better data, we suggest fold as the safer option"

## Implementation Plan

### Phase 1: Swap PokerBench Labels (data fix, high impact)

Remap PokerBench data to the correct archetypes:
- `three_bet_pots.json` → use as data source for `four_bet_five_bet` archetype (hero facing 3-bet)
- `four_bet_five_bet.json` → use for deep 4-bet+ defense spots
- Keep `rfi_opening.json` and `bb_defense_vs_rfi.json` as-is

**Files:** `frequencyLookup.ts`, possibly `preflopHandClassData.ts`

### Phase 2: Parse Turn/River Facing-Bet Data

Run `parseFacingBet.mjs` on turn/river solver outputs (same format as flop).
Wire into `facingBetTables.ts`.

**Files:** `parseFacingBet.mjs`, `facingBetTables.ts`

### Phase 3: DataConfidence Type + Builder

Create `convex/lib/gto/dataConfidence.ts` with the unified type and per-source builders.
Wire into `GtoLookupResult` in `frequencyLookup.ts`.

**Files:** `dataConfidence.ts` (NEW), `frequencyLookup.ts`

### Phase 4: Confidence-Aware Engine

- Scoring: widen verdict thresholds when confidence is low
- Engine: slightly flatten distribution when uncertain
- Coaching: tier-based language in commentator

**Files:** `evScoring.ts`, `modifiedGtoEngine.ts`, `handCommentator.ts`

### Phase 5: Data Investment Planner

Function that identifies highest-ROI data gaps by computing:
`(spot frequency in real play) × (1 - confidence) × (pot size)`

**Files:** `dataInvestmentPlanner.ts` (NEW)

## Verification

1. Coaching audit: 1000 hands, 0 critical issues
2. GTO vs GTO: converges to ~0 over 20K hands
3. Profile ordering: GTO near top of rankings
4. Confidence tiers: solver data → "solver-verified", validated ranges → "directional"
5. PokerBench swap: KK facing 3-bet shows call 85% (correct for FACING 3-bet)

## Summary: 5 Key Points

1. **Perfect data is impossible** — 10^160 game states. We approximate by aggregating across similar boards, hand classes, and categories. Each level trades precision for coverage.

2. **"Good enough" has a mathematical definition** — When the gap between the top two actions exceeds twice the confidence interval, more data cannot change the answer. Most decisions are clear; the close ones are close by definition (small EV difference).

3. **Confidence has two components** — statistical precision (how many data points) and representational fit (how well our abstraction matches reality). Both must be high for the recommendation to be strong.

4. **The label swap is free value** — PokerBench 3-bet data IS good data, just mislabeled. It represents "facing a 3-bet" which is exactly our `four_bet_five_bet` archetype. Swapping the labels gives us high-quality per-hand frequencies for free.

5. **Surface uncertainty to the user** — "GTO strongly recommends" vs "GTO leans toward" teaches the user that poker advice has confidence levels. Close spots are inherently close; the skill is recognizing when the answer is clear vs when it's a judgment call.
