# Visual Math Fidelity — How Close Each Layer Is to Mathematical Truth

Companion document to `visual-first-principles.md`. That doc describes what each layer
shows. This doc scores how mathematically accurate each layer is and where the gaps live.

## Fidelity Scores

| Layer | Math Fidelity | What Limits It | What Would Fix It |
|-------|--------------|----------------|-------------------|
| 1. Grid (13×13) | **10/10** | Nothing | Nothing — pure combinatorics |
| 2. Equity (vs N opponents) | **9.5/10** | MC noise (~0.3% at 100K trials) | Exhaustive enumeration (impractical for multi-opponent) |
| 3. Ranges (position ranges) | **4/10** | Binary in/out approximation of continuous solver frequencies | Use frequency-weighted ranges internally |
| 4. Equity vs Range (MC) | **6/10** | Correct MC against incorrect (binary) range input | Frequency-weighted opponent combos |
| 5. Facing (V/M/B/F) | **5/10** | Hand-tuned thresholds + binary range-first rule | Solver-derived continue frequencies |
| Variable adjustments | **3/10** | Made-up constants (15BB caller penalty, 8% sizing drop) | Solver-computed adjustments per scenario |

**Overall mathematical fidelity: ~6/10**

## The Precision Bottleneck

Layer 3 is the bottleneck. Everything above it inherits its approximation.

```
Layer 1: 10/10 (exact)
Layer 2: 9.5/10 (near-exact)
Layer 3: 4/10 ← BOTTLENECK (binary approximation of continuous frequencies)
Layer 4: 6/10 (correct math × incorrect input = incorrect output)
Layer 5: 5/10 (heuristic thresholds × incorrect range = compounded error)
```

**Example of Layer 3's impact:**

76s from UTG has a solver frequency of 43% raise, 57% fold. Our binary range says "not in
range" (0%). When computing equity vs UTG's range (Layer 4), we exclude 76s entirely from
the opponent's holdings. The true equity of hero's hand against UTG's range is computed
against a range that's missing ~30% of hands that should be partially included.

## What We Have but Don't Use

`data/solver/complete_preflop_tables.json` contains frequency data for all 169 hand classes
× 6 positions × 5 situations. This data has `{fold, call, raise, sampleCount}` per cell.

Using this internally (not displaying it) would:
- Layer 3: 4/10 → ~8/10 — frequency-weighted ranges instead of binary
- Layer 4: 6/10 → ~9/10 — MC against frequency-weighted opponent combos
- Layer 5: 5/10 → ~7/10 — facing classification against accurate ranges

The student sees the same V/M/B/F letters and range outlines. The math behind them is correct.

## The Separation Principle

**Internal computation** should use the most accurate data available.
**Student-facing display** should use the most learnable representation.

These are not contradictory:
- Compute equity against frequency-weighted ranges → show V/M/B/F letters
- Derive boundaryDistance from actual frequencies → show "usually" / "depends on reads"
- Weight opponent combos by frequency → show the same equity percentage (just a better one)

The student never sees "43% raise" — they see a gradient, a confidence label, a letter.
But the letter is mathematically grounded instead of approximated.
