# HoldemVision — Implementation Plan v2

## Vision

HoldemVision is a visual poker learning tool. It makes the invisible visible.

At a real table, a skilled player holds a mental map: where they stand against all possible holdings, what the opponent's actions reveal about their range, how each new card shifts the landscape. A learning player can't hold this map — they're guessing. HoldemVision externalizes that map so the user can see it, understand it, and eventually internalize it.

**The product is the visualization. Everything else serves it.**

- The card primitives exist to power the visualization
- The hand evaluator exists to explain what the user sees
- The equity calculator exists to quantify what the user sees
- The opponent modeling exists to filter what the user sees based on what opponents have told us
- The game engine exists to deliver cards to the visualization in a structured flow

---

## Product Principles

1. **Every computation explains itself.** No function returns a bare number. Every result carries a tree of reasoning the user can drill into. The explanation IS the product.

2. **Visualization first, automation second.** The user manually selects cards and sees the map. Automation (dealing, AI opponents) is layered in later as a delivery mechanism — it never replaces the core vision tool.

3. **The learning moment is the delta.** The gap between "equity in a vacuum" and "equity against what this opponent likely has" is where learning happens. The system must always show both perspectives.

4. **Architecture supports growth without refactors.** Each phase is a building block. Adding opponent modeling doesn't change the analysis system — it provides richer input. Adding GTO doesn't change the UI — it's a new lens producing the same output shape.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) + TypeScript (strict) |
| Backend/DB | Convex |
| Auth | Clerk (via Convex integration) |
| Styling | Tailwind + shadcn/ui + Framer Motion |
| Testing | Vitest + React Testing Library |
| Cards | SVG assets (52 cards + back) |
| Deploy | Vercel (frontend) + Convex Cloud (backend) |

---

## Core Architecture: The Analysis System

This is the foundation everything builds on. Every feature — from the simplest "show me my hand strength" to the most complex "what does GTO say about this multi-way pot with ICM considerations" — flows through these abstractions.

### The Analysis Pipeline

```
AnalysisContext (input)
       │
       ▼
 AnalysisLens (computation + explanation)
       │
       ▼
AnalysisResult (value + explanation tree + visual directives)
       │
       ▼
 UI Renderer (interprets visual directives into React components)
```

### Core Type Contracts

