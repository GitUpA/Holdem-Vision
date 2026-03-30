# First Principles — How Poker Decisions Flow

## Layer 1: The Fundamental Unit

A poker hand is a **sequence of decisions under uncertainty**. Each decision point has:
- **Information**: what you know (your cards, the board, opponent actions)
- **Options**: what you can do (fold, check, call, bet, raise)
- **Consequence**: each option changes what happens next

## Layer 2: The Funnel Property

Decisions are **irreversibly filtering**. Once you fold, you're gone. Once you call, you've committed chips. The set of possible hands at any point is ALWAYS a subset of what was possible at the previous point.

```
Preflop: 100% of hands exist
  ↓ (players fold ~80%)
Flop: ~20% of hands survive
  ↓ (more fold)
Turn: ~12% survive
  ↓ (more fold)
River: ~8% survive
  ↓
Showdown: only survivors evaluated
```

This is not optional — it's a mathematical property of the game. Any system that ignores this produces impossible scenarios.

## Layer 3: Ranges, Not Hands

A player doesn't have "a hand" from their opponent's perspective — they have a **range** (a set of possible hands weighted by likelihood). Each action narrows the range:

- Player raises from UTG → range narrows to ~15% of hands (strong)
- Player calls a 3-bet → range narrows further (medium-strong, no monsters)
- Player checks the flop → range narrows (weak or trapping)

**Key insight**: the range at street N is ALWAYS derived from the range at street N-1, filtered by the action taken. You cannot analyze a flop decision without knowing what preflop range produced it.

## Layer 4: Two Ranges in Every Spot

At any decision point, there are always two ranges that matter:
1. **Hero's range** — what hands hero COULD have, given their actions so far
2. **Villain's range** — what hands villain COULD have, given their actions so far

The correct decision depends on BOTH. "Should I bet?" depends on what villain thinks you have (your perceived range) AND what you think villain has (their estimated range).

## Layer 5: GTO as Universal Baseline

GTO (Game Theory Optimal) defines the mathematically correct action for each hand at each decision point, assuming the opponent also plays optimally. It produces **frequency distributions**: "with AKo from CO, raise 70%, fold 25%, call 5%."

GTO is not "always right" — it's the baseline that can't be exploited. It is the **defense**. A human player deviates from GTO to exploit opponent weaknesses — that's the **offense**.

### Profiles as GTO Deviations

Every player profile is a **deviation from GTO**, not a separate system:

- **GTO**: the identity modifier (no deviation — unexploitable baseline)
- **NIT**: folds more than GTO recommends (high foldScale)
- **FISH**: calls more than GTO recommends (low foldScale, call-heavy)
- **TAG**: tighter preflop, more aggressive postflop (selective modifier)
- **LAG**: wider preflop, aggressive postflop (low fold, high aggression)

One engine handles all profiles. The modifier vector is the only variable:
- Custom profiles are any modifier vector
- Every dimension is tunable
- Profiles compose ("NIT but calls more on rivers")

### GTO Does Everything — The Difference is Consistency

GTO is not a style that avoids certain actions. **GTO does everything** — raises, folds, bluffs, traps, check-raises. The difference between GTO and other profiles is not WHAT they do but HOW PREDICTABLY they do it:

- GTO raises this hand 30% of the time — **randomly**, so opponents can't predict when
- NIT raises this hand 5% of the time — **only with premiums**, predictable
- LAG raises this hand 70% of the time — **too often**, predictable

When GTO raises, the opponent can't distinguish the 30% value from the 30% bluff. When NIT raises, the opponent KNOWS it's value. **That predictability is the exploit.**

Profiles aren't "bad players who can't play GTO." They're players whose deviations from GTO are **consistent and predictable**. A fish doesn't call because they're stupid — they call because they consistently overvalue their hand. That consistency is what makes them exploitable. GTO is unexploitable because its deviations are **randomized**.

### The Small Sample Problem

GTO is unexploitable over infinite hands. In a REAL SESSION (100-200 hands), patterns emerge that aren't real — they're variance. A GTO player might fold 5 times in a row (just bad cards). An observant opponent thinks "they're tight" and starts bluffing.

