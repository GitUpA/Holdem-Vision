# Test Inventory — 1437 Tests Across 82 Files

> **Note:** Counts updated 2026-04-01. Run `pnpm test` for current numbers.

## Summary

| Category | Files | Tests | Slowest | Purpose |
|---|---|---|---|---|
| Primitives | 4 | 73 | 33ms | Cards, deck, hand evaluator, positions |
| Rules | 3 | 66 | 13ms | Actions, pot calculation, street transitions |
| State | 2 | 63 | 29ms | State machine, card overrides |
| Session | 2 | 25 | 104ms | HandSession lifecycle, scenario helpers |
| Analysis | 14 | 112 | 10s | Lenses, coaching, Monte Carlo, snapshots |
| GTO | 14 | 503 | 1.3s | Archetypes, frequencies, scoring, drill pipeline |
| Opponents | 11 | 157 | 8.7s | Profiles, engines, range estimation |
| Pipeline | 6 | 10 | 14s | Batch runner, payoff matrix, coaching audit |
| Scenarios | 9 | 30 | 1.3s | Hand traces, outcome analysis, tuning |
| Other | 4 | 58 | 103ms | Replay, skills, audit |
| **Total** | **74** | **1290** | | |

## Per-File Detail

### Primitives (4 files, 73 tests)
| File | Tests | Time | What It Tests |
|---|---|---|---|
| `card.test.ts` | 13 | 8ms | Card creation, display, suit/rank |
| `deck.test.ts` | 9 | 33ms | Shuffle, deal, seeded RNG |
| `handEvaluator.test.ts` | 24 | 12ms | 5-card/7-card hand ranking, comparison |
| `position.test.ts` | 27 | 11ms | Position names, seat mapping, table sizes |

### Rules (3 files, 66 tests)
| File | Tests | Time | What It Tests |
|---|---|---|---|
| `actions.test.ts` | 22 | 8ms | Fold/check/call/bet/raise validation |
| `pot.test.ts` | 16 | 13ms | Pot calculation, side pots, all-in |
| `streets.test.ts` | 28 | 10ms | Street transitions, community card dealing |

### State Machine (2 files, 63 tests)
| File | Tests | Time | What It Tests |
|---|---|---|---|
| `state-machine.test.ts` | 40 | 29ms | Full game state transitions, betting rounds |
| `cardOverrides.test.ts` | 23 | 14ms | Card visibility, hero/villain card assignment |

### Session (2 files, 25 tests)
| File | Tests | Time | What It Tests |
|---|---|---|---|
| `handSession.test.ts` | 20 | 104ms | HandSession lifecycle, deal/act/advance, profiles |
| `scenarios.test.ts` | 5 | 78ms | Specific hand scenarios end-to-end |

### Analysis (14 files, 112 tests)
| File | Tests | Time | What It Tests |
|---|---|---|---|
| `coachingLens.test.ts` | 10 | 47ms | Coaching orchestration, profile consensus |
| `draws.test.ts` | 10 | 9ms | Draw detection (flush, straight, combo) |
| `equityRecommendation.test.ts` | 8 | 4.5s | Equity-based action recommendations |
| `foldEquity.test.ts` | 13 | 12ms | Fold equity scenarios |
| `handCommentator.test.ts` | 8 | 7ms | Coach narrative generation, GTO coherence |
| `handStepper.test.ts` | 10 | 48ms | Programmatic hand play, snapshot capture |
| `lensRegistry.test.ts` | 8 | 2s | All lens registration and execution |
| `monteCarlo.test.ts` | 8 | 5.7s | MC equity computation accuracy |
| `monteCarloLens.test.ts` | 8 | 10s | MC lens integration (slowest test) |
| `opponentStory.test.ts` | 11 | 4.5s | Opponent range narrative, equity vs range |
| `outs.test.ts` | 8 | 20ms | Outs counting |
| `rawEquity.test.ts` | 9 | 8ms | Raw equity calculation |
| `snapshotQuality.test.ts` | 1 | 34ms | 10 hand scenarios, full snapshot quality check |
| `threats.test.ts` | 8 | 8ms | Threat card detection |

### GTO (14 files, 503 tests)
| File | Tests | Time | What It Tests |
|---|---|---|---|
| `actionMapping.test.ts` | 21 | 6ms | GTO ↔ game action conversion |
| `actionNarratives.test.ts` | 8 | 8ms | Per-action story generation |
| `archetypeClassifier.test.ts` | 35 | 15ms | Spot classification (20 archetypes) |
| `archetypeExplainer.test.ts` | 17 | 12ms | Teaching explanations per archetype |
| `constrainedDealer.test.ts` | 19 | 85ms | Constrained dealing, position validation |
| `constrainedDealer.integration.test.ts` | 120 | 351ms | All 20 archetypes × 6 checks each. **1 FLAKY: ace_high_dry board texture match** |
| `drillPipeline.integration.test.ts` | 190 | 1.3s | Full drill pipeline across all archetypes |
| `evScoring.test.ts` | 20 | 12ms | Verdict thresholds, EV loss, action normalization |
| `flushDetection.test.ts` | 7 | 21ms | Flush draw/made flush detection |
| `frequencyBands.test.ts` | 49 | 20ms | Per-action frequency distributions |
| `frequencyTables.test.ts` | 47 | 19ms | Solver table loading and lookup |
| `handCategorizer.test.ts` | 52 | 19ms | 14 hand categories across 52 test cases |
| `narrativeContext.test.ts` | 32 | 10ms | Board narrative headlines |
| `narrativeFeedback.test.ts` | 9 | 10ms | Post-action coaching feedback |
| `narrativePrompts.test.ts` | 12 | 8ms | Narrative intent prompts |
| `narrativeSummary.test.ts` | 7 | 6ms | Hand summary generation |
| `preflopDataQuality.test.ts` | 4 | 5ms | PokerBench data audit: premiums, range sizes |

