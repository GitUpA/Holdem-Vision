# Visual First Principles — Vision Hand Grid

The Vision Hand Grid is a layered teaching tool that builds up from poker first principles. Each layer adds one concept. Layers are additive — toggle any off and the layers beneath still work.

## Architecture

```
Layer 5: Facing (what should I do?)         ← letter in cell, slider
Layer 4: Equity vs Range (MC computed)      ← recalculates all 169 cells
Layer 3: Position Ranges (multi-select)     ← gold outline + cyan corner
Layer 2: Equity Heatmap (toggle)            ← color + percentage in cell
Layer 1: The 13×13 Grid                     ← hero highlighted, hand types colored
```

## Layer 1: The Grid

Standard 13×13 hand class layout. 169 cells covering every possible starting hand.
- **Diagonal** = pairs (AA, KK, ... 22)
- **Above diagonal** = suited (AKs, AQs, ...)
- **Below diagonal** = offsuit (AKo, AQo, ...)
- **Hero's hand** = blue cell
- **Blocked cells** (hero/board cards remove combos) = dimmed

**What it teaches:** The full hand universe. Every poker decision starts here.

**Component:** `src/components/analysis/hand-grid.tsx`
**Computation:** `convex/lib/analysis/handGrid.ts` (pure TS for headless/tests)

## Layer 2: Equity Heatmap

Toggle "Equity" button in the header. Each cell shows its raw preflop equity vs a random hand. Cells colored hot-to-cold:
- 75%+ red (premiums: AA, KK)
- 65%+ orange (strong: AKs, QQ)
- 58%+ amber (playable: AJs, TT)
- 52%+ yellow (marginal: 99, KTs)
- 46%+ green (weak playable: 87s, A9o)
- 42%+ blue (weak: Q8o, J7s)
- Below: slate (junk: 72o, 83o)

Header shows: "X stronger, Y same, Z weaker" relative to hero's hand.

**Data source:** `convex/lib/gto/preflopEquityTable.ts` — 9 lookup tables (1-9 opponents), computed via 100K MC trials each. The table is selected based on the number of active opponents: UTG at 6-max sees 5-opponent equity (AA = 49%), BTN sees 2-opponent equity (AA = 73%).

**What it teaches:** Relative hand strength in context. AA isn't 85% when 5 opponents are behind you — it's 49%. Position matters even for premiums.

## Layer 3: Position Ranges

Second header bar with position buttons: Hero(BTN), UTG, HJ, CO, BTN, SB.

**Single-click behavior:**
- Click any non-hero position → hero auto-selects as primary + that position as secondary
- Click Hero → toggle hero's range on/off independently
- Click a selected position again → deselect

**Visual overlay (two distinct indicators):**
- **Primary range (hero):** gold ring outline around in-range cells
- **Secondary range (opponent):** cyan triangle in top-right corner
- **Both ranges:** gold ring + cyan corner (no visual competition)
- **Neither range:** cell fades to 30% opacity

Header shows: "BTN ~44% vs CO ~27%" when comparing two positions.

**Data source:** Range data in `convex/lib/gto/tables/preflopRanges.ts`, resolved by `convex/lib/preflop/situationRanges.ts`. The range shown depends on the situation (classified by `convex/lib/preflop/situationRegistry.ts`):
- **RFI:** `GTO_RFI_RANGES` per position
- **Facing open:** cold-call + 3-bet ranges (or BB defense by opener)
- **Facing limpers:** `GTO_ISO_RAISE_RANGES` per position
- **BB vs limpers:** `GTO_BB_RAISE_VS_LIMPERS` keyed by limper count
- **BB vs SB complete:** `GTO_BB_RAISE_VS_SB_COMPLETE`

**What it teaches:** Position determines range width. UTG opens tight (15%), BTN opens wide (44%). But range also depends on situation — facing limpers, BB gets a free flop, iso-raising is different from opening.

## Layer 4: Equity vs Range

When an opponent's range is selected (secondary position), all 169 cells recalculate equity against that specific range via Monte Carlo.

- ~169 hand classes × 300 MC trials
- Computes asynchronously in chunks (13 cells per animation frame)
- Progress indicator: "computing 45%" pulses in header
- Results cached per position — toggling off/on is instant
- When deselected, equity reverts to vs random

