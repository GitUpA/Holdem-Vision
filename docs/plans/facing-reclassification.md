# Facing Reclassification: V/M/B/F → R/B, C, F

## Why

V/M/B/F encodes the WHY (Value/Mixed/Bluff-catch/Fold) in a letter. But the WHY
belongs in the coaching narrative, not a single character. The action — WHAT you do —
is what the grid should show.

Poker has three fundamental actions: raise/bet, call, fold. The grid shows which one.
The coaching explains why. The contrast between equity color and action letter is the lesson.

## The New System

### Letters

| Letter | Meaning | When |
|---|---|---|
| **R** | Raise / Bet | Hand is in the aggressive range — open, iso-raise, 3-bet, c-bet |
| **C** | Call | Hand continues passively — cold-call, defend, over-limp, check |
| **F** | Fold | Hand doesn't play — not in continue range, math doesn't support |

R covers both raise (facing a bet) and bet (opening action). Same aggressive decision.

### Letter Styling

The cell already has its equity heatmap color. The letter sits on that color.
Additional letter styling only when the action DEVIATES from what equity suggests:

| Scenario | Equity Color | Letter | Visual | What It Teaches |
|---|---|---|---|---|
| Strong hand, raise | Red/orange | R | Normal — action matches equity | Obvious play |
| Decent equity, fold | Yellow/green | F | Muted/dim F | "Equity isn't everything — range matters" |
| Low equity, raise (bluff) | Blue/slate | R | Highlighted R | "This is a bluff — blockers/fold equity" |
| Marginal, call | Yellow | C | Normal | "Price is right, see a flop" |
| In range but close | Any | R or C | Subtle border | "Boundary hand — reads matter" |

The deviation IS the lesson. The coaching narrative explains every deviation.

### No Hover

Grid is a glance — one letter, you know your action. Coaching section below the grid
is the full read — situation, hand insight, opponent story, reasoning.

## Derivation

The letter is derived from the same data the grid already computes:

```typescript
function classifyAction(
  equity: number,
  inHeroRange: boolean,
  rangeClass: PreflopRangeClass,
  callCostBB: number,
  potSizeBB: number,
  isOpeningAction: boolean,  // true for RFI, facing_limpers, bb_vs_limpers, bb_vs_sb_complete
): "R" | "C" | "F" {
  // Not in any continue range → fold
  if (!inHeroRange) return "F";
  
  // In raise/3-bet/iso-raise range → raise
  if (rangeClass === "clear_raise" || rangeClass === "raise") {
    return "R";
  }
  
  // Mixed raise/call — show the majority action (call), narrative notes raising is valid
  if (rangeClass === "mixed_raise") return "C";
  
  // In call/defense range → call (or check in opening spots)
  if (rangeClass === "call") return "C";
  
  // Borderline — situation-aware
  if (rangeClass === "borderline") {
    if (isOpeningAction) {
      // RFI / iso-raise / BB check-or-raise: borderline = fold (not strong enough to open)
      return "F";
    }
    // Facing a bet: use equity vs pot odds
    const potOdds = callCostBB / (potSizeBB + callCostBB);
    return equity > potOdds + 0.05 ? "C" : "F";
  }
  
  return "F";
}
```

Key differences from V/M/B/F:
- Uses `PreflopRangeClass` from the registry pipeline (raise/call/fold/borderline)
- No hand-tuned "polarization" thresholds
- No separate "bluff-catch" bucket — if you're calling, you're calling
- `mixed_raise` → C (majority action is call; coaching notes raising is also valid)
- Borderline hands in opening actions → F (not strong enough to open, no "call" possible)
- Borderline hands facing a bet → equity vs pot odds decides C or F
- `isOpeningAction` derived from situation type: true for rfi, facing_limpers,
  bb_vs_limpers, bb_vs_sb_complete, bb_uncontested

### Boundary Distance → Letter Styling

```typescript
type ActionConfidence = "clear" | "standard" | "edge";

function actionConfidence(boundaryDistance: number): ActionConfidence {
  if (boundaryDistance >= 8) return "clear";    // deep in range
  if (boundaryDistance >= 3) return "standard"; // solid range hand
  return "edge";                                // boundary hand
}
```

- `clear` → full opacity letter
- `standard` → normal letter
- `edge` → subtle indicator (border, slight color shift) that says "this is close"

## What Changes

### Replace

| Old | New |
|---|---|
| `SizingRole = "V" \| "M" \| "B" \| "F"` | `ActionLetter = "R" \| "C" \| "F"` |
| `classifyFacing(equity, callCost, pot, inRange)` | `classifyAction(equity, inRange, rangeClass, callCost, pot)` |
| `classifyFacingGrid(equityMap, range, callCost, pot)` | `classifyActionGrid(equityMap, heroRange, rangeClassMap, callCost, pot)` |
| V/M/B/F color constants | R/C/F + confidence styling |

### Needs

