# LLM-as-Judge Plan: Inference-Based Quality Evaluation

Companion to the **Autotune Plan** (math-based optimization). This plan covers everything that *can't be scored with a formula* — the human-facing quality of what HoldemVision shows and tells users.

---

## The Problem

Our system generates rich output at every decision point: coaching commentary, engine explanations, archetype descriptions, action recommendations, opponent stories, knowledge base entries, and GTO frequency displays. Math can tell us the frequencies are correct. It cannot tell us:

- Is the **explanation** actually helpful to a learning player?
- Is the **commentary** coherent and logically consistent with the board state?
- Does the **recommendation** make sense given what the user can see?
- Are **opponent stories** plausible given observed actions?
- Is the **information hierarchy** right — does the most important thing stand out?
- Would a player at skill level X actually **understand** this output?

These require inference — an LLM reading what the user would see and judging it.

---

## Phase 1: Capture Everything the User Sees

**Goal**: At every decision point, serialize the complete user-visible state into a single auditable artifact.

### We Already Have This

`snapshot.ts` (`FullSnapshot`) already captures everything:
- Hand categorization + archetype classification
- Board texture analysis
- GTO frequency lookup + bands + accuracy
- Opponent stories (inferred behavior narratives)
- Action narratives (what happened this street)
- Hand commentary (the coaching paragraph)
- Counter-strategy advice
- Recommended action + confidence level

**What's missing**: the snapshot doesn't capture the *visual layout* or *information ordering* the user experiences. We need to add:

### 1A: Render Snapshot to Text

Build `convex/lib/audit/snapshotRenderer.ts`:

```ts
interface RenderedView {
  // What the user sees, in reading order
  boardState: string;           // "Flop: A♠ K♥ 7♦ | Pot: 12 BB"
  heroHand: string;             // "Hero (BTN): Q♠ Q♥"
  opponentSummary: string;      // "Villain (BB): TAG, has been aggressive"
  coachingPanel: string;        // the full commentary paragraph
  actionButtons: string;        // "Fold | Call 4BB | Raise to 12BB"
  gtoDisplay: string;           // "GTO: Fold 12% | Call 45% | Raise 43%"
  explanationTree: string;      // flattened engine reasoning
  confidenceIndicator: string;  // "High confidence (solver-backed, 97% accuracy)"
}

function renderSnapshotAsUserView(snapshot: FullSnapshot): RenderedView
```

This is a **text projection** of the UI — what an LLM can read to judge the user experience.

### 1B: Batch Snapshot Collection

Extend the drill pipeline to collect snapshots in bulk:

```ts
interface AuditBatch {
  hands: AuditHand[];
  metadata: { profiles: string[]; archetypes: string[]; count: number };
}

interface AuditHand {
  setup: { hero: string; villain: string; position: string; archetype: string };
  decisionPoints: RenderedView[];  // one per street where hero acts
  outcome: { result: string; showdown: boolean };
}
```

Run 100-500 hands, collect all decision points. This is the corpus the LLM judge evaluates.

**Files to create**:
- `convex/lib/audit/snapshotRenderer.ts`
- `convex/lib/audit/auditBatchCollector.ts`
- `tests/audit/snapshotRenderer.test.ts`

---

## Phase 2: LLM Judge Rubrics

**Goal**: Define what "good" looks like across multiple quality dimensions.

### Rubric Categories

Each decision point gets scored on independent dimensions:

#### R1: Factual Accuracy
> Given the board, hero's hand, and pot odds — is the stated recommendation mathematically defensible? Does the explanation cite the correct reasons?

- **5**: recommendation matches GTO, explanation correctly identifies why
- **3**: recommendation is reasonable, but explanation is vague or cites wrong factors
- **1**: recommendation contradicts the math (e.g., says "fold" when GTO says raise 60%)

#### R2: Logical Coherence
> Does the commentary tell a consistent story? Do the pieces (opponent read, board analysis, recommendation) support each other?

- **5**: everything connects — opponent tendencies + board texture + hand strength all lead to the recommendation
- **3**: mostly coherent, but one element contradicts another (e.g., says board is dry but warns about flush draws)
- **1**: internally contradictory or nonsensical narrative

#### R3: Pedagogical Value
> Would a player learning poker actually learn something from this? Is the *teaching* effective?