**Example:** Q9o drops from 55% (vs random) to ~40% (vs HJ's 19% range). The heatmap shifts, the facing letter updates, everything reflects the real matchup.

**What it teaches:** Raw equity ≠ equity in context. Your hand's value changes dramatically based on who you're against.

## Layer 5: Facing

Third header bar showing who bet and how much: "Facing: HJ 3.0BB"

- Auto-syncs to the live game state (who raised, how much)
- Slider adjustable 0-20BB for exploration
- Each cell shows a letter in the **bottom-right corner**

**Letters (range-first classification):**
- **V** (green) = Value — call or raise, you're ahead
- **M** (white) = Mixed — borderline, depends on reads
- **B** (amber) = Bluff-catch — thin call, opponent may be bluffing
- **F** (red/dim) = Fold — not in your continue range or not enough equity

**Range-first rule:** If the hand is not in hero's continue range for this position (cold-call + 3-bet + mixed ranges), it's **F** regardless of equity. J8o on BTN shows F even at 44% equity because it's not playable.

**Data sources:**
- `GTO_COLD_CALL_RANGES` + `GTO_3BET_RANGES` + `GTO_3BET_MIXED` for hero's continue range
- MC equity vs opponent range for the V/M/B threshold
- `classifyFacing()` function combines range membership + equity + pot odds

**What it teaches:** "Should I play this hand facing this bet?" — one letter, one answer. Equity alone doesn't make a hand playable.

## Postflop Transition

When community cards arrive (flop/turn/river), the grid transforms:
- Preflop layers (equity heatmap, position ranges, facing) hide
- Each cell colors by whether that hand class beats hero on the actual board
- Red = beats hero, Green = hero wins, Yellow = tie
- Header shows: "X beat, Y tie, Z win" combo counts
- Exhaustive enumeration of all ~1200 possible opponent holdings using `evaluateHand()`

**What it teaches:** "What can beat me right now?" — the student sees the threat landscape instantly.

## Key Files

| File | Purpose |
|------|---------|
| `src/components/analysis/hand-grid.tsx` | React component — all UI + MC computation |
| `convex/lib/analysis/preflopGrid.ts` | Preflop grid orchestrator (calls registry + range resolver) |
| `convex/lib/analysis/handGrid.ts` | Postflop grid computation (for headless/tests) |
| `convex/lib/preflop/situationRegistry.ts` | Situation classification — single source of truth (10 situations) |
| `convex/lib/preflop/situationRanges.ts` | Range resolution — maps situation → actual range data |
| `convex/lib/preflop/rangeUtils.ts` | Shared utils: normalize6Max, compressRangeByStack |
| `convex/lib/gto/preflopEquityTable.ts` | 9 equity tables (1-9 opponents, 100K MC each) |
| `convex/lib/gto/tables/preflopRanges.ts` | GTO ranges: RFI, defense, iso-raise, BB vs limpers, SB complete |
| `src/components/workspace/workspace-shell.tsx` | Hosts the grid, passes game state props |

## Props Interface

```typescript
interface HandGridProps {
  heroCards: number[];           // Hero's 2 hole cards (CardIndex)
  communityCards?: number[];     // Community cards (0-5)
  heroPosition?: string;        // Hero's position ("btn", "co", etc.)
  facingBetBB?: number;         // Current bet to call in BB
  facingPosition?: string;      // Position of the bettor ("hj", "utg", etc.)
  stackDepthBB?: number;        // Stack depth in BB (default 100)
  numCallers?: number;           // Cold-callers of a raise (excludes limpers)
  numLimpers?: number;           // Pre-raise calls (limps)
  numPlayers?: number;           // Table size 2-10 (default 6)
}
```

## Situation Registry

All preflop classification flows through a single registry (`convex/lib/preflop/situationRegistry.ts`). Each situation defines its ID, engine key, range sources, opponent count rule, and coaching metadata. The classifier is a pure function — given game state inputs, returns exactly one `PreflopSituationContext`.

10 situations: `rfi`, `facing_open`, `facing_open_multiway`, `facing_3bet`, `facing_4bet`, `blind_vs_blind`, `facing_limpers`, `bb_vs_limpers`, `bb_vs_sb_complete`, `bb_uncontested`.

Full taxonomy and design: `docs/preflop-situations.md`
Implementation plan: `docs/plans/situation-registry-plan.md`

## Precision Analysis — Where the Math Is and Isn't Exact

Each layer builds on the one below. The precision boundary is clear: Layers 1-2 are mathematically grounded. Layer 3 introduces approximation. Everything above inherits that approximation.

### Layer 1 — The Grid: EXACT
The 13×13 hand class matrix is a mathematical fact. 169 unique starting hand classes, correctly mapped to rank/suit combinations. No approximation.

### Layer 2 — Equity vs N Opponents: COMPUTED (~0.3% precision)
9 equity tables (1-9 opponents) computed via our own Monte Carlo (100K trials per hand class) using `evaluateHand()`. Validated against 500K trial runs — top hands match within 0.1%, all within 0.5%. The table adjusts dynamically: UTG at 6-max uses 5-opponent equity, BTN uses 2-opponent equity. As players fold, the opponent count updates and equity reflects the narrowed field.

### Layer 3 — Position Ranges: THE PRECISION BOUNDARY
This is where approximation enters. Two distinct limitations:

**Binary vs continuous.** A solver computes Nash equilibrium frequencies: "76s opens 43% from UTG." Our data stores this as binary: "76s is IN the UTG range" or "76s is NOT." The solver's answer is deterministic — given the same game tree, different solvers converge on the same frequencies. Our binary approximation loses the frequency information.

**Third-party interpretation.** We don't run a solver. We source ranges from published GTO charts (PioSolver summaries, GTO Wizard, Upswing, PokerCoaching). These charts are already simplified summaries of solver output — the chart authors decided where to draw the binary line. Different authors draw it in slightly different places for borderline hands.

**What would fix it:** Running a preflop solver directly would produce exact mixed frequencies per hand class per position. The pipeline architecture already supports this — `PreflopGridCell.equity` and the classification system could display continuous frequencies instead of binary membership. The limitation is data source, not architecture.

### Layer 4 — Equity vs Range (MC): EXACT given its inputs
The Monte Carlo computation is mathematically correct. It samples opponent hands from the given range, deals random boards, and evaluates winners using `evaluateHand()`. The result converges to the true equity with sufficient trials.

**However:** the equity is exact against whatever range Layer 3 provides. If Layer 3's range is wrong (a borderline hand included that shouldn't be, or excluded that should be), the equity is precisely computed against an imprecise input. The MC math adds no error — it inherits Layer 3's approximation.

