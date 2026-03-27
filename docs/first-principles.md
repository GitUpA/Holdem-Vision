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

GTO is not "always right" — it's the baseline that can't be exploited. A human player deviates from GTO to exploit opponent weaknesses. But to deviate intelligently, you must first understand the baseline.

### Profiles as GTO Deviations

Every player profile is a **deviation from GTO**, not a separate system:

- **GTO**: the identity (no modification)
- **NIT**: folds more than GTO recommends (high foldScale modifier)
- **FISH**: calls more than GTO recommends (low foldScale, call-heavy)
- **TAG**: plays tighter preflop than GTO, more aggressive postflop
- **LAG**: plays wider than GTO preflop, aggressive postflop

Because every profile is a GTO deviation, **one engine handles all profiles**. The modifier vector is the only variable. This also means:

- **Custom profiles** are possible — any behavioral deviation can be expressed as a modifier
- **Every modifier dimension is tunable** — if it affects behavior, it gets a control
- **Profiles compose** — "like a NIT but calls more on the river" is a modified NIT modifier

### Exploitative Play as Threshold Testing

Exploitative play is not "do the opposite of GTO." It's **testing the story**:

> "I have a great hand but not the nuts. If I represent a hand closer to the nuts, they should fold unless they have the nuts or don't believe me. If they continue, I'm invested and willing to fold."

This is a narrative decision, not a frequency calculation. The coaching must show:
1. What GTO says (the baseline)
2. Why you might deviate (the exploit)
3. What their response tells you (the read)
4. When to stop pressing (the threshold)

Each action in an exploitative line is **conditional on the response** — not independent.

## Layer 6: Every Seat is a Player

### The Core Abstraction

Every seat at the table is a **profile-driven player**. The human hero is the seat where the system **pauses for human input**. Everything else is identical:

```
Seat 0 (Hero):   GTO coaching → PAUSE → human decides → record
Seat 1 (Villain): GTO coaching + NIT modifier → auto-decide → record
Seat 2 (Villain): GTO coaching + TAG modifier → auto-decide → record
...
```

The human hero receives coaching (narrative, GTO recommendation, opponent stories). Villains receive the same coaching internally but always follow it (with their modifier applied). The difference is:
- Hero sees the coaching and chooses
- Villains see the coaching and obey

This means the system can run **with or without a human**:
- **With human**: hero seat pauses, human plays, system teaches
- **Without human**: hero seat auto-plays (another profile), system self-validates

### Villain Coaching Interpretation

Villains don't blindly follow frequencies. They receive the same coaching the hero would get, then interpret it through their profile modifier:

- **NIT receives**: "GTO says call here, 60% frequency" → NIT modifier: fold more → NIT folds
- **FISH receives**: "GTO says fold here, 80% frequency" → FISH modifier: call more → FISH calls
- **TAG receives**: "GTO says raise here, 45% frequency" → TAG modifier: slightly more aggressive → TAG raises

Variability comes from the sampling — the modifier warps the distribution, then an action is sampled. A NIT folds MOST of the time but occasionally calls (unpredictable, realistic).

**Tuning levers:**
- **Intensity** — how far the modifier deviates from GTO (0 = pure GTO, 1 = extreme)
- **Variance** — how random the sampling is within the modified distribution
- **Situation sensitivity** — different deviations per situation (preflop vs river, facing bet vs first to act)

## Layer 7: The Coaching Architecture

### The Coach is Blind to Setup

The coaching engine **does not know what profiles were assigned to villains**. It observes actions and interprets — just like a real coach watching tape:

- **Setup** (profile assignment) is for creating training scenarios
- **Coaching** (behavior interpretation) is for learning to think
- The coach says "V3 has folded 3 times in a row — they appear tight" not "V3 is a NIT"

This is the skill being taught: read the behavior, not the label.

### The System's Full Stack

