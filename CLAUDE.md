# HoldemVision

Texas Hold'em poker visualization & learning platform.

## Stack

- **Runtime**: Next.js 16 + React 19
- **Backend**: Convex (serverless)
- **Auth**: Clerk
- **Styling**: Tailwind CSS + shadcn/ui
- **Testing**: Vitest
- **Package manager**: pnpm

## Commands

```bash
# Install dependencies
pnpm install

# Dev server
pnpm dev

# Type check
pnpm tsc --noEmit

# Lint (ESLint)
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
- Decision engines: `buildDecisionContext()` -> `engine.decide(ctx)` -> `EngineDecision`
- All engines output `ActionFrequencies` in `reasoning.frequencies` for unified UI display.

## Key Patterns

- Domain logic is pure TS in `convex/lib/` — no React, no Convex runtime.
- Opponent profiles use situation-based model (11 SituationKeys x BehavioralParams).
- 4 decision engines: basic, range-aware, gto (heuristic), lookup-gto (solver data).
- `/vision` and `/drill` routes are public (no auth required).

## Lint Notes

- 15 React Compiler warnings (refs during render, setState in effect) are known and accepted.
- All other ESLint errors should be 0.
- TypeScript strict mode: 0 errors expected.

## Browser Verification

- `preview_*` tools don't work (Clerk auth redirects break embedded Chromium).
- Use `mcp__Claude_in_Chrome__*` tools instead for browser verification.