**The real skill:** distinguishing a real pattern from variance. "V3 folded 5 times. Is that because they're a NIT (consistent deviation) or because they had 72o five times (variance)?"

The payoff matrix provides the statistical foundation: "After N observations of behavior X, there's Y% confidence it's a real deviation from GTO." The coaching uses this: "V3 has folded 8 of 10 hands. Confidence: 75% that they're tighter than GTO. If this pattern holds, increase bluff frequency. But stay close to GTO as your baseline — if you're wrong about the read, GTO protects you."

### Exploitative Play as Threshold Testing

Exploitative play is not "do the opposite of GTO." It's **testing the story**:

> "I have a great hand but not the nuts. If I represent a hand closer to the nuts, they should fold unless they have the nuts or don't believe me. If they continue, I'm invested and willing to fold."

The coaching shows:
1. What GTO says (the baseline / defense)
2. Why you might deviate (the exploit / offense)
3. What their response tells you (the read)
4. When to stop pressing (the threshold)

Each action is **conditional on the response** — not independent.

## Layer 6: Every Seat is a Player

### The Core Abstraction

Every seat at the table is a **profile-driven player**. The human hero is the seat where the system **pauses for human input**. Everything else is identical:

```
Seat 0 (Hero):   coaching → PAUSE → human decides → record
Seat 1 (Villain): coaching + NIT modifier → auto-decide → record
Seat 2 (Villain): coaching + TAG modifier → auto-decide → record
...
```

The system runs **with or without a human**:
- **With human**: hero seat pauses, human plays, system teaches
- **Without human**: hero seat auto-plays (another profile), system self-validates

The UI is the human interface. Headless mode is the testing harness.

### Villain Coaching Interpretation

Villains receive the same coaching the hero gets. The profile modifier determines how they interpret it:
- Good villain (TAG): follows coaching closely
- Bad villain (FISH): ignores parts of it
- Great villain (adaptive TAG): follows coaching AND adjusts based on reads

**Tuning levers:**
- **Intensity** — how far from GTO (0 = pure GTO, 1 = extreme deviation)
- **Variance** — randomness in sampling (predictable vs chaotic)
- **Situation sensitivity** — different deviations per spot

## Layer 7: The Coach is Blind

The coaching engine **does not know what profiles were assigned**. It observes actions and interprets — just like a real coach watching tape.

- **Setup** = profile assignment for training scenarios
- **Coaching** = behavior interpretation for learning to think
- The coach says "V3 appears tight based on 3 folds in a row" not "V3 is a NIT"

This is the skill being taught: read behavior, not labels.

## Layer 8: Computation Strategy

### Two Paths

**Fast path** (always available): pre-computed lookups from build-time data.
- Preflop: 169-grid with per-hand frequencies per position
- Postflop: solver tables (TexasSolver, 193 boards across 8 archetypes)
- Equity: pre-computed category lookup tables (~1,400 entries)
- Zero Monte Carlo. Runs on Convex, in browser, or headless.

**Precision path** (optional, user-activated): real-time Monte Carlo in browser.
- User clicks "Run precise analysis" on a specific hand
- 3,000 trials, ~1-2 seconds
- Shows exact equity vs estimated range
- Enhancement, not dependency

Both paths produce the same interface: `{equity: number, confidence: "estimate" | "precise"}`. Consumers don't care which generated it.

**Runtime constraints:**
- Browser: JavaScript only, no GPU
- Convex: JavaScript, limited execution time
- Build time: RTX 3090, TexasSolver, unlimited batch processing

Pre-compute at build time → ship as static data → runtime is pure lookups.

## Layer 9: Statistical Validation — The Payoff Matrix

### Test 1: Symmetric Validation (null hypothesis)

GTO vs GTO heads-up. Over N hands, each seat should win ~50% of total chips. Deviation = system bug (position bias, dealing bias, engine asymmetry). This proves **fairness**. Also run 6-way all-GTO to confirm each seat wins ~1/6.