```
GTO Range Data (data layer — 169-grid, solver tables)
    ↓ feeds
Funnel Tracking (context layer — HandContext carries ranges forward)
    ↓ informs
Engine (decision layer — GTO base + profile modifier + sampling)
    ↓ produces
Coaching (interpretation layer — blind to setup, reads behavior)
    ↓ presents
Narrative + Scoring (teaching layer — story-based, threshold-aware)
    ↓ displayed via
UI (presentation layer — or headless for testing)
```

## Layer 8: Statistical Validation

### The Payoff Matrix

Because every seat is a profile-driven player and the system runs headless, we can validate the entire system mathematically:

**Test 1: Symmetric Validation (null hypothesis)**
All 6 seats run identical GTO profiles. Over N hands, each seat should win ~1/6 of the total chips. If any seat wins significantly more or less, the system has a bug (position bias, dealing bias, engine asymmetry). This proves the system is FAIR.

**Test 2: Profile Strength Ranking**
Replace one seat with a different profile, keep 5 as GTO. Run N hands:
- GTO vs 5 GTOs → ~1/6 win rate (no edge against itself)
- TAG vs 5 GTOs → slightly above 1/6 (TAG exploits GTO's balance in spots)
- NIT vs 5 GTOs → below 1/6 (bleeds blinds by folding too much)
- FISH vs 5 GTOs → well below 1/6 (calls too much, loses to value)

This validates that each profile behaves as expected AND that the coaching correctly identifies which profiles are stronger.

**Test 3: Full Interaction Matrix (M+1 problem)**
With K profiles, test each pair: how does profile A perform against profile B? This is a K×K payoff matrix (zero-sum: every chip won = chip lost).

For 5 profiles: 15 unique matchups. Each needs ~10,000 hands for statistical significance (p < 0.05 given poker's high variance).

**Properties the matrix should exhibit:**
- GTO should have the highest MINIMUM payoff (can't be exploited)
- TAG should beat NIT (punishes folding)
- FISH should lose to everyone (calling too much is -EV)
- LAG should beat NIT but lose to TAG (aggression works vs passive, loses to selective aggression)
- The dominant strategy against a mixed population should be close to GTO

**What this enables:**
1. **System validation** — symmetric test proves fairness
2. **Profile validation** — each profile's win rate matches theory
3. **Coaching validation** — if GTO-coached auto-hero doesn't beat FISH, coaching is broken
4. **Modifier tuning** — adjust foldScale until NIT-vs-GTO produces the expected loss rate
5. **Custom profile testing** — create a profile, run the matrix, see where it lands
6. **Self-tuning** — run matrix → find anomalies → adjust modifiers → re-run → converge

### Sample Size and Feasibility

Poker has high variance. Required sample: ~10,000 hands per matchup for significance.
- 6 players × 10,000 hands × 15 matchups = 900,000 hands
- HandStepper runs ~500 hands/second headless
- Full matrix: ~30 minutes
- Entirely feasible for automated CI/tuning runs

## Archetype vs Free Play

Same system, different dealing:

- **Archetype mode**: Board is constrained. Funnel is strict — only hands that survived preflop reach the flop. Scenario is defined.
- **Free play**: Board is random. Funnel is observed — system detects archetype and coaches accordingly. If hero entered with junk, coaching says so but lets them play.

The coaching, scoring, engine, and narrative are identical in both modes.

## Common Misconceptions

1. **"Each street can be analyzed independently"** — No. The preflop action defines the story for all later streets.
2. **"GTO is one number per hand"** — No. It's a frequency distribution with mixed strategies at edges.
3. **"Villain's range doesn't matter"** — It's the MOST important factor in hero's decision.
4. **"Archetype mode is a separate system"** — Same system, constrained dealing.
5. **"Profiles are separate engines"** — They are modifier vectors on one engine.
6. **"Exploitative play = doing the opposite of GTO"** — It's testing thresholds through narrative.
7. **"The coach should know the villain's profile"** — The coach should READ behavior, not labels.
8. **"The system needs a human to test"** — Every seat is a player. Replace hero with an auto-player to validate headlessly.
9. **"Headless mode is the product"** — The product is for humans. Headless mode is the testing harness that ensures the product works.
