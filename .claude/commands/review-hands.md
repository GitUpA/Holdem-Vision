# Review Hands — Validate What Users Actually See

Review complete hands from a god-view: every player's cards, every action, and flag decisions that no competent poker player would make.

Unlike `/improve-system` (which reviews coaching text quality from hero's perspective), this reviews **game play quality** — do villains make reasonable decisions with their actual cards on the actual board?

## How to Run

```bash
# Default: 100 hands, 6-max, GTO villains
npx vitest run tests/pipeline/fullHandReview.test.ts

# More hands for statistical significance
REVIEW_HANDS=1000 npx vitest run tests/pipeline/fullHandReview.test.ts

# Different seeds / villain profiles
REVIEW_SEED=50000 REVIEW_VILLAIN=fish npx vitest run tests/pipeline/fullHandReview.test.ts
```

## What It Checks

For every player in every hand:

1. **Flush vulnerability** — calling big bets on 3+ flush boards without a flush card
2. **Bottom pair overcommitment** — calling 30+ BB with bottom pair or underpair on later streets
3. **Air aggression** — betting/raising 30+ BB with no pair, no draw on dry boards

## Interpreting Results

- **Issue rate < 1%**: Acceptable. Some borderline calls will always exist (pocket pairs as bluff-catchers).
- **Issue rate 1-3%**: Needs tuning. Equity reality check penalties may be too weak.
- **Issue rate > 3%**: Fundamental problem. Engine not accounting for board texture at all.

## When Issues Are Found

The fix location is `convex/lib/opponents/engines/modifiedGtoEngine.ts` → `applyEquityRealityCheck()`. This function applies board-specific penalties to category-level frequencies:

- Increase flush penalty → villains fold more on flush boards without flush cards
- Increase bottom pair penalty → villains don't overcommit with weak pairs
- Lower the `sets_plus` threshold → only truly strong hands skip the check

## Relationship to Other Skills

```
/review-hands   → "Do villains play sensibly?"  (game play quality)
/improve-system → "Does coaching give good advice?" (coaching text quality)
/improve-coaching → "Are there systematic coaching bugs?" (automated regression)
```

Run `/review-hands` first — if villains play badly, users notice immediately. Then run `/improve-system` to validate coaching. Then `/improve-coaching` for regression prevention.
