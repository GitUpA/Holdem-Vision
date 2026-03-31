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

**Data source:** `convex/lib/gto/preflopEquityTable.ts` — static lookup table of all 169 hand classes.

**What it teaches:** Relative hand strength. Where your hand sits in the 169-hand hierarchy.

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

**Data source:** `GTO_RFI_RANGES` in `convex/lib/gto/tables/preflopRanges.ts` — static Sets per position.

**What it teaches:** Position determines range width. UTG opens tight (15%), BTN opens wide (44%). The student sees the gap visually.

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
| `convex/lib/analysis/handGrid.ts` | Pure TS grid computation (for headless/tests) |
| `convex/lib/gto/preflopEquityTable.ts` | Static equity vs random for 169 hand classes |
| `convex/lib/gto/tables/preflopRanges.ts` | GTO opening/calling/3-bet ranges per position |
| `src/components/workspace/workspace-shell.tsx` | Hosts the grid, passes game state props |

## Props Interface

```typescript
interface HandGridProps {
  heroCards: number[];           // Hero's 2 hole cards (CardIndex)
  communityCards?: number[];     // Community cards (0-5)
  heroPosition?: string;        // Hero's position ("btn", "co", etc.)
  facingBetBB?: number;         // Current bet to call in BB
  facingPosition?: string;      // Position of the bettor ("hj", "utg", etc.)
}
```

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