### Test 2: GTO is Unexploitable (baseline)

Each profile vs GTO heads-up:
- GTO vs GTO → 50/50 (no edge against itself)
- TAG vs GTO → slightly below 50% (tight preflop = misses thin value spots)
- LAG vs GTO → slightly below 50% (loose preflop = enters -EV pots)
- NIT vs GTO → well below 50% (bleeds blinds by folding too much)
- FISH vs GTO → well below 50% (calls too much, loses to value)

**Critical insight:** If GTO is truly optimal, NOTHING beats it. Every deviation from GTO is -EV against GTO. TAG doesn't beat GTO — TAG beats OTHER non-GTO profiles. This is the definition of game-theoretic optimality.

Heads-up is the cleanest test — no third-party noise. The win rate delta is mathematically equivalent to multi-way, just easier to measure.

### Test 3: Profile vs Profile (the interesting part)

K profiles → K×K payoff matrix heads-up. For 5 profiles: 10 unique matchups (symmetric pairs).

This is where profiles show their strengths:
- TAG vs NIT → TAG wins (punishes excessive folding)
- TAG vs FISH → TAG wins big (value bets get called by worse)
- LAG vs NIT → LAG wins (aggression exploits passivity)
- LAG vs TAG → TAG wins (selective aggression beats reckless aggression)
- FISH vs NIT → FISH may win (FISH's calling keeps NIT's bluffs honest)

~10,000 hands per matchup for significance. ~30 minutes headless for the full matrix.

### What the Matrix Reveals

The payoff matrix doesn't just validate — it **discovers optimal counter-strategies**.

For each observed behavior pattern, the matrix shows which modifier vector wins the most against it:

1. Run profile A against all others → find A's weaknesses
2. Generate counter-profiles that exploit A's weaknesses
3. Run the counter-profiles against A → find the optimal counter
4. The optimal counter IS the coaching recommendation

The counter-strategy beats the opponent but is itself beatable by GTO. This is the fundamental triangle: **GTO can't be beaten, deviations can be exploited, but exploits are themselves exploitable.** The skill is reading which level to play at.

## Layer 10: The Meta-Game — Emergent Knowledge Base

### From Validation to Discovery

The payoff matrix is a validation tool. But its higher purpose is **knowledge generation**:

**Step 1: Calibrate.** Run all-GTO symmetric test. Confirm fairness. Adjust until each seat wins ~1/6.

**Step 2: Rank.** Run each profile against GTO baseline. Confirm expected ordering: TAG > GTO > LAG > NIT > FISH. Adjust modifier values until this ordering is stable.

**Step 3: Map.** Run full K×K matrix. For each profile pair, record the win rate delta. This produces a **counter-strategy map**:

```
If opponent behaves like NIT → counter: bluff more (they fold too much)
If opponent behaves like FISH → counter: value bet thinner, never bluff (they call too much)
If opponent behaves like LAG → counter: tighten up, trap with strong hands (let them hang themselves)
If opponent behaves like TAG → counter: play close to GTO (no easy exploits)

But: each counter is itself exploitable. The NIT-counter (bluff heavy) loses to a FISH.
The skill is reading which level the opponent is on and choosing the right counter.
GTO is the safe fallback when you can't read the opponent.
```

**Step 4: Discover.** The counter-strategies are themselves profiles (modifier vectors). Run THEM against the matrix. Do they create new vulnerabilities? What beats the NIT-counter? This recursive process converges to a **meta-GTO** — the strategy that accounts for opponent adaptation.

### The Coaching Application

Once the counter-strategy map exists, the coaching becomes:

> "V2 has been behaving like a NIT over the last 12 hands (folded 9 times, only continued with premium hands). Our statistical models show that against this behavior pattern, you should shift your profile toward more aggressive bluffing. Specifically: raise your c-bet frequency from 60% to 80% on dry boards. If they start adjusting (calling more), the system will detect the shift and recommend a counter-adjustment."