### Opponents (11 files, 157 tests)
| File | Tests | Time | What It Tests |
|---|---|---|---|
| `autoPlay.test.ts` | 25 | 70ms | Profile-driven auto-play, facing bet logic |
| `combos.test.ts` | 16 | 77ms | Hand class conversion, combo counting |
| `boardTexture.test.ts` | 10 | 6ms | Wetness, pairing, monotone detection |
| `drawDetector.test.ts` | 12 | 6ms | Draw detection integration |
| `engineRegistry.test.ts` | 5 | 5ms | Engine registration, fallback |
| `modifiedGtoEngine.test.ts` | 10 | 86ms | Unified engine, modifier application |
| `modifierTransform.test.ts` | 20 | 12ms | Frequency modification math |
| `narrativeEngine.test.ts` | 16 | 16ms | Character narratives per profile |
| `narrativeTraits.test.ts` | 29 | 16ms | Trait-based narrative generation |
| `unifiedFrequencies.test.ts` | 11 | 20ms | Frequency unification across profiles |
| `opponentRead.test.ts` | 9 | 8.7s | Opponent read lens (MC-dependent) |
| `presets.test.ts` | 13 | 15ms | 5 preset profiles validation |
| `profileResolver.test.ts` | 8 | 7ms | Profile inheritance resolution |
| `rangeEstimator.test.ts` | 18 | 48ms | Range narrowing from actions |

### Pipeline (6 files, 10 tests)
| File | Tests | Time | What It Tests |
|---|---|---|---|
| `coachingAudit.test.ts` | 2 | 1.5s | 1000 hands coaching coherence (0 issues) |
| `diagnosticRunner.test.ts` | 1 | 1s | 2000 hands per-street P&L breakdown |
| `payoffMatrix.test.ts` | 2 | 4s | Full K×K matrix + confidence model |
| `profileTuning.test.ts` | 1 | 14s | 5-profile matrix with 3-seed averaging |
| `symmetricValidation.test.ts` | 3 | 1.5s | GTO vs GTO fairness + profile ordering |
| `varianceCheck.test.ts` | 1 | 4.7s | 20K hands convergence to ~0 |

### Scenarios (9 files, 30 tests)
| File | Tests | Time | What It Tests |
|---|---|---|---|
| `agentBaseline.test.ts` | 1 | 233ms | AI agent student baseline accuracy |
| `archetypeAutomation.test.ts` | 2 | 299ms | All 20 archetypes coaching + classifier validation |
| `batchValidation.test.ts` | 1 | 736ms | 100-hand batch: narrative quality, reach rate |
| `captureTraces.test.ts` | 10 | 126ms | Full hand traces with coaching output |
| `learnerSimulation.test.ts` | 1 | 564ms | Simulated student learning effectiveness |
| `outcomeAnalysis.test.ts` | 1 | 935ms | 500 hands: showdown + fold analysis |
| `preflopTuning.test.ts` | 1 | 1.3s | 1000 hands: position/strength analysis |
| `scenarioAnalysis.test.ts` | 12 | 336ms | Batch pattern analysis |
| `streetAnalysis.test.ts` | 1 | 949ms | Per-street action distributions |

### Other (4 files, 58 tests)
| File | Tests | Time | What It Tests |
|---|---|---|---|
| `handRecorder.test.ts` | 19 | 68ms | Audit event recording, coaching snapshots |
| `buildTimeline.test.ts` | 15 | 103ms | Replay timeline construction |
| `skillTree.test.ts` | 18 | 13ms | Skill tree structure validation |
| `cardOverrides.test.ts` | (counted in State) | | |

## Known Issues

1. **1 flaky test**: `constrainedDealer.integration.test.ts` → `ace_high_dry_rainbow: board texture matches archetype` — randomness-dependent, fails ~30% of runs. The dealt board occasionally doesn't match the archetype classification due to edge cases in texture detection. Not a system bug.

## Performance Notes

- **Slowest file**: `monteCarloLens.test.ts` (10s) — runs 8 Monte Carlo equity computations
- **Slowest pipeline test**: `profileTuning.test.ts` (14s) — runs 5-profile × 3-seed × 1000 hands = 15,000 hands
- **Total suite time**: ~60-90s depending on machine load
- **Headless throughput**: ~1000 hands/second in batch runner

## Test Categories by Purpose

### Unit Tests (fast, isolated)
Primitives, Rules, State, most GTO tests — verify individual functions work correctly.

### Integration Tests (medium, composed)
coachingLens, handSession, drillPipeline, constrainedDealer — verify components work together.

### Statistical Tests (slow, volume)
Pipeline tests (batch runner, payoff matrix, coaching audit) — verify system behavior over 1000+ hands.

### Scenario Tests (medium, end-to-end)
captureTraces, outcomeAnalysis, archetypeAutomation — verify coaching quality on realistic hands.
