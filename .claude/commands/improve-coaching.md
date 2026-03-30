# Self-Improving Coaching Loop

Play hands through the system, read coaching output, identify issues, fix them, verify.

## Process

1. **Play hands** — Run `npx vitest run tests/pipeline/coachingDump.test.ts` to play 10 hands with full coaching output
2. **Read the output** — Analyze every coaching narrative for:
   - Contradictions (e.g., "Fold." then "GTO confirms: call")
   - Wrong hand categorization (e.g., pocket pair called "air")
   - Unreasonable opponent ranges (too narrow or too wide)
   - Equity that doesn't match hand strength
   - Premature reads with insufficient data
   - Repetitive or unhelpful language
   - Missing board texture warnings
   - Narrative that doesn't match the recommended action
3. **Run audits** — Run `npx vitest run tests/pipeline/semanticAudit.test.ts tests/pipeline/coachingAudit.test.ts` (1000+ hands, automated checks)
4. **Fix issues found** — Edit the relevant files:
   - `convex/lib/gto/handCategorizer.ts` — hand classification
   - `convex/lib/opponents/rangeEstimator.ts` — range narrowing
   - `convex/lib/opponents/behaviorInference.ts` — action-based inference
   - `convex/lib/analysis/handCommentator.ts` — coaching narratives
   - `convex/lib/analysis/opponentStory.ts` — opponent range stories
   - `convex/lib/analysis/snapshot.ts` — coaching snapshot assembly
   - `convex/lib/gto/frequencyLookup.ts` — GTO frequency data
   - `convex/lib/pipeline/counterStrategyMap.ts` — exploit advice
5. **Verify** — Run the full test suite: `npx vitest run`
6. **Repeat** — Go to step 1 with different seeds. The coaching dump uses seeds 55000-55009. For variety, edit the test temporarily to use different seed ranges.

## Semantic Checks (automated in semanticAudit.test.ts)

The audit runs 10 checks across 1000 hands:
1. STRONG_CALLED_WEAK — premium hands described as weak
2. WEAK_CALLED_STRONG — air described as strong
3. REC_VS_GTO_CONTRADICTION — recommendation opposes GTO
4. STRONG_HAND_FOLD — strong hand told to fold frequently
5. WEAK_HAND_RAISE — air told to bet/raise frequently
6. PREMATURE_STRONG_READ — "strong read" with <2 actions
7. MISSING_ACTION_STORIES — no action narratives when options exist
8. FOLD_THEN_GTO_CONTINUE — "Fold" then "GTO confirms: call"
9. EQUITY_OUT_OF_RANGE — equity outside 0-1
10. PREFLOP_ARCHETYPE_ON_POSTFLOP — wrong archetype for street

## Quality Targets

- Semantic audit: 0 errors, 0 warnings on 1000 hands
- Coaching audit: 0 issues on 1000 hands
- Full test suite: all pass (1 known flaky: constrainedDealer ace_high_dry)
- TypeScript: 0 errors

## Adding New Checks

When you find a new coaching issue class, add a check to `tests/pipeline/semanticAudit.test.ts`. This makes the issue machine-detectable so it never regresses.

## Key Architecture

- **Coach is blind**: coaching infers behavior from actions, never reads assigned profiles
- **One engine**: `modifiedGtoEngine.decide()` serves hero autoAct, villain auto-play, and coaching
- **GTO is primary**: recommendations follow GTO frequencies; opponent stories add narrative context
- **Confidence-aware**: coaching language adjusts based on data confidence tier
