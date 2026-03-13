# GTO Trainer — Lookup Engine + Replay/Drill System

## Current Status (756 tests, 2026-03-12)

| Phase | Status | Tests |
|-------|--------|-------|
| A: Data Foundation | COMPLETE (193/193 solver boards) | ~100 |
| B: Lookup Engine + Scoring | COMPLETE | ~60 |
| C: Hand Replay | COMPLETE | 15 |
| D: Drill Mode | COMPLETE | 40 |
| Frequency Bands + Accuracy | COMPLETE | 49 |
| E: Training Dashboard | NOT STARTED | — |
| Post-phase DRY-up + UI polish | COMPLETE | — |

## Vision

Replace the heuristic GTO engine with **precomputed frequency tables** for the 20 core archetypes that drive ~80% of win-rate in 6-max cash. Build a **replay/drill system** on top that teaches users GTO through spaced repetition.

The key insight: you don't need a solver. You need ~2,000 frequency entries across 20 archetypes. The app scores users against those fixed baselines forever.

The second insight: the **hand replayer** and **drill mode** share 90% of their UI — both are "show hand state at a decision point." Replay reads from a recording; drill pauses for live input and scores.

---

## The 20 Core Archetypes

### Preflop Foundations (5)

| # | Archetype | Why It Matters |
|---|-----------|---------------|
| 1 | **RFI Opening Ranges** (UTG → BTN) | Base layer — every hand starts here |
| 2 | **BB Defense vs RFI** (fold/call/3-bet by position) | Highest-frequency decision in poker |
| 3 | **3-Bet Pots** (IP as 3-bettor + OOP as caller) | Bigger pots, bigger mistakes |
| 4 | **Blind-vs-Blind** (SB RFI vs BB + SB 3-bet vs BB) | Unique dynamics, constant occurrence |
| 5 | **4-Bet / 5-Bet Polarized** (value/bluff ratios) | Low frequency but massive pot size |

### Flop Textures — Single-Raised Pots (8, BTN vs BB focus)

| # | Archetype | Coverage |
|---|-----------|---------|
| 6 | **Ace-High Dry Rainbow** (Axx rainbow) | #1 most important flop texture |
| 7 | **King/Queen-High Dry Rainbow** | Second most common high-card boards |
| 8 | **Mid/Low Dry Rainbow** (7xx–Txx rainbow) | Different strategy — less range advantage |
| 9 | **Paired Boards** (xxP) | 17% of all flops |
| 10 | **Two-Tone Disconnected** | Most common flush-draw boards |
| 11 | **Two-Tone Connected** | Straight-draw heavy |
| 12 | **Monotone** | Flush completes everything |
| 13 | **Rainbow Connected / Straight-Draw Heavy** | Multi-draw boards |

### Postflop Principles (7)

| # | Archetype | Why It Matters |
|---|-----------|---------------|
| 14 | **C-Bet Sizing & Frequency** (small merged vs overbet polarized) | Applies to every texture above |
| 15 | **Turn Barreling & Probe Defense** | Where amateurs give up or over-barrel |
| 16 | **River Bluff-Catching & MDF** | Biggest leak at every stake |
| 17 | **Thin Value Betting on River** | Missing value = missing profit |
| 18 | **Overbet River Spots** (polarized nuts vs bluffs) | High EV swing when applied correctly |
| 19 | **3-Bet Pot Postflop Continuation** (OOP as 3-bettor) | Unique dynamics vs single-raised pots |
| 20 | **Exploitative Overrides** (vs over-folders, fish, capped ranges) | The 20% that prints the most money |

---

## Dependency Graph

```
Phase A: Data Foundation
    │
    ├─► Phase B: Lookup GTO Engine
    │       │
    │       └─► Phase D: Drill Mode ─────────────┐
    │                                              │
    └─► Phase C: Hand State Viewer + Replay       │
            │                                      │
            └──────────────────────────────────────┤
                                                   ▼
                                            Phase E: Training
                                              Dashboard +
                                            Spaced Repetition
```

