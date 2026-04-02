# Preflop Situation Map

Complete taxonomy of preflop decision points, sourced from GTO Wizard, Upswing Poker,
PokerCoaching, Run It Once, solver documentation, and poker theory literature.

## Complete Taxonomy

### Tier 1: Core Spots (shipped)

| # | Scenario | Grid Situation | Engine Key | Range Data | Status |
|---|---|---|---|---|---|
| 1 | RFI (first to act, no limpers) | `rfi` | `preflop.open` | RFI by position | ✅ |
| 2 | Facing single raise | `facing_open` | `preflop.facing_raise` | Cold-call + 3-bet | ✅ |
| 3 | Facing raise + callers | `facing_open_multiway` | `preflop.facing_raise` | Cold-call + 3-bet (compressed) | ✅ |
| 4 | Facing 3-bet (hero opened) | `facing_3bet` | `preflop.facing_3bet` | 4-bet range | ✅ |
| 5 | Facing 4-bet+ | `facing_4bet` | `preflop.facing_4bet` | 5-bet range | ✅ |
| 6 | SB vs BB (SB opens) | `blind_vs_blind` | `preflop.open` | BvB range | ✅ |
| 7 | BB vs raise (by opener position) | `facing_open` | `preflop.facing_raise` | BB defense (call + 3-bet) × 4 openers | ✅ |

### Tier 2: Limper Spots (missing — common in live/low-stakes)

| # | Scenario | Grid Situation | Engine Key | Range Data | Status |
|---|---|---|---|---|---|
| 8 | Facing 1 limper (not BB) | `rfi` ❌ | `preflop.open` ❌ | None | ❌ Missing |
| 9 | Facing 2+ limpers (not BB) | `rfi` ❌ | `preflop.open` ❌ | None | ❌ Missing |
| 10 | BB vs 1 limper (raise/check) | `rfi` ❌ | `preflop.open` ❌ | None | ❌ Missing |
| 11 | BB vs 2+ limpers (raise/check) | `rfi` ❌ | `preflop.open` ❌ | None | ❌ Missing |
| 12 | SB vs limper(s) (raise/complete/fold) | `rfi` ❌ | `preflop.open` ❌ | None | ❌ Missing |
| 13 | BB vs SB complete (raise/check) | `blind_vs_blind` ⚠️ | `preflop.open` ⚠️ | Partial | ⚠️ Incomplete |
| 14 | BB uncontested (folds to BB) | `rfi` ❌ | N/A | N/A — no decision | ⚠️ Trivial |

### Tier 3: Squeeze & Advanced (missing — important for intermediate+)