The new classifier needs `PreflopRangeClass` per hand — which comes from
`classifyPreflopHand()`. Currently the grid pipeline doesn't run `classifyPreflopHand`
for every cell (it only runs for hero's specific hand in the coaching path).

**Option A:** Run `classifyPreflopHand` for all 169 cells in the grid pipeline.
This gives `rangeClass` per cell, which directly maps to R/C/F.
Cost: 169 calls to a pure function with Set lookups. Fast.

**Option B:** Derive R/C/F from the existing `inHeroRange` boolean + equity.
Simpler but loses the raise/call distinction (inHeroRange is binary — it doesn't
distinguish raise hands from call hands).

**Option A is correct.** The range class IS the data. The grid pipeline should compute
it per cell. This is the same data the coaching uses for hero's hand — extending it
to all 169 cells makes the grid and coaching fully consistent.

### New Field on PreflopGridCell

```typescript
export interface PreflopGridCell {
  handClass: string;
  row: number;
  col: number;
  type: "pair" | "suited" | "offsuit";
  isHero: boolean;
  equity: number;
  action: ActionLetter;              // R, C, or F (replaces facing: SizingRole)
  actionConfidence: ActionConfidence; // clear, standard, or edge
  inHeroRange: boolean;
  inOpponentRange: boolean;
}
```

## Connection to Coaching

The coaching narrative reads the grid result. For hero's hand:

1. Grid cell says `action: "R"`, `actionConfidence: "standard"`
2. Grid has `situation.id: "facing_open"`, `heroEquity: 0.56`
3. `classifyPreflopHand()` already ran for hero → has `reason`, `teachingNote`, `handInsight`
4. Coaching renders: "ATs is in the CO 3-bet range. Raise. Suited aces have nut flush
   potential. Even with a weak kicker, the flush draws are premium."

No separate coaching computation. Grid data → words.

## What This Fixes (from validation bugs)

| Bug | How R/C/F Fixes It |
|---|---|
| Engine disagrees with coaching | No engine in coaching path. Grid says R/C/F, coaching says it in words. |
| 92/5/3 hardcoded frequencies | R/C/F doesn't use frequencies. Uses range class directly. |
| V/M/B/F hand-tuned thresholds | R/C/F derives from range membership, not equity thresholds |
| "Price is too high" in RFI spots | R/C/F is action-aware: RFI hands are R or F, never "price" language |

## Implementation Steps

### Step 1: Add rangeClass to PreflopGridCell
- Run `classifyPreflopHand()` for all 169 cells in `computePreflopHandGrid()`
- Store `rangeClass` and `boundaryDistance` per cell
- This is 169 pure function calls — fast

### Step 2: Replace classifyFacing with classifyAction
- New function derives R/C/F from rangeClass + equity + pot odds
- Replace `SizingRole` with `ActionLetter`
- Replace `classifyFacingGrid` with `classifyActionGrid`

### Step 3: Update hand-grid.tsx display
- Replace V/M/B/F rendering with R/C/F
- Letter styling from actionConfidence (clear/standard/edge)
- Remove FACING_COLOR and ROLE_LABEL constants

### Step 4: Wire coaching to read grid action
- Coaching reads `gridResult.cells[heroIdx].action` → "R"
- Renders as raise/call/fold recommendation in narrative
- No engine sampling for coaching recommendation

### Step 5: Fix data flow bugs (1, 2, 5 from validation)
- Grid receives correct `facing3Bet`, `numLimpers` from game state
- Fix hero cell equity fallback (50% bug)
- Situation classification matches between grid and coaching

### Step 6: Clean up
- Remove old V/M/B/F types and functions
- Update tests
- Update visual-first-principles.md Layer 5 description

## The Facing Slider

The old system had a slider that let users adjust bet size and watch V/M/B/F change
per cell. R/C/F derives from `rangeClass`, which is situation-dependent (position + ranges),
not bet-size-dependent. The R/C/F letter does NOT change as bet size changes — the range
class stays the same.

**What DOES change with bet size:** equity math (pot odds, call cost). When facing a larger
bet, the equity threshold for continuing goes up. This affects borderline hands only.

**Decision: Remove the facing slider.** The slider was a V/M/B/F feature. R/C/F doesn't
need it because the action is range-derived. The bet size is already shown in the game
state (coaching shows "facing 3BB open from CO"). The grid shows the action for THAT bet
size. If the user wants to explore different sizings, that's a postflop concern where
bet sizing varies — preflop sizings are standard (2.5-3BB opens).

**Also remove `classifyFacingLocal` from hand-grid.tsx** — this was the local re-implementation
of the old classifier for the slider. Dead code once the slider is removed.

## What This Does NOT Change

- Equity heatmap (Layer 2) — unchanged
- Range overlays (Layer 3) — unchanged  
- MC equity computation (Layer 4) — unchanged
- Engine auto-play for villains — unchanged (engine still samples frequencies)
- Multi-profile coaching comparison — unchanged (TAG/NIT/FISH still run through engine)
- Postflop grid — V/M/B/F was preflop-only anyway

## Resolved Validation Issues

| # | Issue | Resolution |
|---|---|---|
| 1 | Borderline RFI hands get "C" (impossible action) | `isOpeningAction` flag: borderline in opening spots → F |
| 2 | `mixed_raise` maps to R (majority action is call) | Changed to C; coaching narrative notes raising is also valid |
| 3 | Facing slider becomes pointless with range-derived actions | Remove slider and `classifyFacingLocal` — preflop sizing is standard |
| 4 | "No engine in coaching" misleading | Clarified: no engine for grid action letter; multi-profile comparison stays |
| 5 | hand-grid.tsx has local `classifyFacingLocal` | Removed with the slider |