- **A** has no dependencies (data work + classifiers)
- **B** depends on A (engine needs tables + classifiers)
- **C** depends on nothing new (uses existing HandRecord + UI components)
- **D** depends on B + C (drill = live engine scoring + hand state viewer)
- **E** depends on D (tracking needs drill sessions producing scores)

---

## Phase A: Data Foundation (6–8 hrs)

Build the classification and data layers. No UI. All pure TS in `convex/lib/`, fully testable.

### A1: Archetype Classifier

**New file:** `convex/lib/gto/archetypeClassifier.ts`

Classifies a game state into one of 20 archetype IDs.

**Inputs:**
- Street (preflop / flop / turn / river)
- Pot type (single-raised, 3-bet, 4-bet, blind-vs-blind)
- Positions involved (raiser position, caller position)
- Board texture (from existing `analyzeBoard()`)
- Action history (facing bet, facing raise, c-bet opportunity, etc.)

**Output:**
```typescript
interface ArchetypeClassification {
  archetypeId: ArchetypeId;        // "ace_high_dry_rainbow", "bb_defense_vs_rfi", etc.
  confidence: number;              // 0-1, how cleanly this spot fits
  category: "preflop" | "flop_texture" | "postflop_principle";
  description: string;             // human-readable label
  fallback?: ArchetypeId;          // closest match if confidence < threshold
}

type ArchetypeId =
  | "rfi_opening"
  | "bb_defense_vs_rfi"
  | "three_bet_pots"
  | "blind_vs_blind"
  | "four_bet_five_bet"
  | "ace_high_dry_rainbow"
  | "kq_high_dry_rainbow"
  | "mid_low_dry_rainbow"
  | "paired_boards"
  | "two_tone_disconnected"
  | "two_tone_connected"
  | "monotone"
  | "rainbow_connected"
  | "cbet_sizing_frequency"
  | "turn_barreling"
  | "river_bluff_catching_mdf"
  | "thin_value_river"
  | "overbet_river"
  | "three_bet_pot_postflop"
  | "exploitative_overrides";
```

**Implementation notes:**
- Preflop archetypes (1–5): classified from action history + positions. Extends existing `classifyAction()` in `rangeEstimator.ts`.
- Flop texture archetypes (6–13): classified from `analyzeBoard()` output. The existing `BoardTexture` (wetness, monotone, paired, connected, highCard) maps directly.
- Postflop principle archetypes (14–20): classified from street + action context (c-bet opportunity, facing bet on river, etc.)

**Tests:** `tests/gto/archetypeClassifier.test.ts`
- Each of 20 archetypes has at least 2 test cases
- Edge cases: spots that could match multiple archetypes
- Confidence thresholds

### A2: Hand Categorizer

**New file:** `convex/lib/gto/handCategorizer.ts`

Classifies hero's hand relative to the board into a category the frequency tables use.

```typescript
type HandCategory =
  | "premium_pair"          // AA, KK
  | "overpair"              // pair above board
  | "top_pair_top_kicker"   // TPTK
  | "top_pair_weak_kicker"  // top pair, bad kicker
  | "middle_pair"
  | "bottom_pair"
  | "two_pair"
  | "sets_plus"             // set, straight, flush, boat, quads
  | "overcards"             // two overs, no pair
  | "overcards_with_draw"   // overs + flush/straight draw
  | "flush_draw"            // 4 to a flush
  | "straight_draw"         // OESD or gutshot
  | "combo_draw"            // flush + straight draw
  | "weak_draw"             // backdoor only
  | "air";                  // nothing

interface HandCategorization {
  category: HandCategory;
  subCategory?: string;      // "nut_flush_draw", "gutshot", etc.
  relativeStrength: number;  // 0-1 within category
  description: string;
}
```

**Implementation notes:**
- Uses existing `evaluateHand()` for made-hand tier
- Uses existing `detectDraws()` for draw classification
- New logic: "relative to board" — is your pair top/middle/bottom? Are your overcards above the board?
- Preflop: maps to standard hand groups (premium, broadway, suited connectors, etc.)