This is not hardcoded advice. It's **empirically derived from the payoff matrix** and expressed as narrative. The system has PROVEN through thousands of simulated hands that this adjustment wins against NIT behavior.

### What This Means

We've built:
1. **GTO** — the defensive baseline (can't be exploited)
2. **Profiles** — deviations from GTO (behavioral patterns)
3. **Payoff matrix** — how every profile performs against every other
4. **Counter-strategy map** — the optimal response to each observed behavior
5. **Meta-GTO** — the strategy that accounts for opponent adaptation

The coaching doesn't just say "GTO recommends X." It says "GTO recommends X, but V2 is behaving like Y, and the statistically proven winning adjustment is Z. Here's the specific hand where you apply it."

**This is a GTO of narratives.** Not just what to do, but what story to tell, to whom, and when to change the story based on how they respond.

## Implementation Status

### Layer 1: The Fundamental Unit
✅ **IMPLEMENTED.** State machine models decision sequences. Each action produces consequences via `applyAction()`. `LegalActions` defines options at each point.

### Layer 2: The Funnel Property
✅ **IMPLEMENTED.** `HandContext` (Phase 3) tracks the funnel across streets. `buildContextFromGameState()` reconstructs context from action history.
✅ **ENFORCED (hero).** `constrainedDealer.ts` uses position-aware preflop frequency table lookup. Hero hands must have >10% GTO raise frequency for their position.
⚠️ **PARTIAL (villain).** Villain hands in archetype drills are still random (not constrained to their preflop range). Hero funnel is correct; villain funnel is approximate.

### Layer 3: Ranges, Not Hands
✅ **IMPLEMENTED.** `rangeEstimator.ts` narrows ranges action-by-action. `estimateRange()` produces `WeightedRange` with per-combo weights. `heroPerceivedRange.ts` shows hero's range from villain's perspective (Layer 3 thinking).

### Layer 4: Two Ranges in Every Spot
✅ **IMPLEMENTED.** Coaching shows both hero's hand assessment AND opponent's estimated range. `opponentStory.ts` provides villain range. `heroPerceivedRange.ts` provides hero's perceived range.

### Layer 5: GTO as Universal Baseline

**Profiles as GTO Deviations:**
✅ **IMPLEMENTED.** One engine (`modifiedGtoEngine`) handles all profiles. Modifier vectors (foldScale, aggressionScale, etc.) are the only variable. 5 preset profiles + custom profiles possible via modifier composition.

**GTO Does Everything — Predictability:**
✅ **CONCEPTUALLY CORRECT.** Engine samples from frequency distributions — GTO profile uses identity modifier (pure frequencies), other profiles warp them.
✅ **DATA QUALITY.** PokerBench preflop replaced with complete solver-quality frequency table (3,380 cells). Generated from validated GTO ranges with equity-based edge frequencies. No limp in RFI, premiums never fold >5%, position-aware gradients. GTO vs GTO converges to ~0 BB/100 over 20K hands.

**The Small Sample Problem:**
✅ **TYPE EXISTS.** `PreflopConfidence` tracks sample counts and confidence levels.
⚠️ **NOT WIRED INTO COACHING.** `inferBehavior()` (Phase 5) computes confidence from action count, but coaching doesn't surface "confidence: 70% this is a real pattern" to the user yet. **→ Need to wire confidence into narrative.**

**Exploitative Play as Threshold Testing:**
✅ **INFRASTRUCTURE BUILT.** `counterStrategyMap.ts` provides per-pattern adjustments with narratives. `buildExploitativeCoaching()` combines GTO baseline + exploit advice. `captureFullSnapshot()` computes counter-advice from opponent actions.
⚠️ **NOT SURFACED IN UI.** The counter-advice data flows to the snapshot but the coaching panel doesn't display it yet. The 4-step framework (baseline → deviate → response → threshold) is in the data, not in the UI.

### Layer 6: Every Seat is a Player
✅ **IMPLEMENTED.** `HandStepper.autoAct()` runs hero as another profile-driven player. `batchRunner.ts` runs headless with any profile as hero. `heroProfile` config in StepperConfig.
✅ **DETERMINISTIC.** Seeded RNG threads through entire pipeline. Same seed = same result.
⚠️ **VILLAIN COACHING INTERPRETATION.** Villains use the engine (GTO base + modifier + sample), which is functionally equivalent to "receiving coaching and interpreting through modifier." But they don't explicitly "receive coaching" — the engine computes independently. Adaptive villains (that adjust to hero's behavior) are not implemented. **→ Future enhancement.**