- **5**: explains the *why* in terms a learner can internalize and apply to future hands
- **3**: gives the answer but doesn't teach — "you should raise here" without meaningful explanation
- **1**: confusing, jargon-heavy, or explains the wrong concept for the situation

#### R4: Appropriate Confidence Communication
> Does the system accurately convey how certain it is? Does it distinguish solver-backed advice from heuristic guesses?

- **5**: clearly states when data is approximate vs precise, helps user calibrate trust
- **3**: doesn't mention confidence at all
- **1**: presents uncertain data as definitive, or vice versa

#### R5: Information Relevance
> Is the user shown what matters most for this decision? Is there noise/clutter that distracts?

- **5**: highlights the key factor (e.g., "you have a nut flush draw" on a wet board) and keeps secondary info brief
- **3**: covers the right topics but buries the lead
- **1**: focuses on irrelevant details while missing the critical factor

#### R6: Opponent Modeling Plausibility
> Given the opponent's actions so far, is the inferred behavior story reasonable?

- **5**: story is consistent with observed actions and profile, reads like a real poker player's thought process
- **3**: story is generic/templated, doesn't reflect what actually happened
- **1**: story contradicts observed actions (e.g., calls opponent tight after they've 3-bet every hand)

### Rubric Document

Store rubrics as structured data so they can be versioned and evolved:

```ts
interface JudgeRubric {
  id: string;
  name: string;
  description: string;
  scoreLevels: { score: number; description: string }[];
  weight: number;  // relative importance in composite score
}
```

**Files to create**:
- `convex/lib/audit/judgeRubrics.ts` — rubric definitions
- `convex/lib/audit/types.ts` — extend with judge-related types

---

## Phase 3: Judge Pipeline

**Goal**: Feed snapshots to an LLM with rubrics, collect structured scores.

### 3A: Prompt Construction

For each decision point, build a judge prompt:

```
You are evaluating the output of a poker coaching system.

## The Situation
{renderedView.boardState}
{renderedView.heroHand}
{renderedView.opponentSummary}

## What the User Sees
Coaching: {renderedView.coachingPanel}
GTO Display: {renderedView.gtoDisplay}
Actions Available: {renderedView.actionButtons}
Confidence: {renderedView.confidenceIndicator}

## Scoring Rubric
{rubric definitions}

Score each dimension 1-5 with a one-line justification.
Flag any CRITICAL issues (factual errors, contradictions, harmful advice).

Respond as JSON:
{
  "scores": { "accuracy": { "score": N, "reason": "..." }, ... },
  "criticalIssues": [],
  "overallImpression": "one sentence"
}
```

### 3B: Batch Evaluation

Run judge across the full audit batch:
- Process decision points in batches (rate limiting)
- Aggregate scores per rubric, per archetype, per profile
- Flag any critical issues for human review

### 3C: Score Aggregation

```ts
interface JudgeReport {
  overall: number;                              // weighted composite 1-5
  perRubric: Map<string, RubricAggregate>;      // avg, min, stddev per rubric
  perArchetype: Map<string, number>;            // composite per archetype
  criticalIssues: CriticalIssue[];              // anything scored 1 on accuracy
  worstDecisionPoints: RankedDecisionPoint[];   // bottom 10 by composite score
  bestDecisionPoints: RankedDecisionPoint[];    // top 10 (for understanding what works)
}
```

**Files to create**:
- `convex/lib/audit/judgePromptBuilder.ts` — constructs prompts from rendered views
- `convex/lib/audit/judgeRunner.ts` — orchestrates LLM calls, parses responses
- `convex/lib/audit/judgeAggregator.ts` — computes report from raw scores
- `tests/audit/judgePromptBuilder.test.ts`

---

## Phase 4: Targeted Quality Dimensions

Beyond the general rubrics, specific evaluations for subsystems:

### 4A: Commentary Coherence Audit

Focus: `handCommentator.ts` output

The commentator synthesizes multiple signals into a single paragraph. Evaluate:
- Does it contradict itself within the same paragraph?
- Does it reference information the user can't see?
- Does the narrative flow (cause → effect → recommendation)?
- Is the tone appropriate (coaching, not lecturing)?

Run 200+ commentaries through judge with commentary-specific rubric.

### 4B: Knowledge Base Accuracy Audit

Focus: `convex/lib/knowledge/` entries

Every knowledge entry has short/medium/full tiers. Evaluate:
- Are the definitions technically correct?
- Does each tier logically expand on the previous one?
- Would a beginner understand `short`? Would an intermediate player find `full` useful?
- Are related entries actually related?

This is a one-time audit (knowledge base is static) — run once, fix issues, re-run.

### 4C: Explanation Tree Quality

Focus: `ExplanationNode` trees from engine reasoning

The engine builds tree-structured explanations. Evaluate:
- Do child nodes actually support the parent conclusion?
- Are the tags (hand_strength, board_texture, etc.) applied correctly?
- Is the depth appropriate (not too shallow to be useless, not too deep to be noise)?

### 4D: Cross-Street Consistency

Focus: Does advice stay consistent across a full hand?

Collect all decision points for a single hand. Evaluate:
- If we said "opponent is tight" on the flop, do we still say that on the turn?
- If we recommended aggression preflop, does our postflop advice follow through or contradict?
- Does the narrative build on itself or start fresh each street?

---

## Phase 5: Feedback Loop

### 5A: Issue Triage

Judge output produces three categories:
1. **Critical** (accuracy score = 1): factual errors → fix immediately in code
2. **Systematic** (same rubric scores low across many hands): pattern problem → fix in generator
3. **Edge case** (isolated low score): specific situation → add to test suite

### 5B: Targeted Improvement

For each systematic issue:
1. Collect the 10 worst-scoring examples
2. Identify the code path that generated the bad output
3. Fix the generator (commentator, explainer, knowledge entry)
4. Re-run judge on those 10 examples to confirm improvement
5. Re-run full audit to check for regressions

### 5C: Automated Regression

After each fix:
- Snapshot the judge report
- Add a "quality gate" test: `overallScore >= lastBestScore - ε`
- Per-rubric floors: no rubric average drops below 3.5

---

## Phase 6: Simulated Learner Evaluation

**Goal**: Go beyond "is this correct?" to "does this actually teach?"

### The Simulated Student

Build on the [simulated learner concept](../../memory/simulated_learner.md):

1. **Student LLM** reads coaching output for a sequence of 20 hands
2. After each hand, student answers: "What did you learn? What would you do differently next time?"
3. **Judge LLM** evaluates whether the student's understanding improved over the sequence
4. Score: learning curve slope (did the student get better at articulating strategy?)

### Skill Level Variants

Run with different student personas:
- **Complete beginner**: only knows hand rankings
- **Casual player**: knows basic strategy but not GTO
- **Intermediate**: understands pot odds, position, ranges

Each persona should learn different things from the same coaching output. If the beginner and the intermediate learn the same thing, the system isn't adapting to skill level.

---

## Implementation Order

1. **Phase 1A**: snapshot renderer (small, mechanical, immediately useful)
2. **Phase 2**: rubric definitions (documentation, no code complexity)
3. **Phase 1B**: batch collection (extends existing drill pipeline)
4. **Phase 3A-C**: judge pipeline (the core — prompt builder + runner + aggregator)
5. **Phase 4B**: knowledge base audit (one-time, high-value, catches errors early)
6. **Phase 4A**: commentary audit (tests the most user-visible output)
7. **Phase 5**: feedback loop (converts judge output into fixes)
8. **Phase 4C-D**: explanation tree + cross-street (deeper quality)
9. **Phase 6**: simulated learner (the capstone — tests actual learning outcomes)

---

## Relationship to Autotune Plan

The two plans are complementary:

| | Autotune (math) | LLM Judge (inference) |
|---|---|---|
| **What it measures** | Frequency alignment, EV loss | Explanation quality, coherence, pedagogy |
| **Ground truth** | Solver tables | Human judgment (via LLM proxy) |
| **Tuning target** | modifierProfiles.ts, contextAnalysis.ts | handCommentator.ts, knowledge/, archetypeExplainer.ts |
| **Iteration speed** | Seconds (pure math) | Minutes (LLM API calls) |
| **Automation** | Fully autonomous loop | Semi-automated (critical issues need human review) |

Both feed the same quality dashboard. A hand can score perfectly on GTO alignment but poorly on explanation quality, or vice versa. We need both.