**Tests:** `tests/gto/handCategorizer.test.ts`
- All 15 hand categories tested
- Board-relative classification (same hand, different boards = different categories)

### A3: Frequency Tables (Data)

**New directory:** `convex/lib/gto/tables/`

One JSON file per archetype. Structure:

```typescript
interface FrequencyTable {
  archetypeId: ArchetypeId;
  name: string;
  description: string;
  context: {
    street: Street;
    potType: "srp" | "3bet" | "4bet" | "bvb";
    heroPosition: Position | Position[];   // which positions this applies to
    villainPosition: Position | Position[];
  };
  // Hand category → action → frequency (0-1)
  frequencies: Record<HandCategory, Record<string, number>>;
  // Available actions for this archetype
  actions: string[];  // ["check", "bet_33", "bet_75", "overbet", "fold", "call", "raise"]
  // Teaching notes
  keyPrinciple: string;        // one-line "why" for this archetype
  commonMistakes: string[];    // what players get wrong
  source?: string;             // "GTO Wizard 2025" / "Upswing free charts" etc.
}
```

**Example entry (Archetype #6 — Ace-High Dry Rainbow, BTN vs BB SRP):**
```json
{
  "archetypeId": "ace_high_dry_rainbow",
  "name": "Ace-High Dry Rainbow",
  "description": "Axx rainbow flop in single-raised pot, BTN vs BB",
  "context": {
    "street": "flop",
    "potType": "srp",
    "heroPosition": "btn",
    "villainPosition": "bb"
  },
  "frequencies": {
    "top_pair_top_kicker": { "check": 0.30, "bet_33": 0.55, "bet_75": 0.15 },
    "top_pair_weak_kicker": { "check": 0.40, "bet_33": 0.50, "bet_75": 0.10 },
    "overpair":             { "check": 0.20, "bet_33": 0.45, "bet_75": 0.35 },
    "middle_pair":          { "check": 0.65, "bet_33": 0.30, "bet_75": 0.05 },
    "sets_plus":            { "check": 0.25, "bet_33": 0.30, "bet_75": 0.45 },
    "overcards":            { "check": 0.55, "bet_33": 0.40, "bet_75": 0.05 },
    "flush_draw":           { "check": 0.45, "bet_33": 0.35, "bet_75": 0.20 },
    "straight_draw":        { "check": 0.50, "bet_33": 0.40, "bet_75": 0.10 },
    "air":                  { "check": 0.70, "bet_33": 0.25, "bet_75": 0.05 }
  },
  "actions": ["check", "bet_33", "bet_75"],
  "keyPrinciple": "Dry A-high gives BTN massive range + nut advantage. Bet merged and small to deny equity across entire range.",
  "commonMistakes": [
    "Checking too much — you should be betting 55-70% of range here",
    "Betting too large — 33% pot is the primary sizing on dry boards",
    "Never slow-playing sets — they need protection on A-high boards"
  ]
}
```

**Data sourcing — COMPLETE:**
- 193 boards solved via TexasSolver (C++ GPU, RTX 3090) across 8 flop texture archetypes (~5.4h total)
- Parsed via `batch_solve.py parse` → JSON frequency tables + band distributions + accuracy summaries
- Accuracy: Ace-High Dry 97.8%, K/Q-High Dry 97.3%, Two-Tone Disco 96.4% (very_high); Monotone 94.9%, Mid/Low Dry 94.1%, Paired 92.8%, Two-Tone Conn 92.0% (high); Rainbow Conn 89.9% (moderate)
- Sample size analysis: current 193 boards sufficient for shipping; worst case ±2.4% = ~0.12 BB

**Accept for Phase A:**
- Classifier correctly maps ≥ 50 test scenarios to the right archetype
- Hand categorizer correctly classifies all 15 categories with board-relative logic
- At least 5 archetype frequency tables populated (archetypes 1, 2, 6, 9, 16 — highest frequency spots)
- All placeholder tables have valid structure (frequencies sum to ~1.0 per hand category)
- All pure TS, zero Convex imports, full Vitest coverage

---

## Phase B: Lookup GTO Engine (3–4 hrs)

New `DecisionEngine` implementation that uses frequency tables instead of heuristics.

**Depends on:** Phase A (classifier + categorizer + tables)

### B1: Lookup Engine

**New file:** `convex/lib/opponents/engines/lookupGtoEngine.ts`

Implements the existing `DecisionEngine` interface:

```typescript
export const lookupGtoEngine: DecisionEngine = {
  id: "lookup-gto",
  name: "GTO Lookup Engine",
  description: "Decisions from precomputed GTO frequency tables for 20 core archetypes",

  decide(ctx: DecisionContext): EngineDecision {
    // 1. Classify spot → ArchetypeId
    // 2. Categorize hand → HandCategory
    // 3. Look up frequency table
    // 4. Map table actions to legal actions
    // 5. Sample action from frequencies (using ctx.random)
    // 6. Build ExplanationNode with archetype + frequencies + "why"
  }
};
```

**Key implementation details:**
- When spot doesn't cleanly match an archetype (confidence < threshold), falls back to current heuristic GTO engine
- When hand category has no exact match in table, uses closest category by `relativeStrength`
- Legal action mapping: table says "bet_33" → maps to actual bet amount (33% of pot)
- Registers via existing `registerEngine(lookupGtoEngine)`
- The GTO profile's `engineId` field switches from `"gto"` to `"lookup-gto"`

### B2: EV Scoring Function

**New file:** `convex/lib/gto/evScoring.ts`

Pure function that scores any action against the frequency table:

```typescript
interface ActionScore {
  evLoss: number;               // how many BB of EV the user lost (0 = optimal)
  userAction: string;           // what they did
  optimalAction: string;        // highest-frequency action
  optimalFrequency: number;     // how often GTO takes that action
  userActionFrequency: number;  // how often GTO would take the user's action
  allFrequencies: Record<string, number>;  // full table for display
  archetype: ArchetypeClassification;
  handCategory: HandCategorization;
  verdict: "optimal" | "acceptable" | "mistake" | "blunder";
  explanation: ExplanationNode;  // teaching explanation
}

function scoreAction(
  archetypeId: ArchetypeId,
  handCategory: HandCategory,
  userAction: string,
  potSize: number,
): ActionScore;
```

**EV loss calculation:**
- Simple approach: `evLoss = (optimalFrequency - userActionFrequency) × potSize × scaleFactor`
- The frequency delta tells you how far off you are; pot size scales the impact
- Verdict thresholds: optimal (frequency ≥ 0.3), acceptable (≥ 0.15), mistake (≥ 0.05), blunder (< 0.05)

**Tests:** `tests/gto/evScoring.test.ts`
- Optimal action scores 0 EV loss
- Known mistakes score proportional EV loss
- Edge cases: mixed strategies where multiple actions are "correct"

### B3: Archetype Explainer

**New file:** `convex/lib/gto/archetypeExplainer.ts`

Generates rich `ExplanationNode` trees for each archetype, pulling from the table's `keyPrinciple` and `commonMistakes`:

```typescript
function explainArchetype(
  archetype: ArchetypeClassification,
  handCategory: HandCategorization,
  frequencies: Record<string, number>,
  userAction?: string,
): ExplanationNode;
```

Produces explanation trees like:
```
"Ace-High Dry Rainbow — BTN vs BB"
├── "Your hand: top pair top kicker (strong)"
├── "GTO says: bet 33% pot 55%, check 30%, bet 75% pot 15%"
├── "Key principle: Dry A-high gives you range + nut advantage. Bet small and merged."
├── "You chose: check — GTO checks 30% here (acceptable)"
└── "Common mistake: checking too much on A-high. You should bet 55-70% of range."
```

**Accept for Phase B:**
- Lookup engine registered and selectable via `engineId: "lookup-gto"`
- Engine produces correct actions for all 5 populated archetypes
- Falls back gracefully to heuristic engine for unmatched spots
- EV scoring correctly rates optimal/acceptable/mistake/blunder
- Explanation trees include archetype name, frequencies, key principle, and common mistakes
- All existing tests still pass (engine is additive, not replacing)

---

## Phase C: Hand State Viewer + Replay (6–8 hrs)

The shared UI component that both replay and drill mode use. Built first as a **replayer** for completed hands.

**Depends on:** Existing `HandRecord` from Phase 8 audit system. No dependency on Phases A/B.

### C1: Hand Timeline Data Model

**New file:** `convex/lib/replay/handTimeline.ts`

Transforms a `HandRecord` into a sequence of viewable snapshots:

```typescript
interface TimelineSnapshot {
  index: number;                    // position in timeline
  street: Street;
  communityCards: CardIndex[];
  pot: number;
  players: TimelinePlayer[];        // stack, status, cards (if revealed)
  activePlayerSeat: number;         // who's acting
  action?: RecordedAction;          // what they did (undefined = decision point)
  engineDecision?: DecisionSnapshot; // engine reasoning at this point
  isDecisionPoint: boolean;         // hero needed to act here
}

interface HandTimeline {
  handId: string;
  snapshots: TimelineSnapshot[];
  totalSnapshots: number;
  heroSeat: number;
  result: HandResult;               // who won, final stacks
}

function buildTimeline(record: HandRecord): HandTimeline;
```

**Tests:** `tests/replay/handTimeline.test.ts`

### C2: Hand State Viewer Component

**New file:** `src/components/replay/hand-state-viewer.tsx`

The core shared component — renders a hand at any decision point:

- Board display (community cards, animated deal)
- Hero cards display
- Pot size + player stacks (BB format using existing `formatBB()`)
- Player positions + status (folded, active, all-in)
- Action history for current street
- Current actor highlight

This component is **data-driven** — it receives a `TimelineSnapshot` and renders it. It doesn't know or care whether the data comes from a replay or a live drill.

### C3: Timeline Scrubber

**New file:** `src/components/replay/timeline-scrubber.tsx`

Navigation controls for stepping through a hand:

- Step forward / back buttons
- Street jump buttons (go to flop / turn / river)
- Decision point jump (skip to next hero decision)
- Play/pause for auto-advance
- Progress indicator (snapshot 5 of 23)

### C4: Replay Overlay

**New file:** `src/components/replay/replay-overlay.tsx`

Additional information displayed during replay:

- Engine reasoning panel (shows `DecisionSnapshot` data from `HandRecord`)
- "What would GTO say?" badge (if lookup engine data available — uses Phase B if built)
- Action annotation (what happened + why)
- Existing `ExplanationNode` tree component (already built)

### C5: Replay Page / Integration

**New file:** `src/components/replay/hand-replayer.tsx`

Composes C2 + C3 + C4 into the full replayer:

```typescript
interface HandReplayerProps {
  record: HandRecord;         // from audit system
  showGtoComparison?: boolean; // show lookup engine comparison (Phase B)
}
```

Integration point: wire into existing `vision-workspace.tsx` as a mode, or as a standalone route (`/replay`).

**Accept for Phase C:**
- Can replay any `HandRecord` produced by the existing audit system
- Timeline correctly reconstructs every decision point
- Scrubber navigates forward/back, jumps to streets and decision points
- Engine reasoning visible at each action
- Hand state viewer is a standalone reusable component (prep for drill mode)
- Works with Chrome MCP verification (not preview tools)

---

## Phase D: Drill Mode (6–8 hrs)

The training system. Uses the hand state viewer from Phase C, the lookup engine from Phase B, and the constrained dealer to create scored practice sessions.

**Depends on:** Phase B (lookup engine + scoring) + Phase C (hand state viewer)

### D1: Constrained Dealer

**New file:** `convex/lib/gto/constrainedDealer.ts`

Deals hands matching archetype constraints:

```typescript
interface DrillConstraints {
  archetypeId: ArchetypeId;
  heroPosition?: Position;         // force hero to specific seat
  handCategories?: HandCategory[]; // limit to specific hand types (optional)
}

interface ConstrainedDeal {
  heroCards: CardIndex[];
  communityCards: CardIndex[];     // pre-determined for flop textures
  villainCount: number;
  heroPosition: Position;
  blinds: { small: number; big: number };
}

function dealForArchetype(
  constraints: DrillConstraints,
  random: () => number,
): ConstrainedDeal;
```

**Implementation:**
- Preflop archetypes: deal random hero hand from position-appropriate range, no board constraint
- Flop texture archetypes: generate board matching texture requirements (A-high + rainbow + dry, etc.), deal hero hand from BTN opening range
- Postflop principle archetypes: generate full scenario (board + hand + action history leading to the decision point)

### D2: Drill Session Controller

**New file:** `src/hooks/use-drill-session.ts`

Orchestrates a drill session using existing infrastructure:

```typescript
interface DrillSession {
  archetypeId: ArchetypeId;
  handsPlayed: number;
  handsTarget: number;              // e.g., 50
  totalEvLoss: number;
  scores: ActionScore[];
  currentHand: HandSession | null;  // existing HandSession class
  phase: "dealing" | "waiting_for_action" | "showing_score" | "between_hands";
}

function useDrillSession(archetypeId: ArchetypeId, handsTarget?: number): {
  session: DrillSession;
  startDrill: () => void;
  submitAction: (action: string) => ActionScore;  // user clicks an action
  nextHand: () => void;
  endDrill: () => DrillSummary;
};
```

**How it works:**
1. `startDrill()` → constrained dealer creates hand → `HandSession.startHand()` (existing)
2. Auto-play opponents to hero's turn → existing `chooseActionFromProfile()` with auto seats
3. Pause at hero's decision point → existing `recordManualAction()` pattern
4. User clicks action button → `submitAction()` → scores via `scoreAction()` (Phase B2)
5. Show score overlay → user reviews → `nextHand()` → repeat
6. After N hands → `endDrill()` → summary with per-category stats

### D3: Drill Action Panel

**New file:** `src/components/drill/drill-action-panel.tsx`

Simplified action buttons matching the archetype's action set:

- Shows only the actions relevant to this archetype (e.g., "Check | Bet 33% | Bet 75%" for flop textures)
- Clean, large buttons — optimized for fast decision-making
- Timer option (10s per decision for advanced users)
- No raise slider — discrete GTO-standard sizes only

### D4: Score Display

**New file:** `src/components/drill/score-display.tsx`

Post-action feedback:

- EV loss badge: "0 BB" (green) / "-0.7 BB" (yellow) / "-2.1 BB" (red)
- Verdict: "Optimal" / "Acceptable" / "Mistake" / "Blunder"
- Frequency bar chart: shows GTO distribution with user's choice highlighted
- Key principle text from archetype table
- Common mistake callout (if user made one)
- "Why" explanation tree (existing `ExplanationNode` component)
- "Next Hand" button

### D5: Drill Page

**New file:** `src/components/drill/drill-workspace.tsx` (or integrated into vision workspace)

Composes: hand state viewer (C2) + drill action panel (D3) + score display (D4)

Flow:
```
Archetype selector → Start Drill → [Hand State Viewer + Action Panel]
     → User acts → [Score Display + Explanation] → Next Hand → ... → Summary
```

**Accept for Phase D:**
- Can run a 50-hand drill session for any archetype with populated frequency tables
- Constrained dealer produces hands matching archetype requirements
- Scoring correctly rates each decision
- Score display shows EV loss, frequencies, and teaching explanation
- Full drill flow works end-to-end: select archetype → drill → summary
- HandRecorder captures all drill hands (existing audit system)

---

## Frequency Bands + Accuracy Communication System (COMPLETE)

Built between Phases D and E. Addresses the gap between archetype-approximated GTO and exact per-board solver solutions.

### Core Concept

Instead of point estimates ("bet 55%"), the system computes **frequency bands** ("bet 49-61%, avg 55%") from per-board solver variance across all boards in an archetype.

### Components

**FrequencyBand** — per-action stats computed from per-board solver distributions:
- `mean`, `stdDev`, `min`, `max`, `sampleCount`
- Shows users the range of correct play, not a single number

**ArchetypeAccuracy** — archetype-level confidence:
- `accuracy = 1 - avgStdDev` across all hand categories and actions
- Labels: very_high (≥0.95), high (≥0.90), moderate (≥0.80), approximate (<0.80)

**Board Typicality** — how well a specific board matches its archetype centroid:
- `BoardFeatures`: 5 normalized features (highCardNorm, wetness, isPaired, suitedness, connectivity)
- `ARCHETYPE_CENTROIDS`: center + tolerance for all 8 flop texture archetypes
- `scoreBoardTypicality()`: Gaussian distance → 0-1 typicality score

**AccuracyImpact** — translates abstract accuracy into practical poker terms:
- `maxEvImpactBB`: maximum EV difference in BB (scaled by pot size)
- `couldFlipOptimal`: whether the accuracy gap could change which action is "best"
- `practicalMeaning`: human-readable explanation ("zero practical impact" / "Close spot — direction could differ")

**Sample Size Analysis** — determines if more solver boards are needed:
- `analyzeSampleSize()`: marginal gain per board, sweet spot via diminishing returns (√n relationship)
- `boardsNeededForPrecision()`: how many boards to reach a target stdError
- Ran on actual solver data — all 193 boards analyzed, sweet spots identified

### Data Flow

```
Solver batch → batch_solve.py parse → JSON with distributions
  → loadSolverTables() → registerBands() + registry
  → lookupFrequencies() returns bands alongside point estimates
  → UI can show "bet 49-61%" instead of just "bet 55%"
```

### Files

- `convex/lib/gto/tables/types.ts` — all types + computation functions
- `convex/lib/gto/tables/tableRegistry.ts` — bandData/accuracyData storage
- `convex/lib/gto/tables/loadSolverTables.ts` — loads distributions from solver output
- `data/solver/batch_solve.py` — enhanced parse to output distributions + bands + accuracy
- `tests/gto/frequencyBands.test.ts` — 49 tests

---

## Phase E: Training Dashboard + Spaced Repetition (4–6 hrs)

Track performance over time and auto-schedule weak spots.

**Depends on:** Phase D (drill mode producing scores)

### E1: Training Stats Schema

**New tables in** `convex/schema.ts`:

```typescript
// Per-drill-session record
drillSessions: defineTable({
  userId: v.id("users"),
  archetypeId: v.string(),
  handsPlayed: v.number(),
  totalEvLoss: v.number(),
  avgEvLossPerHand: v.number(),
  optimalPct: v.number(),          // % of hands scored "optimal"
  mistakePct: v.number(),          // % scored "mistake" or "blunder"
  duration: v.number(),            // seconds
  createdAt: v.number(),
}).index("by_user", ["userId"])
  .index("by_user_archetype", ["userId", "archetypeId"]),

// Aggregated per-archetype stats (updated after each session)
archetypeStats: defineTable({
  userId: v.id("users"),
  archetypeId: v.string(),
  totalHands: v.number(),
  totalEvLoss: v.number(),
  avgEvLoss: v.number(),           // running average
  bestSession: v.number(),         // lowest avg EV loss
  lastDrilled: v.number(),         // timestamp
  nextScheduled: v.number(),       // timestamp (spaced repetition)
  proficiency: v.string(),         // "learning" | "developing" | "solid" | "mastered"
}).index("by_user", ["userId"])
  .index("by_user_next", ["userId", "nextScheduled"]),
```

### E2: Spaced Repetition Scheduler

**New file:** `convex/lib/gto/spacedRepetition.ts`

Simple algorithm — no need for Anki complexity:

```typescript
function scheduleNext(
  archetypeId: ArchetypeId,
  currentProficiency: string,
  lastEvLoss: number,
  history: { avgEvLoss: number; date: number }[],
): { nextDate: number; proficiency: string } {
  // High EV loss → schedule tomorrow
  // Medium → 3 days
  // Low → 1 week
  // Mastered → 2 weeks
  // Regression (worse than last time) → tomorrow
}
```

### E3: Training Dashboard Page

**New file:** `src/app/training/page.tsx` (or `src/components/training/dashboard.tsx`)

Overview of all 20 archetypes with:

- Proficiency indicator per archetype (learning → mastered)
- Average EV loss per archetype
- "Due for review" highlights (spaced repetition)
- "Start Drill" button per archetype
- "Auto Drill" button — picks the highest-priority archetype automatically
- Session history (last 10 drills with scores)
- Trend chart: EV loss over time per archetype

### E4: Post-Drill Summary

**New file:** `src/components/drill/drill-summary.tsx`

End-of-session report:

- Hands played, total EV loss, average per hand
- Per-hand-category breakdown (where you leaked most)
- Comparison to previous sessions for this archetype
- Proficiency update ("developing → solid!")
- Next scheduled drill date
- "Drill Again" / "Try Another Archetype" / "Go to Dashboard" buttons

**Accept for Phase E:**
- Drill sessions saved to Convex with full stats
- Per-archetype proficiency tracked and updated
- Spaced repetition schedules weak archetypes sooner
- Dashboard shows all 20 archetypes with proficiency + EV loss
- "Auto Drill" picks the right archetype to work on
- Session history browsable
- Proficiency progression visible over time

---

## Data Sourcing Strategy

The frequency tables are the only external dependency. Strategy for populating them:

### MVP (ship with Phase A)
- Populate 5 highest-frequency archetypes from free sources
- Preflop: Upswing free charts, FreeBetRange.com, GitHub CSV repos
- Flop: GTO Wizard blog data, SplitSuit texture studies, Upswing fundamentals
- Remaining 15 archetypes get placeholder data (reasonable approximations)

### V2 (before Phase D ships)
- All 20 archetypes populated with real data
- One-time GTO Wizard subscription → export trainer frequencies
- Cross-reference with multiple sources for accuracy

### Ongoing
- Frequency tables are JSON files — trivially updatable
- Community can contribute corrections
- A/B test different frequency sources against user outcomes

---

## Integration Points with Existing Architecture

| Existing System | How It Connects |
|----------------|----------------|
| `DecisionEngine` interface | Lookup engine implements it — zero changes to interface |
| `engineRegistry` | New engine self-registers — zero changes to registry |
| `analyzeBoard()` | Archetype classifier uses it — zero changes to board texture |
| `detectDraws()` | Hand categorizer uses it — zero changes to draw detector |
| `evaluateHand()` | Hand categorizer uses it — zero changes to evaluator |
| `HandSession` | Drill mode uses it — zero changes to session |
| `recordManualAction()` | Drill mode pauses here — zero changes to manual action flow |
| `chooseActionFromProfile()` | Drill auto-plays opponents — zero changes to auto-play |
| `HandRecorder` | Drill hands recorded automatically — zero changes to recorder |
| `ExplanationNode` | All explanations use existing tree — zero changes to explanation system |
| `OpponentProfile` | GTO profile switches `engineId` to `"lookup-gto"` — one field change |

**Zero breaking changes.** Everything is additive.

---

## Timeline Estimate

| Phase | Effort | Cumulative |
|-------|--------|-----------|
| A: Data Foundation | 6–8 hrs | 6–8 hrs |
| B: Lookup Engine | 3–4 hrs | 9–12 hrs |
| C: Replay + Viewer | 6–8 hrs | 15–20 hrs |
| D: Drill Mode | 6–8 hrs | 21–28 hrs |
| E: Training Dashboard | 4–6 hrs | 25–34 hrs |

Phases A+B and C can be built in parallel (no dependencies between them).

---

## Growth Path

Once this system is live:

- **More archetypes** — expand from 20 to 40+ (3-way pots, tournament ICM spots, Omaha)
- **Difficulty levels** — same archetype with simplified vs full action sets
- **Multiplayer drills** — drill the same spot from different positions
- **Pattern mode** — drill only one texture for 30 minutes (monotone boards, paired boards)
- **Leaderboards** — compare proficiency across users
- **AI coaching narration** — LLM explains your specific leak pattern across sessions
- **Mobile app** — drill sessions are perfect for mobile (simple UI, quick decisions)