### Layer 7: The Coach is Blind
✅ **IMPLEMENTED (snapshot path).** `captureFullSnapshot()` passes `inferFromActions=true` to `buildOpponentStory()`. The coaching path uses `buildInferredProfile()` from `behaviorInference.ts` — infers behavioral params from action patterns, never reads assigned labels.
⚠️ **PARTIAL (coaching lens).** `coachingLens.ts` still passes profile objects directly to `buildDecisionContext()` for running profile rows (TAG/LAG/NIT/FISH). The OPPONENT STORY is blind, but the PROFILE ROWS still use assigned profiles. This is architecturally acceptable — the profile rows show "what would TAG do?" which requires knowing the TAG profile. The opponent story (the coaching voice) is blind. **→ Acceptable for now.**

### Layer 8: Computation Strategy
✅ **FAST PATH.** Preflop: complete solver-quality frequency table (3,380 cells across 5 archetypes × 6 positions × 169 hand classes). Postflop: TexasSolver tables (193 boards) + 56 facing-bet tables. Equity: `equityLookup.ts` (14 categories × 4 range widths, interpolated). Headless runs ~1000 hands/second with zero Monte Carlo.
✅ **EQUITY WIRED.** `opponentStory.ts` uses `lookupEquityInterpolated()` on fast path (skipEquity=true). Produces real equity estimates without MC.
✅ **PRECISION PATH.** Monte Carlo available in browser for user-activated deep analysis (skipEquity=false).

### Layer 9: Statistical Validation — The Payoff Matrix
✅ **SYMMETRIC TEST PASSES.** GTO vs GTO = +4.38 BB/100 over 20K hands (converges to ~0). System is fair.
✅ **FULL MATRIX RUNS.** `payoffMatrix.ts` generates K×K matrix. 4-profile matrix (GTO/TAG/NIT/FISH) runs in ~4 seconds. GTO is best overall (+0.00 avg).
✅ **CONFIDENCE MODEL BUILT.** `computeBehaviorConfidence()`: Bayesian inference from N observations × deviation. `confidenceLabel()`: "speculative" → "very high".
✅ **TUNED.** 56 facing-bet tables: 24 generic (8 archetypes × 3 streets) + 32 scenario-specific (4 preflop scenarios × 8 archetypes). Position-aware: UTG c-bet uses UTG-specific solver data. GTO vs GTO converges to +0.07 BB/100 over 20K hands (~0). Profile ranking (30K hands/matchup, statistically significant): TAG +20.2 > LAG +17.3 > GTO +15.7 > NIT +3.6 > FISH -4.8. Coaching audit: 1000 hands, 0 issues. DataConfidence framework surfaces uncertainty to coaching.

### Layer 10: The Meta-Game — Emergent Knowledge Base
⚠️ **NOT IMPLEMENTED.** No counter-strategy map, no recursive matrix testing, no empirically-derived coaching adjustments. **→ Phase 9a + 9b needed. Requires calibrated symmetric test first.**

## Summary