```typescript
// ═══════════════════════════════════════════════════════
// ANALYSIS CONTEXT — the standardized input to everything
// ═══════════════════════════════════════════════════════

interface AnalysisContext {
  // Known facts
  heroCards: Card[];
  communityCards: Card[];
  deadCards: Card[];
  street: Street;                        // "preflop" | "flop" | "turn" | "river"

  // Positional context (optional — not needed for pure hand analysis)
  position?: Position;
  numPlayers?: number;

  // Opponent information (optional — empty in Phase 1, populated when modeling is added)
  opponents: OpponentContext[];

  // Game context (optional — not needed until game engine is added)
  gameContext?: GameContext;
}

interface OpponentContext {
  seatIndex: number;
  label: string;                         // "Villain 1", "The Nit", etc.
  actions: PlayerAction[];               // what they've done this hand
  impliedRange: WeightedRange;           // derived from their actions + profile
  rangeDerivation: ExplanationNode;      // WHY we think this is their range
  profile?: OpponentProfile;             // their behavioral tree (when configured)
}

interface GameContext {
  pot: number;
  stackSizes: Map<number, number>;
  blinds: { small: number; big: number };
  ante?: number;
  tournamentContext?: {                  // for ICM lens
    payoutStructure: number[];
    remainingPlayers: number;
    averageStack: number;
  };
}

// ═══════════════════════════════════════════════════════
// ANALYSIS RESULT — the standardized output of everything
// ═══════════════════════════════════════════════════════

interface AnalysisResult<T = unknown> {
  // The computed value (equity number, hand rank, range grid, etc.)
  value: T;

  // The inputs that produced this result (for traceability)
  context: AnalysisContext;

  // Self-describing explanation tree
  explanation: ExplanationNode;

  // Instructions for the UI (data, not components)
  visuals: VisualDirective[];

  // Which lens produced this
  lensId: string;

  // What other results this depends on (for reactive recomputation)
  dependencies: string[];
}

// ═══════════════════════════════════════════════════════
// EXPLANATION NODE — the recursive reasoning tree
// ═══════════════════════════════════════════════════════

interface ExplanationNode {
  // What to show at this level
  summary: string;                       // "You have 72% equity"
  detail?: string;                       // longer explanation for drill-down
  sentiment?: "positive" | "negative" | "neutral" | "warning";

  // Sub-explanations (the tree branches)
  children?: ExplanationNode[];

  // Visual annotations tied to this explanation level
  highlights?: CardHighlight[];          // which cards to highlight and why
  rangeHighlights?: RangeHighlight[];    // which range cells to highlight

  // Comparisons (for showing deltas / what-ifs)
  comparisons?: {
    label: string;                       // "vs vacuum" | "vs opponent range" | "if turn is a heart"
    result: ExplanationNode;
  }[];

  // Tags for filtering / lens identification
  tags?: string[];                       // ["equity", "threat", "draw", "opponent-read"]
}

interface CardHighlight {
  cardIndex: number;
  status: "hero" | "community" | "dead" | "out" | "threat" | "neutral";
  reason: string;                        // "Completes flush for opponent"
  urgency: number;                       // 0-1, how important this highlight is
}

interface RangeHighlight {
  combo: string;                         // "AKs", "TT", "87o"
  weight: number;                        // 0-1, likelihood in range
  category: string;                      // "ahead" | "behind" | "drawing"
  color: string;                         // for the range grid cell
}

// ═══════════════════════════════════════════════════════
// VISUAL DIRECTIVE — data-only rendering instructions
// ═══════════════════════════════════════════════════════

interface VisualDirective {
  type: "card_grid" | "range_grid" | "equity_bar" | "equity_breakdown"
      | "hand_strength" | "threat_map" | "outs_display" | "action_indicator"
      | "comparison";
  data: Record<string, unknown>;         // type-specific payload
  priority: number;                      // ordering importance
  lensId: string;                        // which lens generated this
}

// ═══════════════════════════════════════════════════════
// ANALYSIS LENS — the pluggable computation interface
// ═══════════════════════════════════════════════════════

interface AnalysisLens {
  id: string;
  name: string;                          // "Raw Equity", "GTO", "ICM"
  description: string;
  analyze(context: AnalysisContext): AnalysisResult;
}

// Built-in lenses (each implemented as a separate module):
// - RawEquityLens: instant hand rank evaluation (no simulation)
// - MonteCarloLens: opt-in equity simulation (10k trials)
// - ThreatLens: what cards are dangerous on the next street
// - OutsLens: what cards improve hero's hand
// - DrawLens: flush/straight draw analysis
// - OpponentReadLens: equity vs opponent's implied range
// Future lenses (same interface, zero changes to existing code):
// - GTOLens: game-theory-optimal action recommendations
// - ICMLens: tournament equity adjustments

// ═══════════════════════════════════════════════════════
// OPPONENT PROFILE — situation-based behavioral model
// ═══════════════════════════════════════════════════════

// An opponent profile maps standard poker situations to behavioral
// parameters. Each situation has the same 5 configurable variables,
// but values differ per profile archetype. Supports inheritance via
// baseProfileId + overrides.

type SituationKey =
  | "preflop.open" | "preflop.facing_raise"
  | "preflop.facing_3bet" | "preflop.facing_4bet"
  | "postflop.aggressor.ip" | "postflop.aggressor.oop"
  | "postflop.caller.ip" | "postflop.caller.oop"
  | "postflop.facing_bet" | "postflop.facing_raise"
  | "postflop.facing_allin";

interface BehavioralParams {
  continuePct: number;                   // % of hands that continue (call/raise)
  raisePct: number;                      // % of continuing hands that raise vs call
  positionAwareness: number;             // 0-1: how much position adjusts these numbers
  bluffFrequency: number;               // 0-1: fraction of bets/raises that are bluffs
  sizings: SizingPreference[];           // bet/raise sizing preferences
  explanation: string;                   // teaching text for this situation
}

interface OpponentProfile {
  id: string;
  name: string;                          // "Nit", "LAG", "Calling Station"
  description: string;
  baseProfileId?: string;                // inheritance — "based on TAG"
  situations: Partial<Record<SituationKey, BehavioralParams>>;
  // Base profiles: all 11 populated. Derived profiles: only overrides.
}

// Display stats (vpip, pfr, etc.) are derived from the situation map
// via deriveTendencies() — never stored separately.
```

### How the Architecture Grows Without Refactors

| When we add... | What changes | What stays the same |
|----------------|-------------|-------------------|
| **Opponent modeling** | `AnalysisContext.opponents` gets populated | All existing lenses, UI, explanation structure |
| **GTO lens** | New class implementing `AnalysisLens` | All existing lenses, context, UI rendering |
| **ICM lens** | New class implementing `AnalysisLens`, uses `GameContext.tournamentContext` | Everything else |
| **AI opponents at the table** | Opponent profiles drive situation-based decisions, produce `OpponentContext` | Analysis pipeline, UI, explanation structure |
| **Game engine (dealing, automation)** | New orchestration layer that populates `AnalysisContext` from game state | All analysis, visualization, opponent modeling |
| **New poker variant (Omaha)** | New hand evaluator behind same interface, different `GameContext` | Analysis pipeline, UI, opponent modeling |

