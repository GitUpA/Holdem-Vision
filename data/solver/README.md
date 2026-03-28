# Solver Data — Storage & Inventory

## Storage Locations

### Project directory (here)
- `inputs/` — 193 flop solver input files (text, small)
- `inputs_turn_river/` — 570 turn/river solver input files (text, small)
- `outputs/` — **193 flop raw solver JSONs (~108MB)** — ALSO on D: drive
- `outputs_turn_river/` — **570 turn/river raw solver JSONs (~7.4GB)** — ALSO on D: drive
- `manifest.json` — flop board manifest (193 boards × 8 archetypes)
- `manifest_turn_river.json` — turn/river manifest (96 turn + 474 river)
- `manifest_turn_river_flat.json` — flattened version for parseFacingBet.mjs
- `batch_solve.py` — flop solver batch script
- `batch_turn_river.py` — turn/river solver batch script (outputs to D:)
- `parseFacingBet.mjs` — Node.js parser that extracts facing-bet data from raw outputs
- `texassolver/` — TexasSolver GPU binary (console_solver.exe)

### D: drive (primary storage for large files)
- `D:/HoldemVision/solver_data/outputs/` — copy of flop raw JSONs (108MB)
- `D:/HoldemVision/solver_data/turn_river_outputs/` — copy of turn/river raw JSONs (7.4GB)
- `D:/HoldemVision/solver_data/frequency_tables/` — copy of parsed tables (2.4MB)

### Parsed output (used by the app)
- `data/frequency_tables/` — 24 action frequency tables + 24 facing-bet tables
  - `{archetype}.json` — first-to-act frequencies per category (8 flop)
  - `turn_{archetype}.json` — turn action frequencies (8)
  - `river_{archetype}.json` — river action frequencies (8)
  - `{archetype}_facing_bet.json` — flop facing-bet fold/call/raise (8)
  - `turn_{archetype}_facing_bet.json` — turn facing-bet (8)
  - `river_{archetype}_facing_bet.json` — river facing-bet (8)

## What Exists (as of 2026-03-28)

| Data | Files | Size | Location |
|---|---|---|---|
| Flop raw solver outputs | 193 | 108MB | `outputs/` + D: |
| Turn/river raw solver outputs | 570 | 7.4GB | `outputs_turn_river/` + D: |
| Flop action frequency tables | 8 | ~650KB | `data/frequency_tables/` |
| Turn action frequency tables | 8 | ~300KB | `data/frequency_tables/` |
| River action frequency tables | 8 | ~300KB | `data/frequency_tables/` |
| Flop facing-bet tables | 8 | ~160KB | `data/frequency_tables/` |
| Turn facing-bet tables | 8 | ~160KB | `data/frequency_tables/` |
| River facing-bet tables | 8 | ~160KB | `data/frequency_tables/` |
| Preflop PokerBench data | 5 | ~2MB | `data/pokerbench/preflop_tables/` |
| Solver input files | 763 | ~5MB | `inputs/` + `inputs_turn_river/` |

## IMPORTANT NOTES

1. **Data exists in TWO places** — project dir AND D: drive. Both are copies. Neither is authoritative. If regenerating, output to D: and copy parsed tables to project.

2. **Raw outputs are NOT in git** — `.gitignore` excludes `outputs/` and `outputs_turn_river/`. Only parsed frequency tables are committed.

3. **Turn/river outputs already ran** — 570 files exist from a previous batch_turn_river.py run. Do NOT re-run the 5-hour GPU batch unless you need different parameters.

4. **Facing-bet data was parsed from existing outputs** — `parseFacingBet.mjs` extracts fold/call/raise frequencies from the solver game tree's BET child nodes. The data was always in the raw outputs, just never parsed until 2026-03-28.

5. **PokerBench preflop data has label mismatches** — `three_bet_pots.json` is actually "facing a 3-bet" data, `four_bet_five_bet.json` is "facing a 4-bet". The system swaps labels at lookup time in `frequencyLookup.ts`. See `docs/plans/data_quality_plan.md`.

6. **Solver runs used FULL ranges (1326 combos)** — future runs should restrict ranges to position-appropriate opening/defending ranges from `preflopRanges.ts` for more accurate postflop data.

## How to Regenerate

```bash
# Flop batch (193 boards, ~5.4 hours on RTX 3090)
python batch_solve.py run
python batch_solve.py parse

# Turn/river batch (570 boards, ~5 hours on RTX 3090)
python batch_turn_river.py run    # outputs to D:/HoldemVision/solver_data/turn_river_outputs/
python batch_turn_river.py parse

# Parse facing-bet from raw outputs
node parseFacingBet.mjs                                    # flop (default manifest + outputs)
node parseFacingBet.mjs manifest_turn_river_flat.json D:/HoldemVision/solver_data/turn_river_outputs  # turn/river
```