### Layer 5 — Facing Classification: HEURISTIC
Two sources of approximation:

**Pot odds math is exact.** `callCost / (potSize + callCost)` is pure arithmetic. The pot size computation from blinds + raises + callers is correct.

**Classification thresholds are heuristic.** The boundaries between V/M/B/F (surplus > 0.15 = Value, surplus > 0.05 = Mixed, etc.) are hand-tuned constants, not derived from solver output. They produce reasonable results but are arbitrary — a solver would compute exact calling frequencies rather than discrete buckets.

**Continue range check inherits Layer 3.** The "not in hero's continue range = Fold" rule uses the same binary range data. A hand correctly excluded from the range gets F even if a solver would continue with it 30% of the time.

### Variable Adjustments: DIRECTIONAL HEURISTICS

**Stack depth compression:** "Below 80BB, drop bottom X% of range." The direction is correct (short stacks play tighter) but the formula (linear compression) is a heuristic. Real short-stack ranges are structurally different — they're solved shove/fold charts, not compressed versions of 100BB ranges.

**Multiway callers:** "Each caller reduces effective stack by 15BB." Correct direction (more opponents = tighter) but the 15BB number is made up. Real multiway adjustments depend on the callers' specific ranges and the pot geometry.

**Raise sizing:** "Opens above 4BB drop bottom 8% per BB." Correct direction (larger opens = tighter range) but the formula is a heuristic. A solver would compute different opening frequencies at different sizings.

**Table size normalization:** "MP in 9-max uses HJ ranges from 6-max." Correct direction (MP is middle position) but 9-max MP is actually tighter than 6-max HJ because there are more players behind. The normalization is approximate.

### Summary

| Layer | Precision | What limits it |
|-------|-----------|----------------|
| Grid (13×13) | Exact | Nothing |
| Equity vs N opponents | ~99.7% | 100K MC trials, position-aware (1-9 opponent tables) |
| Position ranges | **Approximate** | Binary simplification of solver frequencies, third-party sourced |
| Equity vs range (MC) | Exact computation | Inherits range approximation from Layer 3 |
| Facing classification | Heuristic | Hand-tuned thresholds, binary continue range |
| Stack/multiway/sizing | Directional | Formulas are heuristics, not solver-computed |

**The single fix that would make everything precise:** solver-computed preflop frequencies per hand class per position. The pipeline architecture is ready for this data — it would replace binary Sets with frequency maps, and every downstream computation would automatically become exact.

## Next Steps

### 1. Headless Audit Integration
Make grid contents writable to audit files so hands can be run headless and grid output validated programmatically. The pure computation in `handGrid.ts` already exists — wire it into the step-by-step test output.

### 2. Smart Defaults
Grid opens with:
- Equity toggle ON
- Hero's position selected as primary range
- Facing position auto-selected as secondary (triggers MC equity calculation)
- Facing slider set to the live bet amount

The student sees the complete picture immediately. They can toggle off layers to simplify.

### 3. Position Action Labels
Position buttons in the Range bar show what each player did:
- "UTG: Open 3" / "CO: Call" / "SB: 3-bet 10" / "BB: —"
- Clicking a position with an action label selects that position's action-appropriate range (open range for raisers, cold-call range for callers, 3-bet range for 3-bettors)

### 4. Betting Slider (hero's story)
"If I bet this much, what story am I telling?" — second slider showing V/M/B/F from the bettor's perspective. Starts at the facing amount (call) and goes up to all-in (raise).

### 5. Villain Range Overlay (postflop)
When community cards arrive, the opponent's preflop range filters the postflop grid. The student sees: "of the hands that beat me, which ones would the opponent actually have given their preflop action?"