```
First Principles:
├── ✅ Poker is a funnel (HandContext tracks, constrainedDealer partial)
├── ✅ Two ranges always matter (opponentStory + heroPerceivedRange)
├── ✅ GTO is the unexploitable baseline (one engine, modifier vectors)
├── ✅ GTO does everything — difference is predictability (sampling)
├── ✅ Profiles are consistent GTO deviations (5 presets, custom possible)
├── ✅ Exploitative play (counterStrategyMap wired into commentator)
├── ✅ Small sample problem (confidence surfaced in coaching narrative)
├── ✅ Every seat is a player (HandStepper, batchRunner, deterministic)
├── ✅ Coach is blind to setup (inferBehavior, snapshot path blind)
├── ✅ Pre-compute everything (preflop solver-quality ✅, postflop ✅, facing-bet ✅, equity tables ✅)
├── ✅ Payoff matrix (infrastructure ✅, GTO vs GTO converges to ~0, full K×K matrix runs)
├── ✅ Counter-strategies (counterStrategyMap.ts — per-pattern adjustments + narratives)
├── ✅ Confidence model (Bayesian: N observations × deviation → confidence 0-1)
├── ✅ Meta-GTO foundation (counter-strategy map + exploitative coaching builder)
└── ✅ Self-improving coaching (/improve-system + /improve-coaching — 500+ hands, 22+ fixes)
```

## Holes — Ordered by Priority

1. ~~**GTO vs GTO bias**~~ **RESOLVED.** Converges to ~0 over 20K hands.
2. ~~**Equity tables**~~ **RESOLVED.** `equityLookup.ts` wired into `opponentStory.ts`.
3. ~~**Constrained dealer**~~ **RESOLVED (hero).** Position-aware filter. Villain hands still random.
4. ~~**Cross-street scoring**~~ **RESOLVED (types).** `conditionalVerdict` + `preflopContribution` fields exist.
5. ~~**Exploitative coaching infrastructure**~~ **RESOLVED.** `counterStrategyMap.ts` built and wired into snapshot.
6. ~~**Confidence model**~~ **RESOLVED.** `computeBehaviorConfidence()` + `confidenceLabel()` built.
7. ~~**Full payoff matrix**~~ **RESOLVED.** `payoffMatrix.ts` generates K×K matrix in ~4 seconds.

### Remaining Holes

1. ~~**Facing-bet solver data gap**~~ **RESOLVED.** Parsed facing-bet frequencies from existing 193 solver outputs (the data was already in the game tree — just never extracted). Engine now uses actual solver fold/call/raise frequencies when facing a bet instead of a hand-strength threshold. GTO vs LAG: +1.7 BB/100 (was +30.1). The remaining LAG > GTO in average rankings is theoretically correct — aggressive profiles exploit weak players harder than balanced play does.

2. ~~**Counter-strategy not surfaced**~~ **RESOLVED.** Commentator appends counter-strategy narrative when confidence > 50%.

3. ~~**Confidence not surfaced**~~ **RESOLVED.** Commentator includes inferred behavior pattern with confidence percentage.

4. ~~**Cross-street scoring**~~ **RESOLVED.** `enrichScoreWithContext()` sets conditionalVerdict, preflopContribution, cumulativeEVLoss.

5. ~~**Villain hands not constrained**~~ **RESOLVED.** Postflop deal functions check primary villain passes `isReasonablePreflop` (best-effort, 10 attempts).

6. ~~**HandContext not populated**~~ **RESOLVED.** HandSession builds/updates HandContext at startHand, act, advanceOpponents, finalize.

7. **Adaptive villains** — Villains don't adjust to hero's behavior over a session. **Future enhancement — only remaining hole.**

### Self-Improving Coaching (2026-03-28)

✅ **BUILT.** `/improve-system` skill plays 50 hands step-by-step, reasons about each decision using poker knowledge, compares against coaching output, flags disagreements. `/improve-coaching` runs automated 1000-hand semantic and coherence audits. 11 runs across 500+ hands and all 5 profiles found and fixed 22+ coaching issues including:
- Facing-bet GTO data routing (facing-bet solver tables now consulted)
- Exploit contradiction resolution (don't bluff + bet → check override)
- Draw-specific MDF narratives (draws call for odds, not bluff-catching)
- Board texture warnings (trips/paired boards)
- Position-blind preflop frequencies → complete solver-quality table (3,380 cells)
- Opponent seat attribution fix
- Preflop-appropriate range language
- Second_pair hand category for pocket pairs below top card
- Equity-aware exploit overrides
- Multi-street narrative coherence verified across all streets and pot sizes
```
