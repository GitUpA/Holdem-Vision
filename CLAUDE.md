# HoldemVision

Texas Hold'em poker visualization & learning platform.

## Stack

- **Runtime**: Next.js 16 + React 19
- **Backend**: Convex (serverless)
- **Auth**: Clerk
- **Styling**: Tailwind CSS + shadcn/ui
- **Testing**: Vitest
- **Package manager**: pnpm

## ⛔ Critical Rules - READ FIRST

**Bash - NEVER use these patterns:**
- ❌ `| head` / `| tail` - causes output buffering, commands hang
- ❌ `| grep ... | head` - same issue with chained pipes
- ❌ `| less` / `| more` - interactive, will hang
- ✅ Use command flags instead: `git log -n 10` not `git log | head -10`
- ✅ Let commands complete fully, or use tool-specific limits

**File Operations - Use dedicated tools, not bash:**
- ❌ `cat`, `head`, `tail` → ✅ Use `Read` tool
- ❌ `grep`, `rg` → ✅ Use `Grep` tool
- ❌ `find`, `ls` → ✅ Use `Glob` tool
- ❌ `sed`, `awk` → ✅ Use `Edit` tool

## Commands

```bash
# Install dependencies
pnpm install

# Dev server
pnpm dev

# Type check (Run After Code Changes)
pnpm tsc --noEmit

# Lint (ESLint) (Run After Code Changes)
pnpm run lint

# Tests
pnpm test          # run once
pnpm test:watch    # watch mode
```

## Architecture

- `convex/lib/` — Pure TypeScript domain logic (zero Convex imports). Testable with Vitest.
- `convex/` (top-level functions) — Thin orchestration over pure logic.
- `src/hooks/` — React hooks bridging UI to domain logic.
- `src/components/` — React UI components.
- Core pipeline: `AnalysisContext` -> `AnalysisLens` -> `AnalysisResult`
- Decision engine: `buildDecisionContext()` -> `engine.decide(ctx)` -> `EngineDecision`
- Single unified engine (`modified-gto`) outputs `ActionFrequencies` in `reasoning.frequencies`.
- **First principles**: `docs/first-principles.md` — 10-layer architecture from poker mechanics to meta-GTO.
- **Hand pipeline**: `docs/plans/hand_pipeline_plan.md` — 9-phase implementation plan.

## Key Patterns

- Domain logic is pure TS in `convex/lib/` — no React, no Convex runtime.
- Opponent profiles use situation-based model (11 SituationKeys x BehavioralParams).
- 1 unified decision engine (`modified-gto`): GTO solver base + profile-specific frequency modifiers (NIT/FISH/TAG/LAG/GTO).
- **One system**: Free Play and Archetype mode are identical except board generation (random vs constrained).
- **Every seat is a player**: hero is the seat that pauses for human input. Headless mode auto-plays hero.
- **Coach is blind**: coaching infers opponent behavior from actions, never reads assigned profile labels.
- **Pre-compute strategy**: preflop uses PokerBench data, postflop uses solver tables (56 facing-bet tables across 4 scenarios × 8 archetypes × 3 streets), equity uses lookup tables. Zero Monte Carlo in headless/Convex.
- `/vision` is public (no auth required). Archetype mode at `/vision?mode=drill`.

## Solver Data Storage

- **D: drive** (`D:/HoldemVision/solver_data/`) — primary storage for large solver outputs (12TB available)
  - `outputs/` — 193 flop raw solver JSONs (108MB)
  - `turn_outputs/` — turn solver outputs (pending)
  - `river_outputs/` — river solver outputs (pending)
  - `frequency_tables/` — parsed frequency tables (2.4MB)
- **Project dir** (`data/solver/outputs/`, `data/frequency_tables/`) — working copies used by build/tests
- Solver batch scripts (`batch_solve.py`, `batch_turn_river.py`) should output to D: drive
- `parseFacingBet.mjs` can read from D: paths

## Pipeline Modules (`convex/lib/pipeline/`)

- `handContext.ts` — Seat-agnostic, observable-only context struct (funnel tracking).
- `handPipeline.ts` — Builds/updates HandContext at each street transition.
- `batchRunner.ts` — Deterministic headless runner for statistical validation.
- Used by: `HandSession` (UI), `HandStepper` (headless), payoff matrix tests.

## Knowledge Base (`convex/lib/knowledge/`)

**All user-facing educational content lives here.** Never hardcode explanatory text in UI components.

- Central source of truth for: term definitions, concept explanations, feature descriptions, archetype teaching, profile descriptions, strategy primers.
- Each entry has 3 tiers: `short` (tooltip/badge), `medium` (info bubble/inline), `full` (drawer/panel).
- Lookup via `getKnowledge(id)` — UI components pull content by key, never own it.
- Categories: `term` (poker vocab), `concept` (strategy), `feature` (app functionality), `archetype` (spot types), `profile` (player types).
- When adding new UI that explains anything to the user → add a knowledge entry first, then reference it.

## Lint Notes

- 15 React Compiler warnings (refs during render, setState in effect) are known and accepted.
- All other ESLint errors should be 0.
- TypeScript strict mode: 0 errors expected.

## Browser Verification

- `preview_*` tools don't work (Clerk auth redirects break embedded Chromium).
- Use `mcp__Claude_in_Chrome__*` tools instead for browser verification.