| # | Scenario | Grid Situation | Engine Key | Range Data | Status |
|---|---|---|---|---|---|
| 15 | Squeeze (raise + caller(s), hero 3-bets) | `facing_open_multiway` ⚠️ | `preflop.facing_raise` ⚠️ | None (distinct from std 3-bet) | ❌ Missing |
| 16 | Facing squeeze (as original raiser) | `facing_3bet` ⚠️ | `preflop.facing_3bet` ⚠️ | Approximately correct | ⚠️ Approximate |
| 17 | Facing squeeze (as cold caller) | — | — | None | ❌ Missing |
| 18 | Facing limp-reraise (hero iso'd, limper re-raises) | — | — | None | ❌ Missing |

### Tier 4: Straddle & Niche (defer)

| # | Scenario | Notes | Status |
|---|---|---|---|
| 19 | UTG straddle | Live poker only. Halves effective stack depth. | Defer |
| 20 | Button straddle | Live poker only. | Defer |
| 21 | Short-stack push/fold (<20BB) | Ranges become shove-or-fold. | Defer |
| 22 | Ante adjustments | Widens opening ranges by ~3-5%. | Defer |
| 23 | Open limp (hero limps first) | Near-zero frequency in GTO. Niche SB/short-stack. | Defer |

## Proposed New Situation Keys

Expand from 4 preflop engine keys to ~8:

```
preflop.open              // existing — RFI
preflop.facing_raise      // existing — vs open raise
preflop.facing_3bet       // existing — vs 3-bet
preflop.facing_4bet       // existing — vs 4-bet+
preflop.facing_limpers    // NEW — iso-raise / over-limp / fold (non-BB)
preflop.bb_vs_limpers     // NEW — raise / check (never fold)
preflop.squeeze           // NEW — raise + caller(s), hero 3-bets big
preflop.sb_complete       // NEW — SB limps, raise / complete / fold
```

Grid `PreflopSituation` types to add:
```
{ type: "facing_limpers"; limperCount: number; firstLimperPos: Position }
{ type: "bb_vs_limpers"; limperCount: number }
{ type: "bb_vs_sb_complete" }
{ type: "squeeze"; opener: Position; callerCount: number }
{ type: "bb_uncontested" }
```

## Range Data: What We Know

### Iso-Raise vs 1 Limper (by position)

Sizing: 3.5-4x BB in position, 4-5x BB out of position.

- **HJ**: ~12-15% — AA-77, AKs-ATs, KQs-KJs, AKo-AJo
- **CO**: ~18-22% — HJ range + 66-55, A8s-A5s, KTs-K9s, QTs, JTs, T9s, ATo
- **BTN**: ~30-40% — very wide, position advantage compensates
- **SB**: ~18% — tight due to OOP disadvantage

Key principle: iso-raise ≈ RFI range for that position, adjusted slightly.

### Iso-Raise vs 2+ Limpers

Tighten significantly. Sizing: 4x + 1BB per additional limper.
- Focus on value: TT+, AQs+, AKo
- Drop speculative suited connectors from raise range → over-limp instead
- Over-limp good candidates: 22-66, suited connectors, suited aces

### BB Raise vs Limpers

- **vs 1 limper**: raise ~25-28%. Value: AA-77, AKs-A8s, AKo-ATo, KQs-KTs, QJs-QTs, JTs. Bluffs: A5s-A2s, suited connectors. Check everything else.
- **vs 2 limpers**: tighten to ~18-22%. Drop bluff raises.
- **vs 3+ limpers**: ~12-15% pure value (AA-TT, AKs-AQs, AKo-AQo, KQs).

Key: BB is OOP entire hand. Raise for value, not isolation. Free flop is fine with speculative hands.

### BB vs SB Complete

SB complete range is wide and weak (capped — no premiums usually).
- BB raise ~25-30%: AA-77, AKs-A8s, AKo-ATo, KQs-KTs, suited connectors as bluffs
- BB check ~70-75%: everything else (free flop)
- Sizing: 3-4BB total
- Key difference from SB-raises-BvB: SB is capped, BB has range advantage

### Squeeze Ranges

Sizing: standard 3-bet + 1x per cold caller (e.g., 10BB + 3BB per caller).

- **BB squeeze vs EP raise + 1 caller**: ~7-8% (QQ+, AKs, AKo + A5s-A2s bluffs)
- **BB squeeze vs CO raise + BTN call**: ~14-16% (TT+, AJs+, AKo + wider bluffs)
- **BB squeeze vs BTN raise + SB call**: ~20-22% (widest squeeze)

Key: callers fold ~70%+ of their flatting range to a squeeze. More dead money = wider squeeze.

### Limper's Likely Range (by profile)

Needed for opponent range display in grid.

- **Fish/Recreational**: ~35-45% of hands. Any suited, any pair, any connector, any ace.
- **Passive Regular/Nit**: ~15-20%. Small pairs, suited connectors, suited aces.
- **Live $1/$2**: ~40-60%. Basically anything with "potential."
- Key: fish limping range is **uncapped** — they may limp AA/KK to "trap."

## Implementation Priority

1. **BB vs limpers** — most common missing spot, every session
2. **Facing limpers (non-BB)** — iso-raise is a fundamental skill
3. **BB vs SB complete** — common BvB scenario
4. **Squeeze** — distinct from normal 3-bet, high-EV spot
5. BB uncontested — trivial (check, no grid needed)
6. Facing squeeze — approximate via facing_3bet for now
7. Limp-reraise — rare, defer

## Design Principles

- Every situation a player faces at a real table should have a home in the grid
- The grid should be honest about non-GTO actions (limps happen at real tables)
- Range data should come from established poker theory, not invented
- The visual (Layer 3+) should teach correct play even when opponents play sub-optimally
- Limper range modeling by profile is a differentiator — most tools don't do this

## Three-System Alignment

These three must stay aligned as we add situations:
- **Grid `PreflopSituation`** — `convex/lib/analysis/preflopGrid.ts`
- **Engine `SituationKey`** — `convex/lib/types/opponents.ts`
- **Range data** — `convex/lib/gto/tables/preflopRanges.ts`

## Sources

- GTO Wizard: squeeze construction, BB in limped pots, SB completing, multiway solving, range morphology
- Upswing Poker: iso-raise sizing/ranges, multiway strategy, limper exploitation
- PokerCoaching (Jonathan Little): preflop charts, low-stakes limped pot strategy
- Run It Once / Peter Clarke: limped pot postflop dynamics
- SplitSuit: BB vs multiple limpers strategy
- 888poker: iso-raise theory
- Red Chip Poker: common preflop spots