The key: **new capabilities add new inputs or new lenses. They never change the pipeline or the output shape.**

---

## Folder Structure

```
HoldemVision/
├── convex/                              # Convex backend
│   ├── _generated/                      # Auto-generated (do not edit)
│   ├── lib/                             # Pure TS domain logic (zero Convex imports)
│   │   ├── types/                       # Core type contracts
│   │   │   ├── analysis.ts              # AnalysisContext, AnalysisResult, ExplanationNode
│   │   │   ├── cards.ts                 # Card, Rank, Suit, Hand types
│   │   │   ├── opponents.ts             # OpponentProfile, SituationKey, BehavioralParams
│   │   │   ├── visuals.ts              # VisualDirective, CardHighlight, RangeHighlight
│   │   │   └── game.ts                 # GameContext, Street, Position, Action types
│   │   ├── primitives/                  # Card engine
│   │   │   ├── card.ts                  # Card encoding/decoding (0-51)
│   │   │   ├── deck.ts                  # Deck operations (shuffle, deal)
│   │   │   ├── hand-evaluator.ts        # Hand ranking (returns ExplanationNode)
│   │   │   └── constants.ts             # RANKS, SUITS, HAND_RANKINGS
│   │   ├── analysis/                    # Analysis lenses (each implements AnalysisLens)
│   │   │   ├── lens-registry.ts         # Registry of available lenses
│   │   │   ├── raw-equity.ts            # Instant hand strength (no simulation)
│   │   │   ├── monteCarloLens.ts        # Opt-in equity simulation (10k trials)
│   │   │   ├── threats.ts               # Threat card identification
│   │   │   ├── outs.ts                  # Outs calculation
│   │   │   ├── draws.ts                 # Draw analysis (flush, straight, etc.)
│   │   │   ├── monte-carlo.ts           # Monte Carlo engine (shared infrastructure)
│   │   │   └── opponentRead.ts          # Equity vs opponent's implied range
│   │   ├── opponents/                   # Opponent modeling
│   │   │   ├── presets.ts               # 5 preset profiles (Nit, Fish, TAG, LAG, GTO)
│   │   │   ├── profileResolver.ts       # Profile inheritance resolution
│   │   │   ├── rangeEstimator.ts        # Action → implied range derivation
│   │   │   └── combos.ts               # Hand combos and range utilities
│   │   ├── rules/                       # Game rules (added when game engine is built)
│   │   │   ├── actions.ts               # Legal action validation
│   │   │   ├── streets.ts               # Street progression
│   │   │   └── pot.ts                   # Pot / side pot calculation
│   │   └── state/                       # Game state machine (added with game engine)
│   │       ├── game-state.ts            # State types + transitions
│   │       └── state-machine.ts         # Pure state transition functions
│   ├── schema.ts                        # Database schema
│   ├── auth.config.ts                   # Clerk config
│   ├── users.ts                         # User sync from Clerk
│   ├── analyses.ts                      # Save/load analysis sessions
│   ├── profiles.ts                      # Opponent profile CRUD
│   ├── games.ts                         # Game session management (later phase)
│   ├── hands.ts                         # Hand state + game loop (later phase)
│   ├── actions_compute.ts               # Server-side analysis actions (Monte Carlo, etc.)
│   └── training.ts                      # Training stats (later phase)
├── src/
│   ├── app/                             # Next.js pages
│   │   ├── layout.tsx                   # Root layout + providers
│   │   ├── page.tsx                     # Landing / dashboard
│   │   ├── (auth)/sign-in/              # Clerk sign-in
│   │   ├── (auth)/sign-up/              # Clerk sign-up
│   │   ├── vision/                      # The core product
│   │   │   └── page.tsx                 # Vision workspace (card selection + analysis)
│   │   ├── profiles/                    # Opponent profile management (later)
│   │   ├── play/                        # Game mode (later)
│   │   └── training/                    # Training dashboard (later)
│   ├── components/
│   │   ├── providers/                   # ConvexProviderWithClerk
│   │   ├── ui/                          # shadcn/ui primitives
│   │   ├── cards/                       # Card visualization
│   │   │   ├── playing-card.tsx         # Single card (SVG)
│   │   │   ├── card-grid.tsx            # 52-card Deck Vision grid
│   │   │   ├── card-selector.tsx        # Card picker for manual selection
│   │   │   └── card-placeholder.tsx     # Face-down / empty
│   │   ├── analysis/                    # Analysis result renderers
│   │   │   ├── explanation-tree.tsx      # Renders any ExplanationNode as drillable tree
│   │   │   ├── visual-renderer.tsx       # Routes VisualDirective[] to correct component
│   │   │   ├── equity-display.tsx        # Equity bar / breakdown
│   │   │   ├── threat-panel.tsx          # Threat card highlights
│   │   │   ├── outs-display.tsx          # Outs visualization
│   │   │   └── range-grid.tsx            # 13x13 range visualization
│   │   ├── workspace/                   # Vision workspace layout
│   │   │   ├── vision-workspace.tsx     # Main workspace (card area + analysis panels)
│   │   │   ├── street-controls.tsx      # "Deal Flop" / "Deal Turn" / "New Hand" buttons
│   │   │   ├── lens-selector.tsx        # Choose which analysis lenses are active
│   │   │   └── board-display.tsx        # Hero cards + community cards display
│   │   └── opponents/                   # Opponent modeling UI (later)
│   │       ├── opponent-seat.tsx
│   │       ├── range-display.tsx
│   │       └── profile-editor.tsx
│   ├── hooks/
│   │   ├── use-analysis.ts              # Runs active lenses against current context
│   │   ├── use-card-selection.ts        # Card selection state management
│   │   └── use-deck-vision.ts           # Derives 52-card grid state from context
│   └── lib/
│       ├── card-assets.ts               # Card SVG mapping
│       ├── animations.ts                # Framer Motion variants
│       └── format.ts                    # Display formatting
├── tests/                               # Mirrors convex/lib/
│   ├── types/                           # Type contract tests
│   ├── primitives/                      # Card, deck, evaluator tests
│   ├── analysis/                        # Lens tests
│   └── opponents/                       # Profile + range tests
├── public/cards/                        # Card SVG assets
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── vitest.config.ts
└── package.json
```

