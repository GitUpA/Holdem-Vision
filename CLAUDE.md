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

## Key Patterns

- Domain logic is pure TS in `convex/lib/` — no React, no Convex runtime.
- Opponent profiles use situation-based model (11 SituationKeys x BehavioralParams).
- 1 unified decision engine (`modified-gto`): GTO solver base + profile-specific frequency modifiers (NIT/FISH/TAG/LAG/GTO).
- `/vision` and `/drill` routes are public (no auth required).

## Lint Notes

- 15 React Compiler warnings (refs during render, setState in effect) are known and accepted.
- All other ESLint errors should be 0.
- TypeScript strict mode: 0 errors expected.

## Browser Verification

- `preview_*` tools don't work (Clerk auth redirects break embedded Chromium).
- Use `mcp__Claude_in_Chrome__*` tools instead for browser verification.
