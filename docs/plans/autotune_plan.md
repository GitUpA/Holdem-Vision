# Autotune Plan: Autonomous Math-Based Quality Optimization

Inspired by [karpathy/autoresearch](https://github.com/karpathy/autoresearch) — an autonomous loop where an AI agent iterates on code within a fixed budget, measured by a single scalar metric.

## Core Idea

We already have solver ground truth, a headless batch runner, and a small tuning surface. Wire them into a tight feedback loop: **run hands → score against solver → adjust parameters → repeat**.

---

## Phase 1: Scoring Harness

**Goal**: A pure-TS function that takes a modifier config and returns a scalar quality score.

### 1A: Per-Decision Scoring

Build `convex/lib/autotune/evalHarness.ts`:

```ts
interface EvalResult {
  overallScore: number;           // single scalar — weighted EV loss in BB (lower = better)
  perProfile: Map<ProfileType, ProfileScore>;
  perArchetype: Map<string, ArchetypeScore>;
  differentiationScore: number;   // profiles must DIVERGE from each other (higher = better)
}

interface ProfileScore {
  avgEvLoss: number;              // vs solver frequencies
  gtoAlignment: number;           // 0-1, how close to solver when profile IS gto
  behaviorFidelity: number;       // does NIT actually fold more? does LAG actually raise more?
  sampleSize: number;
}

interface ArchetypeScore {
  avgEvLoss: number;
  solverCoverage: boolean;        // did we have solver data or fall back to heuristic?
  worstCaseEvLoss: number;
}
```

**How it works**:
1. For each of 5 profiles × 8 flop archetypes (+ preflop):
   - Run N hands via `executeDrillPipeline()` or `batchRunner`
   - At each decision point, compare engine output frequencies to solver frequencies
   - Compute EV loss using `evScoring.ts` logic
2. Aggregate into single scalar: `overallScore = avgEvLoss + λ * (1 - differentiationScore)`
   - The λ term penalizes profiles that collapse to identical play

**Key**: Uses existing `dataConfidence.ts` to weight scores — low-confidence archetypes count less.

### 1B: Differentiation Metric

Profiles must be *behaviorally distinct*. Measure:
- **Fold frequency spread**: NIT should fold most, LAG least. Rank-order correlation with expected ranking.
- **Aggression spread**: LAG > TAG > GTO > FISH > NIT for raise frequency.
- **Situation sensitivity**: each profile should respond differently to the same board texture.

Score = Kendall tau correlation between observed rank order and expected rank order, averaged across situations.

### 1C: Baseline Measurement

Run the harness against current modifier configs. This becomes the "before" snapshot. Store as `data/autotune/baseline.json`.

**Files to create**:
- `convex/lib/autotune/evalHarness.ts` — orchestrates eval
- `convex/lib/autotune/differentiationScorer.ts` — profile divergence metric
- `convex/lib/autotune/types.ts` — shared types
- `tests/autotune/evalHarness.test.ts`

---

## Phase 2: Parameter Space Definition

**Goal**: Define what the agent (or optimizer) is allowed to change.

### Tunable Surface (intentionally small)

**File 1**: `modifierProfiles.ts` — 5 profiles × per-situation modifiers:
- `foldScale` (0-3) — multiplier on fold frequency
- `aggressionScale` (0-3) — multiplier on raise frequency
- `raiseVsCallBias` (-1 to 1) — shift between raise and call
- `sizingBias` (-1 to 1) — preference for larger/smaller bets
- `intensity` (0-1) — how far from GTO baseline

**File 2**: `contextAnalysis.ts` — attenuation curves:
- Hand strength thresholds for fold attenuation
- Draw strength thresholds for aggression boost
- Position multipliers (6 positions)
- SPR breakpoints

### Parameter Encoding

Flatten all tunables into a single vector (~60-80 floats). This lets us:
- Serialize/deserialize configs for the optimizer
- Compute parameter deltas between iterations
- Apply constraints (clamp ranges, maintain rank ordering)

**Files to create**:
- `convex/lib/autotune/parameterSpace.ts` — flatten/unflatten, constraints, defaults

---

## Phase 3: Optimization Loop

**Goal**: Automated iteration that improves the scalar score.

### 3A: Hill Climbing (No LLM Needed)

Start simple — no AI agent required for math optimization:

```
repeat {
  1. Pick a random parameter
  2. Perturb it by ±δ (small step)
  3. Run eval harness (fast — pure TS, ~seconds)
  4. If score improves: keep change
  5. If score worsens: revert
  6. Shrink δ over time (simulated annealing)
}
```

This is our "5-minute training run." Each iteration is cheap because it's pure math — no GPU, no network.

### 3B: Bayesian Optimization (Optional Upgrade)

If hill climbing plateaus, switch to Bayesian optimization:
- Use eval history to build a surrogate model of the score landscape
- Pick next point to evaluate based on expected improvement
- More sample-efficient than random perturbation

### 3C: LLM-Guided Search (The autoresearch Parallel)

The autoresearch-style loop for when we want *structural* changes, not just parameter tweaks:

```
repeat {
  1. Agent reads: current modifier configs + last 5 eval results
  2. Agent proposes: targeted edits to modifierProfiles.ts or contextAnalysis.ts
  3. System runs: eval harness
  4. Agent reads: new score + per-profile/per-archetype breakdown
  5. Agent decides: keep, revert, or try different direction
}
```

Scope constraint (like autoresearch's "only edit train.py"): **agent may only edit modifierProfiles.ts and contextAnalysis.ts**. Everything else is frozen.

**Files to create**:
- `convex/lib/autotune/hillClimber.ts` — simple optimizer
- `convex/lib/autotune/runner.ts` — orchestrates loop, logs history
- `data/autotune/history/` — JSON logs per run

---

## Phase 4: Regression Guard

**Goal**: Ensure tuning improvements stick and don't regress.

### Snapshot Tests

After each accepted improvement:
1. Record the full `EvalResult` as a snapshot
2. Add a Vitest test that asserts `overallScore <= lastBestScore + ε`
3. This runs in CI — any modifier change that regresses the score fails the build

### Per-Profile Invariants

Hard constraints that no optimization may violate:
- NIT fold% > GTO fold% in every situation
- LAG raise% > GTO raise% in every situation
- FISH call% > any other profile's call%
- GTO profile score ≈ 0 EV loss (it should match solver exactly)
- All profiles must produce legal action distributions (sum to ~1.0)

**Files to create**:
- `tests/autotune/regressionGuard.test.ts`
- `data/autotune/snapshots/` — versioned score snapshots

---

## Phase 5: Continuous Improvement

### When New Solver Data Arrives

Each new batch of solver boards:
1. Re-run eval harness → new baseline
2. Run optimization loop → find better parameters for expanded data
3. Snapshot → lock in gains

### Dashboard (Optional)

Simple CLI output showing:
- Current score vs baseline
- Per-profile breakdown (table)
- Per-archetype breakdown (table)
- Parameter diff from baseline

---

## What This Does NOT Cover

- **User-facing text quality** (explanations, commentary, knowledge base) — see companion plan
- **UI/UX coherence** — requires inference, not math
- **Educational effectiveness** — requires simulated learner evaluation
- **Recommendation correctness beyond GTO alignment** — the solver says what's optimal, but "is this helpful to the user?" is a judgment call

Those are covered by the **LLM-as-Judge plan** (separate document).

---

## Implementation Order

1. **Phase 1A** first — the scoring harness is useful standalone even without the loop
2. **Phase 1B + 1C** — baseline measurement validates the harness works
3. **Phase 2** — parameter encoding (small, mechanical)
4. **Phase 3A** — hill climbing (simplest optimizer, immediate value)
5. **Phase 4** — regression guard (lock in any gains before going further)
6. **Phase 3C** — LLM-guided search (the autoresearch-style capstone)

Estimated test count impact: ~30-50 new tests across harness + regression guard.
