# Improve System — Play Poker and Judge the Coaching

Play hands step-by-step as if you were a poker player. At each decision, reason about what you'd do BEFORE reading the coaching. Then compare your reasoning against the system's output. Flag disagreements.

## How to Run

```bash
# Default: 50 hands, 6-max, TAG villains
npx vitest run tests/pipeline/stepByStep.test.ts

# Customize via env vars
STEP_SEED=12345 STEP_HANDS=10 npx vitest run tests/pipeline/stepByStep.test.ts
STEP_PLAYERS=3 STEP_VILLAIN=fish npx vitest run tests/pipeline/stepByStep.test.ts
```

Environment variables:
- `STEP_SEED` — starting seed (default 90000)
- `STEP_HANDS` — number of hands (default 50)
- `STEP_PLAYERS` — table size (default 6)
- `STEP_VILLAIN` — villain profile: tag, nit, fish, lag, gto (default tag)

## Analysis Process

For EACH decision point in the output:

### Step 1: Read the Observable State
Look at: hero cards, position, board, pot size, opponent actions, stack depths, legal actions.

### Step 2: Form Your Own Opinion FIRST
Before reading [COACHING], think:
- What is my hand strength here? (Made hand? Draw? Air?)
- What is my position advantage/disadvantage?
- What do opponent actions tell me about their range?
- What would I do? (fold/check/call/bet/raise and why?)
- What sizing makes sense?

### Step 3: Read the Coaching
Now read the [COACHING] section. Compare:

| Check | What to Look For |
|---|---|
| **Hand strength** | Does the categorization match reality? (e.g., pocket pair called "air") |
| **Recommendation** | Does the recommended action match sound poker reasoning? |
| **Narrative coherence** | Does the narrative make sense? Any contradictions? |
| **Opponent range** | Is the estimated range reasonable given observed actions? |
| **Equity** | Does the equity feel right for this hand vs that range? |
| **GTO frequencies** | Do the frequencies make sense for this spot? |
| **Exploit advice** | Does it contradict the recommendation? |
| **Board texture** | Is the board correctly described? Warnings for paired/trips? |
| **Confidence** | Is the confidence level appropriate for available data? |

### Step 4: Flag Issues
For each disagreement, note:
- **What you expected** vs **what the system said**
- **Severity**: error (clearly wrong) vs warning (debatable) vs style (phrasing issue)
- **Root cause**: which file/function likely needs fixing

## What to Fix

After identifying issues, fix them in priority order:

1. **Wrong recommendations** (system says fold with nuts, or raise with air vs calling station)
2. **Wrong categorization** (pocket pair as "air", flush draw as "overcards")
3. **Range estimation bugs** (0% range, 100% range, wildly off)
4. **Narrative contradictions** (fold then "GTO confirms call")
5. **Missing context** (no board warning for trips, no draw mention)
6. **Style/phrasing** (awkward language, repetitive phrases)

## Key Files

| File | What It Controls |
|---|---|
| `convex/lib/gto/handCategorizer.ts` | Hand strength classification |
| `convex/lib/opponents/rangeEstimator.ts` | Opponent range narrowing |
| `convex/lib/opponents/behaviorInference.ts` | Action-based player profiling |
| `convex/lib/analysis/handCommentator.ts` | Coaching narratives |
| `convex/lib/analysis/opponentStory.ts` | Opponent range stories |
| `convex/lib/analysis/snapshot.ts` | Coaching snapshot assembly |
| `convex/lib/gto/frequencyLookup.ts` | GTO frequency data routing |
| `convex/lib/pipeline/counterStrategyMap.ts` | Exploit advice |
| `convex/lib/gto/actionNarratives.ts` | Per-action story text |
| `convex/lib/gto/archetypeClassifier.ts` | Spot classification |

## Verification After Fixes

```bash
# Type check
pnpm tsc --noEmit

# Semantic audit (1000 hands, automated checks)
npx vitest run tests/pipeline/semanticAudit.test.ts

# Coaching audit (1000 hands, coherence checks)
npx vitest run tests/pipeline/coachingAudit.test.ts

# Full suite
npx vitest run
```

Targets: 0 errors, 0 warnings on all audits. 1291+ tests pass.

## Example Analysis

```
── Decision #0 | FLOP ──
Hero: Kh 9d (K9o) | Position: Small Blind
Board: Td 8c 6c
Pot: 6 BB | Stack: 97 BB
Hand: Gutshot (straight_draw)
Actions this street: BB: check
Legal: check | bet (3-97 BB)

MY REASONING: K9o on T86 two-tone. I have a gutshot (7 makes a straight)
plus a backdoor flush draw. Board is wet. Opponent checked. I'd lean
toward checking — my draw isn't strong enough to bet for value, and a
check-raise from BB would be costly. Check.

  [COACHING]
  Recommendation: check (clear)
  GTO: check 76%
  ✅ AGREE — check is correct here.
```

```
── Decision #1 | RIVER ──
Hero: 8d 9c (98o) | Position: Big Blind
Board: Ac 7s Kc 6h 3s
Hand: Air (9 high) (air)
Pot: 16 BB
Legal: check | bet (8-92 BB)

MY REASONING: 98o on AK763 rainbow. Complete air, 9 high. No draws
hit. Opponent bet the turn. I should check — bluffing into this board
with 9 high makes no sense, especially if villain calls a lot.

  [COACHING]
  Recommendation: bet (leaning)
  Exploit: "This opponent calls too much. Stop bluffing them entirely."
  ❌ DISAGREE — coaching says bet but exploit says don't bluff.
  This is a contradiction. File: handCommentator.ts, exploit override logic.
```
