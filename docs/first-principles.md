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

### Symmetric Validation (null hypothesis)

All 6 seats run identical GTO profiles. Over N hands, each seat should win ~1/6 of total chips. Deviation = system bug. This proves **fairness**.

### Profile Strength Ranking

Replace one seat with a different profile, keep 5 as GTO:
- GTO vs 5 GTOs → ~1/6 (no edge against itself)
- TAG vs 5 GTOs → above 1/6 (exploits GTO's balance)
- NIT vs 5 GTOs → below 1/6 (bleeds blinds)
- FISH vs 5 GTOs → well below 1/6 (calls too much)

### Full Interaction Matrix

K profiles → K×K payoff matrix (zero-sum). For 5 profiles: 15 unique matchups. ~10,000 hands each for significance. ~30 minutes headless for the full matrix.

### What the Matrix Reveals

The payoff matrix doesn't just validate — it **discovers optimal counter-strategies**.

For each observed behavior pattern, the matrix shows which modifier vector wins the most against it. This is computable:

1. Run profile A against all others → find A's weaknesses
2. Generate counter-profiles that exploit A's weaknesses
3. Run the counter-profiles against A → find the optimal counter
4. The optimal counter IS the coaching recommendation

## Layer 10: The Meta-Game — Emergent Knowledge Base

### From Validation to Discovery

The payoff matrix is a validation tool. But its higher purpose is **knowledge generation**:

**Step 1: Calibrate.** Run all-GTO symmetric test. Confirm fairness. Adjust until each seat wins ~1/6.

**Step 2: Rank.** Run each profile against GTO baseline. Confirm expected ordering: TAG > GTO > LAG > NIT > FISH. Adjust modifier values until this ordering is stable.

**Step 3: Map.** Run full K×K matrix. For each profile pair, record the win rate delta. This produces a **counter-strategy map**:

```
If opponent behaves like NIT → optimal counter: increase bluff frequency +30%
If opponent behaves like FISH → optimal counter: value bet thinner, never bluff
If opponent behaves like LAG → optimal counter: tighten up, trap with strong hands
If opponent behaves like TAG → optimal counter: mixed strategy (close to GTO)
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

## Summary

```
First Principles:
├── Poker is a funnel (each street filters ranges)
├── Two ranges always matter (hero's and villain's)
├── GTO is the unexploitable baseline (defense)
├── Profiles are GTO deviations (modifier vectors)
├── Exploitative play tests thresholds (offense)
├── Every seat is a player (hero = pause for human)
├── Coach is blind to setup (reads behavior)
├── Pre-compute everything (fast path + optional precision)
├── Payoff matrix validates and discovers (statistical testing)
└── Meta-GTO emerges (counter-strategy knowledge base)
```