---

## Convex Schema

The schema is designed for the vision-first approach. Game engine tables are defined but commented out until needed — they don't block the initial phases but their shape is known in advance.

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ─── Users (synced from Clerk) ───
  users: defineTable({
    clerkId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_clerk_id", ["clerkId"]),

  // ─── Analysis Sessions (saved vision workspace states) ───
  analysisSessions: defineTable({
    userId: v.id("users"),
    name: v.string(),                      // "AA vs Nit on wet board"
    heroCards: v.array(v.number()),         // card indices
    communityCards: v.array(v.number()),
    deadCards: v.array(v.number()),
    street: v.string(),
    opponents: v.array(v.object({
      label: v.string(),
      profileId: v.optional(v.id("opponentProfiles")),
      actions: v.array(v.object({
        street: v.string(),
        actionType: v.string(),
        amount: v.optional(v.number()),
      })),
    })),
    activeLenses: v.array(v.string()),     // which lenses were active
    notes: v.optional(v.string()),         // user's notes on this analysis
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  // ─── Opponent Profiles (situation-based behavioral model) ───
  opponentProfiles: defineTable({
    userId: v.optional(v.id("users")),     // null for system presets
    name: v.string(),                      // "Nit", "Loose Aggro Fish"
    isPreset: v.boolean(),
    description: v.string(),

    // Optional base profile for inheritance ("based on TAG but more aggressive")
    baseProfileId: v.optional(v.id("opponentProfiles")),

    // JSON-serialized Partial<Record<SituationKey, BehavioralParams>>
    situations: v.string(),

    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"])
    .index("by_preset", ["isPreset"]),

  // ─── User Preferences ───
  userPreferences: defineTable({
    userId: v.id("users"),
    defaultLenses: v.array(v.string()),    // which lenses active by default
    cardStyle: v.optional(v.string()),
    theme: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  // ─── Scenario Library (classic spots + user-created) ───
  scenarios: defineTable({
    title: v.string(),                     // "Overpair on Wet Board"
    category: v.string(),                  // "board_texture" | "cooler" | "drawing" | ...
    difficulty: v.string(),                // "beginner" | "intermediate" | "advanced"
    heroCards: v.array(v.number()),
    communityCards: v.array(v.number()),
    street: v.string(),
    lesson: v.string(),                    // teaching explanation for this spot
    tags: v.array(v.string()),             // ["wet_board", "overpair", "flush_draw"]
    isBuiltIn: v.boolean(),                // system scenarios vs user-created
    createdBy: v.optional(v.id("users")),
    // Future: opponents field for Phase 5 opponent-aware scenarios
  }).index("by_category", ["category"])
    .index("by_difficulty", ["difficulty"])
    .index("by_built_in", ["isBuiltIn"]),

  // ══════════════════════════════════════════════════
  // FUTURE TABLES (defined here for schema foresight,
  // uncommented when game engine phase begins)
  // ══════════════════════════════════════════════════

  // tableConfigs — saved table setups (seats, blinds, profiles)
  // gameSessions — active/completed game sessions
  // hands — core game state (deck, hole cards, community, pot)
  // handActions — action log per hand
  // trainingStats — per-session learning metrics
  // userStats — lifetime aggregate stats
});
```

---

## Phase-by-Phase Build Plan

### Phase 0: Environment Setup + Architecture Verification (4-6 hrs) — COMPLETE

The goal is to set up the dev environment, verify all connections, and validate core architectural patterns before writing any feature code.

**0A: Scaffold + Environment (1-2 hrs)**
- Scaffold via Convex CLI (`npm create convex@latest`) with Next.js 16 + TypeScript
- Add Tailwind + shadcn/ui
- Configure Vitest with path aliases matching `tsconfig.json`
- Create full folder structure
- Set up `.env.local` with Convex + Clerk keys
- Configure `.claude/launch.json` for dev servers
- Initialize git repo
- **Accept:** `npm run dev` + `npx convex dev` both run without errors

**0B: Auth Verification (1 hr)**
- Set up Clerk dev instance
- Configure `convex/auth.config.ts`
- Build `ConvexProviderWithClerk` in root layout
- Create sign-in/sign-up pages
- Create user sync (`convex/users.ts`)
- **Accept:** Sign in works, user appears in Convex `users` table

**0C: Reactivity Proof-of-Concept (1 hr)**
- Temporary table + query + mutation
- Trivial UI page subscribing to query
- Verify real-time reactivity in browser
- Verify auth-gated mutations reject anonymous calls
- **Accept:** Reactivity confirmed, auth works

**0D: Mutation-Action Chain Validation (1-2 hrs)**
- Validate: mutation → `scheduler.runAfter(0)` → action → `runMutation()` → repeat
- Measure latency of 5-step chain
- Verify internal functions are not client-callable
- **Accept:** Chain completes, <3s for 5 steps, internal functions secured

**0E: Pure TS + Vitest Validation (30 min)**
- Trivial module in `convex/lib/`, test it with Vitest
- **Accept:** Tests pass without Convex runtime

**0F: Cleanup**
- Remove temporary tables/functions
- Document gotchas in `docs/plans/architecture_notes.md`

---

### Phase 1: Core Types + Card Primitives (3-5 hrs) — COMPLETE

Build the type contracts that everything depends on, plus the card engine.

**What we build:**
- All core type contracts: `AnalysisContext`, `AnalysisResult`, `ExplanationNode`, `VisualDirective`, `AnalysisLens` interface
- Card/Rank/Suit types + encoding (0-51 integers)
- Deck operations (create, shuffle, deal, remove)
- Hand evaluator that returns `ExplanationNode` (not just a rank)
  - "You have two pair, Aces and Kings" with children explaining kickers, what beats you, etc.

**Key files:**
- `convex/lib/types/{analysis,cards,visuals,opponents,game}.ts`
- `convex/lib/primitives/{card,deck,hand-evaluator,constants}.ts`
- `tests/types/` and `tests/primitives/`

**Architectural contract established:**
- `AnalysisLens` interface is defined — all future lenses implement it
- `ExplanationNode` is defined — all future explanations use this tree
- `VisualDirective` is defined — all future visuals use this data shape
- Hand evaluator already returns explanation trees, setting the pattern

**Accept:**
- All 52 cards encode/decode correctly
- Hand evaluator identifies all 10 hand rankings with correct explanation trees
- Type contracts compile and are importable from any `convex/lib/` module
- 100% test coverage on primitives

---

### Phase 2: Analysis Lenses — Equity + Threats + Outs (6-8 hrs) — COMPLETE

Build the first analysis lenses that power the core vision.

**What we build:**
- `RawEquityLens` — instant hand rank evaluation (no simulation, zero lag)
  - Evaluates current hand rank (pair, flush, etc.) and preflop hand strength category
  - Returns explanation tree with hand rank and relative strength context
- `MonteCarloLens` — opt-in equity simulation (10,000 trials)
  - Monte Carlo engine for win/tie/lose percentages against random holdings
  - Separated from raw equity to avoid blocking the card selection hot path
  - Not in default active lenses — user toggles it on when they want simulation
- `ThreatLens` — which remaining cards are dangerous
  - Identifies cards that complete flushes, straights, give opponents trips/boats
  - Returns card highlights with urgency levels and reasons
- `OutsLens` — which cards improve hero's hand
  - Identifies outs to better hands (pair → two pair, draw → flush, etc.)
  - Returns card highlights + probability of improvement
- `DrawLens` — flush draw, straight draw, combo draw analysis
  - Identifies active draws, their outs, and odds of completing
- Lens registry — registers lenses, runs active lenses against a context

**Key files:**
- `convex/lib/analysis/{lens-registry,raw-equity,threats,outs,draws,monte-carlo}.ts`
- `tests/analysis/`

**Architectural contract established:**
- Lens registry pattern: add a lens by implementing the interface and registering it
- All lenses produce `AnalysisResult` with explanation trees and visual directives
- Monte Carlo engine is shared infrastructure (used by equity lens, reusable by future lenses)

**Accept:**
- Equity lens produces correct percentages (validated against known scenarios)
- Threat lens identifies all dangerous cards with correct reasons
- Outs lens correctly counts outs for all draw types
- All lenses return well-formed explanation trees
- Monte Carlo runs 50k trials in <500ms
- Adding a new lens requires zero changes to existing code

---

### Phase 3: Vision UI — The Core Product (10-14 hrs) — COMPLETE

Build the visual workspace where users see their poker situation.

**What we build:**
- **Card selector** — click to pick hero hole cards from the 52-card grid
- **Board display** — hero cards + community cards, clear visual layout
- **Street controls** — "Deal Random Flop" / "Pick Flop Cards" / "Deal Turn" / "New Hand"
- **Deck Vision grid** — all 52 cards showing status: hero, community, dead, out, threat, neutral
  - Each card's status comes from the analysis lenses (threat highlights, outs)
- **Explanation tree component** — renders any `ExplanationNode` as a drillable, collapsible tree
  - Summary visible by default, click to expand detail and children
- **Visual renderer** — takes `VisualDirective[]`, routes to correct display component
- **Equity display** — bar/breakdown showing win/tie/lose
- **Threat panel** — highlighted threat cards with reasons
- **Outs display** — highlighted out cards with improvement descriptions
- **Lens selector** — toggle which lenses are active
- **Vision workspace** — the main page composing all of the above

**Key files:**
- `src/components/cards/{playing-card,card-grid,card-selector,card-placeholder}.tsx`
- `src/components/analysis/{explanation-tree,visual-renderer,equity-display,threat-panel,outs-display}.tsx`
- `src/components/workspace/{vision-workspace,street-controls,lens-selector,board-display}.tsx`
- `src/hooks/{use-analysis,use-card-selection,use-deck-vision}.ts`
- `src/app/vision/page.tsx`

**The user experience:**
1. User picks two hole cards from the grid (e.g., A♠ K♥)
2. Deck Vision immediately updates — the grid shows these cards as "hero" and all analysis runs
3. User sees equity (85% preflop), explanation tree ("You have the strongest unpaired hand...")
4. User clicks "Deal Random Flop" — three community cards appear (e.g., K♠ 7♦ 2♣)
5. Everything updates instantly:
   - Equity recalculates (now 92% — you flopped top pair top kicker)
   - Threats highlight (another King gives someone trips, running hearts open a flush)
   - Outs show (the remaining Aces give you two pair)
   - Explanation tree restructures to explain the new situation
6. User can drill into any explanation node to understand WHY
7. User clicks "Deal Turn" — one more card, everything updates again
8. At any point, user can manually select specific cards instead of random

**Accept:**
- Full vision workspace renders and is interactive
- Card selection works (click to assign hero cards, community cards)
- Random deal works (deal flop/turn/river with random cards)
- All analysis lenses run and produce visible results
- Explanation trees are drillable (expand/collapse)
- Deck Vision grid accurately reflects all card statuses
- UI updates instantly when cards change (client-side computation for responsiveness)
- Clean, polished visual design (this IS the product)

---

### Phase 4: Persistence + Server-Side Analysis (4-6 hrs) — COMPLETE (backend)

Connect the vision workspace to Convex for saving sessions and running heavy computations server-side.
**Note:** UI for save/load deferred until UX pass. All backend infrastructure is deployed.

**What we built:**
- Full Convex schema deployed (users, analysisSessions, opponentProfiles, userPreferences, scenarios)
- Analysis session CRUD (`convex/analyses.ts`)
- Server-side Monte Carlo via Convex action (`convex/compute.ts`)
- User preferences upsert/get (`convex/preferences.ts`)
- Scenario library with 14 built-in scenarios (`convex/scenarios.ts` + `convex/lib/scenarios/builtInScenarios.ts`)

**Key files:**
- `convex/schema.ts` (full schema deployed)
- `convex/analyses.ts` (save/load session CRUD)
- `convex/compute.ts` (Monte Carlo action)
- `convex/preferences.ts`
- `convex/scenarios.ts` (scenario CRUD + seed)
- `convex/lib/scenarios/builtInScenarios.ts` (14 curated scenarios)

**Accept:**
- Can save a vision workspace state and reload it later
- Saved sessions appear in a list, can be named and annotated
- Heavy Monte Carlo runs server-side without blocking UI
- Preferences persist across sessions

---

### Phase 5: Opponent Modeling — Profiles + Range Estimation (8-12 hrs) — COMPLETE (backend)

Add opponents to the vision. This is where the learning tool becomes powerful.
**Note:** UI (opponent seats, profile editor) deferred until UX pass. All domain logic and Convex CRUD deployed.

**What we build:**
- **Opponent profile presets** — 5 situation-based profiles: Nit, Fish/Calling Station, TAG, LAG, GTO Approximation
  - Each maps 11 standard poker situations to behavioral parameters (continuePct, raisePct, positionAwareness, bluffFrequency, sizings, explanation)
  - E.g., Nit `preflop.facing_raise`: continuePct=5, raisePct=60, explanation="Only continues with premium hands"
- **Profile inheritance** — profiles can inherit from a base and override specific situations
  - E.g., "Aggressive TAG" inherits from TAG but overrides `preflop.open.continuePct` to 28%
  - `profileResolver.ts` walks the inheritance chain (max depth 5)
- **Range estimator** — given an opponent's profile + their actions, classifies each action into a SituationKey and derives their implied range
  - `classifyAction()` maps each action to the appropriate situation (e.g., preflop raise with no prior raise → `preflop.open`)
  - Uses situation-specific `continuePct` and `bluffFrequency` instead of flat tendencies
- **OpponentReadLens** — analysis lens showing equity against opponent's implied range (not vacuum)
  - Shows the delta: "82% in vacuum → 55% against this opponent's range"
  - Explanation tree traces back through the opponent's actions to explain the range
- **Fold equity analysis** — takes `BehavioralParams` for the relevant situation to compute fold probability
- **Profile CRUD** in Convex (save custom profiles, clone presets)

**Key files:**
- `convex/lib/types/opponents.ts` (SituationKey, BehavioralParams, OpponentProfile)
- `convex/lib/opponents/{presets,profileResolver,rangeEstimator,combos}.ts`
- `convex/lib/analysis/{opponentRead,foldEquity}.ts`
- `convex/profiles.ts`

**The user experience:**
1. User has A♠ K♥ on a K♠ 7♦ 2♣ board (from Phase 3)
2. User adds an opponent, assigns "Nit" profile
3. User records: "Nit 3-bet preflop, then bet 75% pot on flop"
4. System shows:
   - Nit's implied range (AA, KK, QQ, AK) with explanation tree
   - "Why this range: Nits 3-bet only ~4% of hands. This narrows to premium pairs and AK. The flop bet confirms they connected — QQ likely checks here."
   - Equity against Nit's range: "55% (down from 82% in vacuum)"
   - Explanation: "You're splitting with AK, crushed by KK (set), ahead of QQ/AA"
5. User sees the learning moment: "My top pair looks great in vacuum but this opponent's actions tell a different story"

**Accept:**
- All 5 preset profiles have all 11 situations populated with valid params
- Profile inheritance resolves correctly (child overrides parent, max depth 5)
- Range estimator classifies actions into situations and narrows ranges accordingly
- OpponentReadLens shows vacuum vs filtered equity with explanation
- Derived stats (vpip, pfr, etc.) computed from situation map match expected values
- Fold equity uses situation-specific params instead of flat tendencies

---

### Phase 6: Game Rules + State Machine (5-7 hrs)

Build the rules engine and state machine. This doesn't change the analysis system — it adds structured card delivery and action validation.

**What we build:**
- Street progression logic
- Legal action validation (`getLegalActions`, `validateAction`)
- Pot calculation (including side pots for multi-way all-ins)
- Blind/ante posting
- Game state types + pure state transition functions
- All functions return explanation-enriched results where applicable

**Key files:**
- `convex/lib/rules/{actions,streets,pot}.ts`
- `convex/lib/state/{game-state,state-machine}.ts`
- `tests/rules/`, `tests/state/`

**How this connects to the analysis system:**
- The state machine produces `AnalysisContext` from game state. The analysis pipeline is unchanged.
- `GameContext` (pot, stacks, blinds) is now populated from the state machine, enabling pot-odds-aware analysis.

**Accept:**
- Legal actions correctly identified for all scenarios
- Side pots calculated correctly
- State transitions are pure functions, fully testable
- State machine can produce an `AnalysisContext` from any game state

---

### Phase 7: Game Engine + AI Opponents (10-14 hrs)

The opponents come alive. Their decision trees drive actual play, and every decision is explained.

**What we build:**
- AI decision engine — reads opponent's situation-based profile given game state
  - Classifies the current situation (e.g., `postflop.facing_bet`) and uses behavioral params
  - Every AI decision produces an `ExplanationNode` (hidden during play, revealed after)
- Game session management in Convex
- Hand dealing (shuffle, deal, post blinds)
- Full game loop: mutation → action chain (validated in Phase 0D)
- `getPublicHandState` query (security-critical — opponent cards hidden until showdown)
- Game UI: poker table, seats, action controls
- Post-hand review: AI reasoning revealed, full hand replay with analysis at each street

**Key files:**
- `convex/lib/opponents/decisionEngine.ts` (AI situation-based decision making)
- `convex/games.ts`, `convex/hands.ts` (session + hand management)
- `convex/actions_ai.ts` (server-side AI decisions)
- `src/app/play/`, `src/components/table/`

**The user experience:**
1. User sets up a table: 6 seats, assigns profiles (2 Nits, 1 LAG, 1 Fish, 1 TAG)
2. Hits "Play" — cards are dealt, game begins
3. During play: the vision workspace is active alongside the table
   - User sees their hand, the board, the Deck Vision grid, equity, threats — everything from Phase 3
   - Opponents' actions are recorded automatically, their implied ranges update live
4. After each hand: full review mode
   - Opponent cards revealed
   - AI reasoning trees revealed ("The Nit folded because [tree]")
   - User can compare what they thought vs what actually happened

**Accept:**
- Full hands play from deal to showdown
- AI opponents behave consistently with their profiles
- AI reasoning is hidden during play, revealed after
- Vision workspace works during live play (same components, fed by game state)
- 100 hands complete without errors

---

### Phase 8: Training, History + Polish (8-12 hrs)

**What we build:**
- Hand history (save, browse, replay completed hands)
- Hand replayer (step through streets, see analysis at each point)
- Training stats dashboard (hands played, win rate, tendencies over time)
- Saved analysis sessions (from Phase 4) integrated into learning flow
- Animation polish (Framer Motion for card deals, reveals)
- Responsive design
- Error handling + loading states

---

### Phase 9: Future Lenses + Advanced Features (ongoing)

Each of these is a new `AnalysisLens` implementation. Zero changes to existing code.

- **GTOLens** — game-theory-optimal action recommendations
- **ICMLens** — tournament equity adjustments
- **Omaha support** — new hand evaluator variant, same analysis pipeline
- **Solver integration** — new lens wrapping external solver
- **Multi-user tables** — WebSocket layer on top of existing game engine

---

## Growth Trajectory

```
Phase 0: Environment verified ✓
    │
Phase 1: Types + Cards + Evaluator ✓
    │     (AnalysisContext defined, ExplanationNode pattern established)
    │
Phase 2: Analysis Lenses ✓
    │     (6 lenses: HandStrength + MonteCarloSim + Threats + Outs + Draws + OpponentRead)
    │     (MonteCarloLens split from HandStrength for zero-lag card selection)
    │
Phase 3: Vision UI ✓ ← FIRST USABLE PRODUCT
    │     (User can select cards, see analysis, drill into explanations)
    │
Phase 4: Persistence ✓
    │     (Schema deployed, CRUD + compute + scenarios backend ready, UI deferred)
    │
Phase 5: Opponent Modeling ✓ ← MAJOR LEARNING TOOL MILESTONE
    │     (Situation-based profiles with inheritance, 309 tests pass)
    │     (5 presets × 11 situations, profileResolver, classifyAction)
    │
Phase 6: Rules + State Machine
    │     (Structured game flow, state machine produces AnalysisContext)
    │
Phase 7: Game Engine + AI ← FULL INTERACTIVE EXPERIENCE
    │     (Opponents play autonomously, their trees drive decisions)
    │     (Vision workspace works during live play — same components)
    │
Phase 8: Training + Polish ← PRODUCTION READY
    │
Phase 9+: New lenses, new variants ← INFINITE EXTENSIBILITY
          (Each lens is one interface implementation, zero existing code changes)
```

Each arrow is additive. No phase requires refactoring a previous phase. The type contracts established in Phase 1 carry through to Phase 9+.
