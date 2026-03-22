# HoldemVision — Narrative Foundation

## Core Thesis

Winning poker players don't memorize frequency tables. They maintain a disciplined, evolving narrative about their hand, the board, their opponents' ranges — and simultaneously maintain a model of their opponents' narratives. The player whose story best accounts for all other stories at the table tends to win.

This is the skill HoldemVision teaches. Not frequencies. Not charts. The ability to construct, maintain, and read narratives in real-time.

## Why This Is Different

Existing tools teach outputs (GTO frequencies, range charts, EV calculations). These are answers to specific spots. A player who memorizes them applies them mechanically and gets exploited by anyone who reads that rigidity.

A player who understands the narrative — why a small bet on a dry board tells a different story than a large bet, why a check-raise after passive play changes the plot — can adapt to any situation, including ones they've never drilled.

HoldemVision compresses the time to becoming an effective player by teaching the thinking process, not the lookup table. Frequencies become a natural consequence of narrative understanding, not a memorization target.

## The Narrative Framework

At every decision point, a winning player runs three layers simultaneously:

### Layer 1: My Narrative

What story am I telling?

- **What do I have?** — absolute hand strength
- **What does the board do to what I have?** — relative strength, how it evolves street by street
- **What does my action sequence SAY I have?** — my perceived range (not my actual hand)
- **What does my sizing communicate?** — a small bet is a different sentence than a large bet
- **Is my story consistent?** — does my line make sense for the range I'm representing?

### Layer 2: Their Narrative

What story are they telling?

- **What could they have?** — range based on position + action history
- **What story are their actions telling?** — each bet/check/raise is a sentence
- **Is their story consistent?** — passive then suddenly aggressive? The plot changed. Why?
- **What are they trying to accomplish?** — value, bluff, protection, information?

### Layer 3: The Meta-Narrative

What do they think my story is? And what does that tell me about theirs?

- **What do they think I have?** — my perceived range from their perspective
- **Given what they think I have, why are they doing what they're doing?** — if they think I'm weak and they bet big, are they exploiting perceived weakness or are they actually strong?
- **Can I change what they think my story is?** — representing a different range than I hold
- **What do they think I think THEY have?** — the recursive layer that separates great players from good ones

### Layer 4: Narrative Updates

All three layers update simultaneously as new information arrives:

- A new community card changes which stories are possible
- A bet or check adds a sentence to someone's story
- A sizing choice changes the tone
- The absence of an action (checking when betting was expected) is itself a plot point

## The Full Set of Narrative Inputs

Every piece of information at the table is a narrative element:

| Input | Narrative Role |
|---|---|
| **Hole cards** | The truth only you know — the private plot |
| **Board texture** | The shared setting — changes what stories are possible |
| **Board evolution** (flop → turn → river) | Plot development — new cards rewrite possible narratives |
| **Position** | Who speaks first, who gets the last word — controls information flow |
| **Action sequence** | The plot arc — each action is a sentence in the story |
| **Bet sizing** | The tone — whisper (small bet) vs. shout (overbet) |
| **Stack depth** | The stakes — deep stacks allow complex plots, short stacks force simple ones |
| **Blockers** | Cards you hold that make certain opponent stories impossible |
| **Pot odds / implied odds** | The economics of continuing the story — is it worth seeing the next chapter? |
| **Number of opponents** | Monologue vs. dialogue vs. ensemble — more opponents means more stories to track |
| **History / table image** | The prequel — how past hands color current perception |
| **Timing and patterns** | Subtext — speed of decision, deviations from pattern |

## Why Frequencies Still Matter (But Differently)

GTO frequencies are not the goal — they are the *baseline language* of the narrative. They tell you what a "balanced" story looks like. When you deviate from GTO frequencies, you are making a narrative choice:

- Betting more than GTO suggests → your story is more aggressive than balanced. This works if opponents believe a passive story and over-fold.
- Folding less than GTO suggests → you're staying in stories longer. This works if opponents bluff too much.
- Following GTO exactly → you're telling a story that can't be exploited, but also can't exploit.

The skill is knowing WHEN to deviate and WHY — which requires reading the other narratives at the table.

## What This Means for the Product

The UI should not primarily show "fold 67%, call 17%, raise 17%." It should guide the user through narrative construction:

1. **What's your story right now?** — given your hand, position, and actions so far
2. **What's their story?** — given their position, actions, and sizing
3. **What do they think your story is?** — given what you've shown them
4. **What does each action do to the narrative?** — if you bet, what chapter are you writing? If you check, what are you saying?
5. **THEN** — here's what GTO suggests, and here's why it makes narrative sense (or when it doesn't)

The frequencies validate the narrative. The narrative is the skill.

## Game Type Considerations

The narrative framework applies universally but the emphasis shifts:

- **Cash games (deep stack)**: Full narrative development. All layers matter. Complex multi-street stories. Stack depth allows elaborate plots.
- **Cash games (short stack)**: Compressed narratives. Stories resolve quickly. Preflop decisions dominate.
- **Tournaments (early/mid)**: Cash-like narratives but with survival pressure. ICM changes what stories are worth telling.
- **Tournaments (bubble/final table)**: Narrative becomes about survival vs. accumulation. The meta-narrative (what opponents think about YOUR stack situation) dominates.
- **Sit-and-go**: Extreme ICM. Narrative shrinks to "is this worth risking my tournament life?"
- **Heads-up**: Pure narrative combat. Every action is a direct conversation. History and adaptation matter most.

## Research Step 1: Thesis Validation (Completed)

### Does the evidence support "narrative as the core skill"?

**Yes — strongly.** The narrative/story framing is pervasive across elite players and poker literature. Every major source uses some form of "does your line tell a consistent story?" But the research reveals important refinements.

### How top players actually think

**Phil Galfond** — Range construction AS narrative. Each action tells a story. He narrows opponent ranges street by street by asking "what hands follow this exact sequence of actions?" Crucially, he inverts this: "what does my range look like to him?" His key insight: "Good players think about what their opponent has. Great players think about what their opponent's *range* looks like, and simultaneously what their *own* range looks like to their opponent." He explicitly uses the phrase "telling a story" — a bluff fails when "your story doesn't make sense."

**Daniel Negreanu** — The most explicitly narrative thinker. His "soul reads" are constructed verbal narratives: "He raised pre, so X range. He bet small on the flop, which means strong/trapping or marginal. He checked the turn, inconsistent with a trap, so I narrow to marginal..." He describes poker as "a storytelling game where you're trying to figure out if someone's story makes sense." Represents the old-school narrative approach — deeply intuitive, tell-based.

**Doug Polk** — The counterpoint. More algorithmic than narrative. Starts from a GTO baseline, identifies opponent deviations, adjusts one level. Cautions against "leveling yourself" — thinking so many levels deep you outsmart yourself. Emphasizes discipline over brilliance: "The best players aren't making insane hero calls. They're making slightly better decisions across thousands of hands." He uses story language analyzing specific hands, but his *process* is solver-anchored.

**Fedor Holz** — Mental state first. Years of solver work get internalized into intuition — in the moment, he's not running calculations but *feeling* the right play from deep pattern recognition. The technical gap between top players is small; the real edge is mental consistency.

**Andrew Brokos (Thinking Poker)** — Explicitly focuses on the thinking *process* rather than conclusions. Frames poker as Bayesian updating: start with a prior (opponent's likely range), observe evidence (their actions), update beliefs. Pushes back on soul-reading in favor of systematic range analysis. But emphasizes metacognition: "How confident am I in this read? Is it based on solid evidence or wishful thinking?"

### Key refinements to the thesis

**1. Narrative operates at two levels we should distinguish:**
- **Hand-level narrative**: Street-by-street range narrowing. "Given his actions, his range is X."
- **Session-level narrative**: Player modeling over time. "This player is tight-passive and has been card-dead."

**2. The narrative is probabilistic, not deterministic.** Modern thinking shifted from "he has AK" to "his range is weighted toward broadway hands." The narrative is about distributions, not specific hands. This is the biggest evolution — from Negreanu's "I put you on AK" to Galfond's "your range here is capped."

**3. There's a spectrum from narrative to algorithmic.** Negreanu is maximally narrative. Polk is algorithmic. Galfond bridges the two. The best modern players use narrative as a *compression mechanism* for mathematical reasoning — the story is a heuristic that approximates range analysis.

**4. Self-narrative discipline is underemphasized in our original thesis.** Multiple sources (Galfond, Bart Hanson) stress that YOUR OWN line must tell a consistent story. It's not just reading opponents — it's ensuring your actions are narratively coherent. "Before you bluff, ask: does my story make sense? Would I play a strong hand exactly this way?"

**5. Metacognition separates good from great.** Expert players evaluate the *reliability* of their narratives. They ask "how confident am I in this read and why?" — not just "what is my read?" This is a trainable skill.

**6. Think one level above your opponent — no more.** Level 3 thinking against a Level 0 player is counterproductive. They're not considering your range, so sophisticated balancing is wasted. Match analytical depth to opponent sophistication.

### What this means for our product

The research confirms the narrative thesis but adds crucial nuance. HoldemVision should teach:

1. **Range construction** — not "what does he have?" but "what could he have given his actions?"
2. **Bidirectional awareness** — "what does my range look like to my opponent?"
3. **Self-narrative consistency** — "does my line tell a coherent story?" (biggest gap in current product)
4. **Opponent modeling** — building and updating mental models of opponent types
5. **Metacognitive monitoring** — "how confident am I in this read, and why?"
6. **Level-appropriate thinking** — matching depth to opponent sophistication
7. **Probabilistic narrative** — thinking in ranges/distributions, not specific hands

GTO frequencies serve as the *baseline language* — what a "balanced" story sounds like. Deviations from GTO are narrative choices that should be conscious and justified.

## Research Step 2: Learning Science (Completed)

### The Master Principle

The product should provide what live poker cannot: **accurate process feedback, controlled difficulty, varied practice, explicit principle articulation, and freedom from outcome noise.** Live poker gives volume and realism. The training product gives everything else. Together they produce deliberate practice.

### Key Findings by Area

**Deliberate Practice (Ericsson):** Expert performance comes from specific, effortful practice at the edge of current ability — not accumulated hours. Poker is uniquely hard for deliberate practice because feedback is noisy (correct decisions can lose money). A training tool solves this by evaluating decisions against theoretical standards, not outcomes.

**Narrative vs. Rote Instruction (Schank, Bruner, Jonassen):** Multiple research traditions confirm that narrative instruction outperforms rote instruction for complex, ill-structured decisions. Schank's case-based reasoning shows people store and retrieve *stories*, not rules. Bruner established narrative as the primary cognitive mode for understanding actions and intentions. Poker is inherently narrative — teaching it as "memorize these frequencies" uses the wrong cognitive mode.

**Mental Models / Chunking (de Groot, Chase & Simon):** Chess grandmasters don't calculate more moves — they *see different things*. They perceive meaningful patterns where novices see individual pieces. Experts hold ~50,000-100,000 "chunks" in long-term memory. Our 20-archetype system is formalized chunking — validated by this research. The number is roughly right (learnable, yet captures meaningful differences).

**Recognition-Primed Decision Making (Klein):** Experts don't evaluate options — they recognize the situation and immediately generate a plausible action, then mentally simulate it. Only if simulation reveals problems do they consider alternatives. Expert poker players don't think "fold, call, or raise?" — they think "this is a check-raise on a wet board from a tight player — fold." Training should build this recognition library.

**Spaced Repetition + Interleaving (Bjork, Rohrer):** Interleaving (mixing archetype types randomly) produces better long-term learning than blocking (grinding one archetype), despite feeling harder. This is because interleaving forces *discrimination* — distinguishing similar-looking spots that require different responses. Drills should be interleaved by default. Bring back weak archetypes at increasing intervals.

**Desirable Difficulty (Bjork):** Making learning harder improves retention. Key techniques: retrieval practice (generate the answer before seeing it), varying conditions, reducing feedback frequency for intermediate+ learners. The "explain your reasoning" prompt before revealing the answer is a powerful desirable difficulty.

**Transfer of Learning (Gick & Holyoak, Perkins & Salomon):** Learning transfers to new situations only when the learner extracts the underlying principle, not just the surface pattern. Without explicit prompting, people miss structural similarities. Every drill solution should include the WHY (transferable principle), not just the WHAT (specific frequency). Compare-and-contrast exercises between similar archetypes build discrimination and principle extraction.

**Feedback in Noisy Environments (Hogarth, Baron & Hershey):** Poker is a "wicked" learning environment — feedback is noisy, outcomes don't reliably reflect decision quality. Outcome bias is pervasive and resistant to correction. The product must evaluate decisions against GTO (process feedback), show EV (expected value), and explicitly teach that correct decisions can have bad outcomes. Never show outcome before process evaluation.

**Cognitive Load (Sweller):** Working memory holds ~4 items. Poker decisions involve dozens of inputs. Solution: chunking (archetypes), progressive disclosure (show essentials first, details on demand), pre-computed integrations ("Good price to call" instead of raw pot odds math). Minimize extraneous load (clean UI), maximize germane load (effortful learning activities).

**Dreyfus Skill Stages:** Novices need rules. Advanced beginners need guided situations. Competent players need decision practice with feedback. Proficient players need extensive varied exposure. Experts need edge cases and anomalies. Each stage requires fundamentally different instruction. Teaching rules to an expert is counterproductive. Asking a novice to "read the narrative" is useless.

**Flow State (Csikszentmihalyi):** Flow occurs when challenge matches skill. Adaptive difficulty keeps the learner in the flow channel. Minimize friction between decisions. Start sessions with warm-up, ramp to challenge, cool down. The upper edge of the flow channel — challenging enough to require effort, achievable enough to maintain engagement — is the sweet spot.

### Critical Tensions (and Resolutions)

| Tension | Resolution |
|---|---|
| Explicit instruction vs. discovery learning | Explicit early, fading scaffolding, eventual autonomy |
| Process feedback vs. outcome experience | Show process evaluation → EV → variance envelope → simulated outcome (in that order) |
| Standardized GTO vs. personalized learning | GTO is the curriculum content; delivery (difficulty, pacing, framing) is personalized |
| Engagement vs. effortful learning | Reduce extraneous load to free capacity for germane load; aim for upper edge of flow channel |
| Blocked vs. interleaved practice | Block during initial acquisition of new patterns, then quickly transition to interleaving |

### What This Means for the Product

| Research Principle | Product Feature |
|---|---|
| Deliberate practice | Archetype-targeted drills, adaptive difficulty, GTO-based scoring |
| Narrative learning | Hand-as-story framing, archetypes as characters, narrative explanations |
| Chunking | 20-archetype classification, board texture display, range visualization |
| RPD | Pattern recognition drills, speed drills for advanced users |
| Spaced repetition | Per-archetype scheduling, bring back weak spots at intervals |
| Interleaving | Default interleaved drill sequencing |
| Desirable difficulty | Quiz mode, delayed feedback, "explain before reveal" |
| Transfer | Varied contexts, principle extraction, comparison exercises |
| Process feedback | GTO evaluation before outcome, EV framing, variance education |
| Cognitive load | Progressive disclosure, pre-computed chunks, clean UI |
| Dreyfus stages | Adaptive modes (Tutorial → Learn → Practice → Challenge → Analyze) |
| Flow state | Adaptive difficulty, frictionless transitions, progress visibility |

### The Learning Progression Model

Based on Dreyfus stages mapped to our product:

1. **Tutorial** (Novice): Explicit rules. "With top pair on a dry board, bet most of the time." Learn mode with immediate feedback. Simple archetypes only.

2. **Learn** (Advanced Beginner): Guided situations. "On dry boards, bet — BUT this board is paired, which changes things because..." Situational qualifiers introduced. Still immediate feedback.

3. **Practice** (Competent): Quiz mode, interleaved archetypes, delayed feedback. User articulates reasoning before seeing answer. Comparison exercises between similar spots.

4. **Challenge** (Proficient): Speed drills (timed decisions), unusual spots, edge cases. Asked to predict solver ranges, not just actions. Calibration exercises. Reduced feedback frequency.

5. **Analyze** (Expert): Exploitative adjustments beyond GTO. Opponent modeling in real-time. Creative lines. Self-directed exploration of novel spots. WASM solver for exact answers.

## Research Step 3: Skill Dependency Tree (Completed)

### The Seven Tiers

| Tier | Name | Dreyfus Stage | Core Question |
|---|---|---|---|
| 0 | Game Mechanics | Novice | "What are the rules?" |
| 1 | Basic Evaluation | Novice/Adv Beginner | "Is my hand good?" |
| 2 | Board Reading | Advanced Beginner | "What does the board mean?" |
| 3 | Range Thinking | Competent | "What could they have?" |
| 4 | Narrative Construction | Competent/Proficient | "What story is being told?" |
| 5 | Strategic Integration | Proficient | "What's the optimal framework?" |
| 6 | Meta-Game | Expert | "What do they think I think?" |

### The 26 Skills

**Tier 0 — Game Mechanics**: S0.1 Hand Rankings, S0.2 Betting Structure, S0.3 Positions, S0.4 Blinds/Stacks/SPR

**Tier 1 — Basic Evaluation**: S1.1 Starting Hand Strength, S1.2 Position Awareness, S1.3 Pot Odds, S1.4 Preflop Decision Framework

**Tier 2 — Board Reading**: S2.1 Board Texture Recognition, S2.2 Relative Hand Strength, S2.3 Draws and Outs, S2.4 Nut Advantage & Blockers

**Tier 3 — Range Thinking**: S3.1 What Is a Range, S3.2 Position-Based Opening Ranges, S3.3 Narrowing Ranges by Actions, S3.4 Range Advantage

**Tier 4 — Narrative Construction**: S4.1 Bet Sizing as Communication, S4.2 Line Consistency, S4.3 Opponent Profiling, S4.4 Thin Value & Bluff Catching, S4.5 Bluffing with Logic

**Tier 5 — Strategic Integration**: S5.1 GTO Baselines, S5.2 Exploitative Adjustments, S5.3 Multi-Street Planning, S5.4 Pot Geometry

**Tier 6 — Meta-Game**: S6.1 Table Image, S6.2 Leveling & Counter-Strategy, S6.3 Game Selection & Mental Game

### Gating Skills (everything downstream depends on these)

1. **S0.3 Positions** — the skeleton of all range-based reasoning
2. **S1.3 Pot Odds** — the quantitative backbone
3. **S2.1 Board Texture** — paradigm shift from "my hand" to "the board"
4. **S3.1 What Is a Range** — THE great divide between recreational and serious play
5. **S3.3 Narrowing Ranges** — the engine of hand reading

### Critical Path

The shortest path through the gating skills IS the narrative progression:

**Know your hand → Know the board → Think in ranges → Read their story → Tell your story → Know the default story → Deviate with purpose**

`S0.1 → S1.1 → S3.1 → S3.3 → S4.2 → S5.1 → S5.2`

### Pareto Analysis: 20% of Skills That Prevent 80% of Losses

For recreational players, these five skills in order produce the steepest improvement:

1. **S1.4 Preflop Framework** — Stop playing trash hands. ~30% of recreational losses.
2. **S1.2 Position Awareness** — Tighten OOP, open up IP. ~15% of losses.
3. **S2.1 Board Texture** — Stop overvaluing top pair on wet boards. ~15% of losses.
4. **S3.3 Range Narrowing** — "They raised the turn — that's strong." ~10% of losses from paying off obvious strength.
5. **S4.3 Opponent Profiling** — Stop bluffing the calling station. ~10% of losses from one-strategy-fits-all.

### Skills That SEEM Advanced But Should Be Taught Early

- **S2.1 Board Texture** — Players jump from hand rankings to "what should I bet?" skipping the board entirely. Teach immediately after position.
- **S2.4 Blockers** — "I have the A♠ so they can't have the nut flush" is completely intuitive once introduced.
- **S4.5 Bluffing with Logic** — Teaching bluff construction teaches bluff catching as its mirror. Don't delay this to Tier 6.

### Skills That SEEM Basic But Should Be Delayed

- **S3.4 Range Advantage** — Sounds like "who has better hands" but requires comparing two ranges simultaneously across a board. Genuinely hard.
- **S5.1 GTO Baselines** — Players want to jump to GTO early. But GTO without understanding what you're optimizing against creates rote memorizers, not thinkers.

### The Minimum Viable Skill Set (First 10 Hours)

```
S0.1 → S0.2 → S0.3 → S1.1 → S1.2 → S1.4 (preflop charts)
                                    ↓
                              S2.1 (board texture — early!)
                                    ↓
                              S2.2 (relative hand strength)
                                    ↓
                              S3.1 (what is a range — the unlock)
```

After this sequence: correct preflop play, board awareness, and the conceptual foundation for range thinking. No longer a "fish" — an advanced beginner making fundamentally sound decisions.

### Product Progression (Maps to Existing Architecture)

| Phase | Skills | Mode | Outcome |
|---|---|---|---|
| 1: "Stop Losing" | Tiers 0-1 | Tutorial/Learn | Stop playing 72o from UTG |
| 2: "Read the Board" | Tier 2 | Learn | Stop stacking off with top pair on wet boards |
| 3: "Think in Ranges" | Tier 3 | Learn → Practice | Start folding when opponent's line screams strength |
| 4: "Tell a Story" | Tier 4 | Practice → Quiz | Bluffs start working, calls become disciplined |
| 5: "Master the Framework" | Tiers 5-6 | Challenge → Analyze | GTO baseline + purposeful deviations |

### Narrative Layer Mapping

Each skill serves one or more narrative layers:

- **My Narrative**: S1.1, S1.2, S2.2, S2.3, S4.1, S4.2, S4.5, S5.3, S5.4
- **Their Narrative**: S3.1, S3.2, S3.3, S4.3, S4.4
- **Meta-Narrative**: S2.4, S4.2, S4.5, S5.2, S6.1, S6.2
- **Shared Context**: S2.1, S3.4
- **Framework/Reference**: S1.3, S5.1

## Research Step 4: Minimum Viable Narrative (Completed)

### The One Thing

If a recreational player internalized exactly one idea, it should be this:

**Every action at the table is a sentence in a story. Before you act, ask: "What story am I telling, and does it make sense?"**

This single reframe transforms play because it shifts the player from reactive ("I have top pair, I bet") to intentional ("What does a bet here say about my hand, and is that what I want to say?"). It also immediately creates awareness that opponents are telling stories too — and those stories can be read.

### The Three Questions (Minimum Viable Narrative)

At every decision point, a beginner should ask:

1. **"What do I have, and how does the board change it?"** — Moves the player from absolute hand strength ("I have a pair of kings") to relative hand strength ("I have top pair but three hearts are out and someone is betting big"). This is Tiers 1-2 compressed into a single question.

2. **"What is their action telling me?"** — Forces the player to interpret opponent behavior as information, not noise. A bet is not just "they bet." It carries meaning: strength, weakness, or a story being constructed. This seeds Tier 3 range thinking without requiring the formal concept of ranges.

3. **"Does my action make sense as part of a story?"** — The self-narrative check. Before betting, the player asks whether a strong hand would have played this way. Before bluffing, they ask whether their line is consistent with the hand they are representing. This is the bridge from mechanical play to narrative play.

These three questions are:
- **Expressible in seconds** — no framework to memorize
- **Applicable at every decision point** — preflop through river, cash or tournament
- **Progressively deepenable** — each question expands into richer analysis as skill grows

### How the Questions Deepen by Tier

| Tier | Q1: "What do I have?" | Q2: "What are they saying?" | Q3: "Does my story make sense?" |
|---|---|---|---|
| **1 (Basic)** | "Top pair is good, bottom pair is not" | "A big bet usually means strong" | "I should bet when I have good cards" |
| **2 (Board)** | "Top pair on a wet board is vulnerable; on a dry board it's strong" | "A bet on a scary board means they connect with it" | "Betting makes sense because this board is good for my range" |
| **3 (Ranges)** | "My hand is in the top 30% of hands that got here" | "Their range for this action is X — here's what they could have" | "My range includes hands that play this way, so this bet is credible" |
| **4 (Narrative)** | "My hand blocks their value range and unblocks their bluffs" | "Their check-then-raise tells a story of slow-played strength OR a semibluff" | "My entire line from preflop tells a consistent story of X, and this action continues it" |
| **5 (Strategic)** | "GTO says this hand is a mixed-frequency bet; the solver uses it because of its blocker properties" | "Their frequency of checking this turn is capped — they would always bet with Y" | "Deviating from GTO here is +EV because this specific opponent over-folds to river overbets" |
| **6 (Meta)** | "They think my range is capped here because of my flop check" | "They're betting because they think I'm weak — but do they think I know they think that?" | "I'm representing a range they'll find credible given their model of my play style" |

### The Simplest Mental Model

**Poker is a conversation.** Each action is a sentence. A bet says "I'm strong." A check says "I'm weak or trapping." A raise says "I'm stronger than you." A call says "I'm not sure but I want to hear more."

The key insight for beginners: **you are always saying something, whether you mean to or not.** Checking when you should bet is still a sentence — it says "I don't have much." If you then suddenly bet big on the river, your story doesn't make sense. Opponents who notice this will call your bluffs and fold to your value bets.

The conversation metaphor works because:
- It's immediately intuitive (everyone understands conversations)
- It frames opponents as participants, not obstacles
- It naturally introduces the concept of consistency ("don't contradict yourself")
- It scales: beginners listen to individual sentences; experts read between the lines

### Progressive Expansion

**Week 1 — Listen:** Just pay attention to what opponents are saying with their actions. Don't try to be clever. When someone bets big, they're usually saying "I'm strong." Believe them until you have reason not to.

**Month 1 — Speak Clearly:** Make your own actions tell coherent stories. If you raised preflop (saying "I have a good hand"), follow up with a bet on a favorable flop (continuing the story). Don't randomly check and then suddenly bet — unless you're intentionally changing the story.

**Month 3 — Read Between the Lines:** Start noticing when opponents' stories don't add up. They checked the flop but bet big on the turn? Either the turn card helped them, or they're changing their story (possibly bluffing). Start considering which.

**Month 6 — Write the Plot:** Construct multi-street plans. Before you bet the flop, know what you'll do on different turn cards. Your story should have a beginning, middle, and end — not be improvised sentence by sentence.

**Year 1 — Unreliable Narrators:** Recognize that opponents can tell false stories (bluff) and that you can too. The question shifts from "what are they saying?" to "do I believe them, and why?" And from "what should I say?" to "what do I want them to believe?"

### Why This Works Better Than "Learn GTO Frequencies"

A beginning player told "fold 65% in the big blind facing a raise" will fold correctly but learn nothing transferable. When the situation changes slightly (different position, different sizing, different opponent), they're lost.

A beginning player who asks "What is their raise telling me? What does the board mean for both of us? Does calling here make sense in the story of this hand?" develops judgment that transfers across all situations. The frequencies become natural consequences of good narrative reasoning — you fold more in bad spots because the story says to, not because a chart told you to.

The frequencies are the WHAT. The narrative is the WHY. Teaching the WHY produces players who can derive the WHAT in novel situations.

## Research Step 5: Measuring Narrative Skill Progression (Completed)

### The Measurement Problem

Standard poker training metrics are:
- **Accuracy**: Did you pick the right action? (Drill score)
- **EV loss**: How much did your mistake cost? (Solver comparison)
- **Win rate**: Are you beating the game? (Long-term results)

None of these measure whether someone is THINKING better. A player can memorize the correct action for 100 spots and score 90% accuracy without understanding a single principle. They'll fail on spot 101 because they never learned why.

Narrative skill progression requires measuring the quality of the reasoning process, not just the correctness of the output.

### What We're Actually Measuring

Five distinct cognitive capabilities, ordered by developmental sequence:

**1. Situation Recognition** (Tier 1-2)
Can the player correctly identify what kind of spot they're in?

- Do they recognize board texture categories (dry/wet/paired/monotone)?
- Can they assess relative hand strength (not just absolute)?
- Do they notice draws, blockers, and board-changing cards?

**2. Range Construction** (Tier 3)
Is the player thinking in ranges, not specific hands?

- When asked "what could they have?", do they generate a range or a single hand?
- Does their range narrow appropriately based on actions?
- Do they understand that check =/= weak and bet =/= strong (it depends on context)?

**3. Narrative Coherence** (Tier 4)
Can the player construct and evaluate multi-street stories?

- Can they identify when an opponent's line is inconsistent?
- Can they construct a credible bluff line (consistent story for a hand they don't have)?
- Do they plan across streets or decide one street at a time?

**4. Opponent Adaptation** (Tier 4-5)
Does the player adjust to different opponents?

- Do they change strategy against different player types?
- Can they identify exploitable tendencies?
- Do they understand WHY the adjustment works (not just that it does)?

**5. Metacognitive Awareness** (Tier 5-6)
Does the player monitor and evaluate their own thinking?

- Can they articulate confidence levels ("I'm 70% sure they're bluffing because...")?
- Do they recognize when they're in a spot outside their competence?
- Can they separate decision quality from outcome quality?

### Measurement Instruments

#### 1. Reasoning Prompts (Primary Method)

Instead of just asking "What do you do?", present a spot and ask structured reasoning questions before revealing the action choice.

**Tier 1-2 Assessment — Situation Read:**
```
Board: Ks 9h 4d 7c
Hero: Kd Jh

Q1: Rate your hand strength 1-5 and explain why.
Q2: Name the draws possible on this board.
Q3: What changed from the flop to the turn?
```

Scoring: Not right/wrong but *quality of reasoning*. A player who says "I have top pair, it's strong" scores lower than one who says "Top pair good kicker on a dry board — few draws got there, I'm ahead of most of their calling range." Both might pick the same action, but the second player demonstrates board reading.

**Tier 3 Assessment — Range Narrowing:**
```
BTN opens, you call from BB.
Flop: Qh 8d 3s. You check, they bet 1/3 pot.
Turn: 6c. You check, they bet 2/3 pot.

Q1: What hands would they bet small on the flop?
Q2: What hands would they then bet bigger on the turn?
Q3: How did the turn bet change their likely range?
```

Scoring: Does the player narrow from flop range to turn range? Do they distinguish between sizing tells? Do they recognize that increasing bet size on a blank turn suggests value-heavy? A memorizer might know the "right" call frequency but can't articulate WHY the turn bet is informative.

**Tier 4 Assessment — Story Construction:**
```
You raised pre from CO, BB called.
Flop: Jh 7s 2c. BB checks, you bet, BB calls.
Turn: Kd. BB checks.

Q1: What story have you told so far?
Q2: What story has BB told?
Q3: You have 6h 5h (complete air). Construct a credible bluff: what are you representing, and what would you do on different rivers?
Q4: Now you have As Ad. How does your plan change and why?
```

Scoring: Can they articulate a coherent multi-street plan? Do they recognize their bluff needs to represent specific hands? Do they adjust their plan based on holdings? The key distinction: a memorizer says "I should bet because solver says bet 70% here." A narrative thinker says "I'm representing overpairs and KJ — both hands would play exactly this way, and the king on the turn strengthens my story."

**Tier 5-6 Assessment — Adaptation & Meta:**
```
Same spot, but now you're told:
Opponent A: Folds to turn bets 70% of the time.
Opponent B: Calls down with any pair.

Q1: How does your strategy change against each?
Q2: What if Opponent A knows you know they over-fold?
```

Scoring: Do they exploit correctly? Do they understand the recursive implications? Can they articulate the equilibrium dynamic?

#### 2. Consistency Across Isomorphic Spots

Present the same structural decision in different surface forms. A player who truly understands the principle will respond consistently; a memorizer will not.

Example pair:
- **Spot A**: Hero has KsQs on Ks 8d 3h 2c. Opponent check-raises turn.
- **Spot B**: Hero has Jh Th on Jh 7s 2d 4c. Opponent check-raises turn.

These are structurally identical (top pair facing turn check-raise on dry board) but look different. A narrative thinker recognizes the pattern and responds consistently. A surface-level player might fold the second because "jack-ten isn't as strong as king-queen" — missing that relative strength is the same.

**Metric**: Consistency score across isomorphic pairs. High consistency + correct action = principle understood. High consistency + wrong action = consistent misunderstanding (targetable). Low consistency = surface-level pattern matching.

#### 3. Range Estimation Tasks

Rather than asking for an action, ask the player to estimate the opponent's range. This directly tests whether they're constructing ranges.

```
UTG raises, MP 3-bets, UTG calls.
Flop: Ah Kd 7s. UTG checks, MP bets 75% pot, UTG calls.
Turn: 3c. UTG checks, MP checks.

Q: What is MP's likely range after checking the turn?
A: [Player selects/describes range]
```

**Metric**: Range accuracy (compared to solver range for this line). But more importantly: *range coherence* — does the player's estimated range make sense given the action sequence? A player who includes 72o in MP's 3-bet range isn't thinking about ranges at all.

#### 4. Prediction Tasks

Before revealing the next card or opponent action, ask the player to predict:
- "What will the opponent do?" (with confidence %)
- "If they bet, what does it mean? If they check, what does it mean?"

Then compare prediction to reality over many hands. This measures:
- **Calibration**: Are their confidence percentages accurate?
- **Discrimination**: Can they distinguish spots where opponents are likely to bet vs. check?
- **Narrative integration**: Do their predictions follow logically from the story so far?

This is analogous to weather forecasting calibration — a well-calibrated poker player who says "70% they bet here" should see bets about 70% of the time in that type of spot.

#### 5. Explanation Quality Rubric

When the player explains their reasoning (in learn mode, post-drill reflection, or reasoning prompts), score on a rubric:

| Dimension | 1 (Novice) | 3 (Competent) | 5 (Expert) |
|---|---|---|---|
| **Hand evaluation** | Absolute only ("I have a pair") | Relative to board ("Top pair, dry board") | Relative to ranges ("Top of my checking range") |
| **Opponent modeling** | None or specific hand ("He has aces") | Action-based range ("His raise means strong range") | Context-weighted range with sizing tells |
| **Self-awareness** | None ("I bet because I should") | Action coherence ("My line represents X") | Perceived range + blocker effects |
| **Board reading** | Card names only | Texture + draws | Equity shifts + runout planning |
| **Adaptation** | Same strategy always | Adjusts to obvious tendencies | Adjusts with awareness of counter-adjustments |
| **Uncertainty** | Binary certainty | Acknowledges alternatives | Probabilistic with calibrated confidence |

### Lessons from Other Domains

**Chess Rating (Elo/Glicko):** Measures outcome, not process. But the rating deviation (uncertainty) parameter is useful — a player with high rating deviation is inconsistent, suggesting surface-level pattern matching. We could track a "consistency rating" alongside an accuracy score.

**Medical Diagnostic Accuracy:** Medical education measures not just "right diagnosis" but diagnostic reasoning: did the student gather the right information, weight it appropriately, and consider the right differentials? Script Concordance Tests (SCTs) present a clinical scenario and ask "If you learned X, would it make Y more or less likely?" — directly testing Bayesian updating. We can adapt this: "If villain checks the turn, does that make AK more or less likely in their range?"

**Aviation Situational Awareness (SAGAT):** Freeze the simulation at a random point. Ask the pilot questions about the current state (what altitude are you at? what's the nearest threat? what will happen next?). Answers reveal whether the pilot has an accurate mental model. We can do this in poker: freeze a hand mid-action and ask "What's the pot? What street is it? Estimate villain's range. What are you representing?"

**Radiologist Training:** Studies show that experts don't just see the pathology — they have a systematic scan pattern. Novices look randomly. Eye-tracking reveals this. Our equivalent: in what order does the player consider information? Do they evaluate the board before their hand? Do they consider position? We can infer scan patterns from reasoning prompt responses.

### Distinguishing Memorization from Understanding

The key challenge: how to tell if someone memorized "fold QTs on Ah Kd 7s facing a 3-bet pot c-bet" vs. understanding why.

**Technique 1 — Transfer Tests:** Change one variable. Same spot but the board is Ah Kd 7s 4s (flush draw added). Does the player adjust? A memorizer repeats the memorized answer. A thinker recognizes the flush draw changes the calculation.

**Technique 2 — Inverse Tasks:** Instead of "what do you do?", ask "construct a hand where betting is correct here." If they can generate the right answer AND generate examples that satisfy the principle, they understand the principle.

**Technique 3 — Teaching Prompts:** "Explain to a beginner why checking is better than betting here." If they can teach it, they understand it. If they can only state the answer ("because the solver says so"), they've memorized.

**Technique 4 — Counterfactual Reasoning:** "What would need to change about this spot for the opposite action to be correct?" This directly tests whether they understand the causal structure. A memorizer can't answer this. A thinker says "If the board were wetter, I'd bet to protect."

### Progression Metrics: What Does Success Look Like?

| Metric | Tier 1-2 | Tier 3-4 | Tier 5-6 |
|---|---|---|---|
| **Situation ID accuracy** | >80% on basic texture | >80% including draws/blockers | >90% with subtle features |
| **Range estimation error** | N/A (not yet thinking in ranges) | Within 20% of solver range | Within 10% |
| **Isomorphic consistency** | >50% (beginning to see patterns) | >75% (reliable principle application) | >90% (deep structural recognition) |
| **Reasoning rubric average** | 1.5-2.0 | 2.5-3.5 | 4.0-5.0 |
| **Prediction calibration** | Not measured | Within 20% (directionally right) | Within 10% (well-calibrated) |
| **Adaptation speed** | No adaptation | Adapts within 20 hands | Adapts within 5 hands |
| **Transfer success** | <30% (fails novel spots) | >50% (principle transfers sometimes) | >80% (reliable transfer) |

### Implementation Notes for HoldemVision

The product already has the architecture to support this. The key additions:

1. **Reasoning prompts in drill mode.** Before the action buttons, show 1-2 questions. "What do you think their range is?" or "What are you representing here?" Score the text/selection response. This is the richest signal.

2. **Isomorphic spot pairs in the drill queue.** Tag structurally similar spots and track consistency. Surface this to the user: "You folded in Spot A but called in Spot B — these are the same pattern. Here's why."

3. **Range estimation mini-drills.** Separate from action drills. Show a hand history up to a point and ask "Select the range." Score against solver range.

4. **Explanation quality scoring.** When the user's reasoning mentions board texture, position, range, blockers, or opponent tendencies, score higher. When it mentions only absolute hand strength, score lower. This can be automated via keyword/concept detection or (better) LLM evaluation.

5. **Per-skill progress tracking.** Map each drill to the skills it tests (from the 26-skill taxonomy). Show progress per skill, not just per archetype. A player might be strong on board reading (S2.1) but weak on range narrowing (S3.3) — the drill queue should adapt.

## Research Step 6: Competitive Landscape Through the Narrative Lens (Completed)

### The Central Question

Does any existing poker training product teach the process of narrative construction — the thinking that produces correct decisions — or do they all teach correct decisions directly?

**Short answer: None teach the process systematically.** Some touch on it (notably in video content), but no product makes narrative construction the core mechanic. This is the gap.

### Product-by-Product Analysis

---

#### 1. GTO Wizard

**What it is:** The market leader for solver-based drill training. Users face precomputed solver spots, choose actions, and get scored on how closely they match GTO frequencies. Comprehensive spot library, adaptive difficulty, leaderboards.

**What it does well:**
- Massive spot library (millions of precomputed solutions). Breadth of coverage is unmatched.
- Clear, immediate feedback: "This is a bet, solver bets 67% here."
- Aggregated reports showing which spot types are weak.
- Range viewer lets you see the full GTO solution for both players.
- "Practice" mode with spaced repetition and adaptive difficulty.
- Production polish — fast, clean, well-designed.

**What it misses (narrative lens):**
- Teaches WHAT to do, never WHY. "Solver bets 67% here" tells you the answer but not the reasoning.
- No process feedback. It cannot distinguish a player who memorized "bet AK on Ah7d2c" from one who understands range advantage on ace-high dry boards.
- Frequency targets encourage pattern matching, not principle extraction. Players grind until they "know" each spot, but can't transfer to novel boards.
- No opponent modeling. Every spot is against a GTO opponent. Players never learn to exploit or adapt.
- No self-narrative training. The player never asks "what am I representing?" because the solver already decided.
- Range viewer exists but is passive — you look at it after, not as part of the decision process.

**Implicit learning theory:** Behaviorist — stimulus (spot) -> response (action) -> reinforcement (score). Learning is defined as producing the correct output. The cognitive process is a black box.

**Target user:** Intermediate to advanced players who already think in ranges and want to sharpen specific spots against GTO. Typically 25NL+ online players.

**The gap:** GTO Wizard is a frequency lookup trainer. It's excellent at what it does. But it produces players who can pass the test without understanding the material. The narrative gap: it never asks "why?" and never tests whether the player's mental model is correct.

---

#### 2. PokerTracker / Hold'em Manager (HUDs + Databases)

**What they are:** Hand history databases with statistical analysis and real-time HUDs (heads-up displays). Track your results, analyze opponent tendencies, display stats at the table.

**What they do well:**
- Rich data: VPIP, PFR, 3-bet%, fold-to-cbet, aggression by street — hundreds of stats per player.
- Population analysis: what does the average player do in spot X?
- Hand replay with filtering: find all hands where you 3-bet from the blinds and lost.
- HUD provides real-time information that informs narrative construction (if the player knows how to use it).
- Leak detection: systematic identification of losing patterns.

**What they miss (narrative lens):**
- Stats are not stories. Knowing an opponent's "fold to c-bet = 55%" is raw data, not a narrative. The player must construct the narrative themselves — "this player folds too much on the flop, so I should c-bet wider." Most players never make this translation.
- No guidance on interpretation. The tool shows you what happened. It doesn't help you understand WHY or WHAT TO DO about it.
- Encourages stat-based play over situation-based play. Players look at a number instead of constructing a hand-level narrative. "His aggression is 2.1" is not the same as "he raised the turn after calling the flop — what does that mean in this specific context?"
- No teaching component. Pure information display. Learning is entirely self-directed.
- Backward-looking: great for review, useless for real-time narrative construction practice.

**Implicit learning theory:** Information provision. The assumption is that better data leads to better decisions. This is true but incomplete — you also need the reasoning framework to use the data.

**Target user:** Regular online players who want to track performance and exploit opponents statistically. Typically NL50+ grinders.

**The gap:** HUDs provide the *inputs* to narrative construction (opponent tendencies, frequencies, patterns) but not the narrative construction skill itself. Like giving someone a dictionary without teaching them to write.

---

#### 3. Upswing Poker

**What it is:** Video course platform. Doug Polk + team of coaches create structured courses (preflop charts, postflop strategy, live play commentary). Also has a "solver tool" for range exploration.

**What it does well:**
- Structured curriculum: beginner to advanced, organized by topic.
- Doug Polk's hand breakdowns ARE narrative thinking — he walks through "what does this bet mean? what are we representing? what's their range?" in real-time.
- Preflop charts are the best on-ramp for pure beginners (stop the bleeding immediately).
- Live play commentary provides a window into expert thought process.
- Course structure with clear progression.

**What it misses (narrative lens):**
- Video is passive. Watching someone think narratively is not the same as doing it yourself. Transfer from observation to practice is weak without active engagement.
- The courses teach strategy but don't practice it. There's no "now you try" moment with feedback.
- Preflop charts are pure memorization — the antithesis of narrative thinking. Necessary as a starting point, but the site doesn't bridge from charts to thinking.
- No interactive drills tied to the video content. You watch, then you're on your own.
- The solver tool is a bolt-on, not integrated into the learning path.
- No opponent modeling or adaptation training. It's "here's the correct strategy" without "here's how to adjust."

**Implicit learning theory:** Apprenticeship/modeling — watch the expert, absorb their approach. This works for motivated self-learners but fails for most people because it requires the learner to extract principles from examples without scaffolding.

**Target user:** Beginners to intermediates who prefer video learning. Recreational players who want to "get serious."

**The gap:** The narrative content is there (in video form) but the practice mechanism is absent. Upswing tells you how to think but doesn't train you to think that way yourself.

---

#### 4. Run It Once (RIO)

**What it is:** Phil Galfond's training site. High-quality video content from elite players. "Essential" (beginner) and "Elite" (advanced) tiers.

**What it does well:**
- Highest average coaching quality in the industry. Coaches like Galfond, Peter Clarke, and others are deeply analytical.
- Galfond's content IS narrative thinking — he's the most explicit about "what does my range look like to them?" and bidirectional range construction.
- Peter Clarke's "From the Ground Up" is arguably the best structured poker course ever made — it builds from fundamentals to advanced concepts with explicit skill dependencies.
- "Play and Explain" format shows the expert's real-time thought process, including uncertainty and adjustments.
- VISION tool (range explorer) for solver work.

**What it misses (narrative lens):**
- Same fundamental problem as Upswing: passive consumption. No active practice with feedback.
- Extremely high-quality content that requires a high baseline to absorb. Galfond's thought process videos are brilliant but dense — a beginner can't extract the principles without significant poker background.
- No adaptive difficulty. A Tier 2 player watches the same content as a Tier 5 player.
- No spaced repetition, no drilling, no interactive component beyond video.
- Closed in late 2024/early 2025 (limited new content). The library is static.

**Implicit learning theory:** Cognitive apprenticeship at its best — explicit articulation of expert thinking with worked examples. The theory is sound, but the delivery (video-only, no practice) limits transfer.

**Target user:** Serious intermediate to advanced players. RIO's "Essential" track tried to serve beginners but the content gravitates upward.

**The gap:** RIO has the best narrative-adjacent content but zero practice infrastructure. It's the textbook without the homework. Galfond SHOWS you how to construct narratives; nothing in the product helps you PRACTICE constructing them.

---

#### 5. PokerCoaching.com (Jonathan Little)

**What it is:** Jonathan Little's platform. Courses, quizzes, charts, webinars. Emphasizes accessible instruction for recreational players.

**What it does well:**
- Accessibility: explicitly targets recreational/beginner players. Language is approachable.
- "Quiz" format adds some active learning compared to pure video platforms.
- Extensive chart library for preflop play.
- Regular webinars with hand analysis maintain engagement.
- Little is explicit about bet sizing as communication: "What are you representing with this bet?"
- Good volume of content covering common spots.

**What it misses (narrative lens):**
- Quizzes are action-selection ("What do you do?"), not reasoning-quality tests. Same limitation as GTO Wizard — right answer, no process check.
- Heavily chart-dependent. The progression from charts to thinking is unclear.
- Content is broad but shallow — covers many topics without deep principle extraction.
- No opponent modeling training. Strategy is presented as one-size-fits-all.
- Little's approach is more prescriptive than narrative — "in this spot, do X" rather than "here's how to think about this spot."
- No adaptive difficulty or personalized learning path.

**Implicit learning theory:** Direct instruction + simple assessment. "Here's the rule, here's a quiz, did you get it right?" The quiz checks recall, not understanding.

**Target user:** Recreational players and beginners. Home game players who want to stop losing.

**The gap:** Good on accessibility, weak on depth. Quizzes test memorization. No mechanism for teaching narrative construction. The "why" is present in video content but absent from the practice tools.

---

#### 6. Primedope / GTOBase

**What it are:** Free GTO reference tools. Precomputed solver solutions for common spots. Look up the "right" answer.

**What they do well:**
- Free access to solver solutions democratizes GTO knowledge.
- Clean interface for looking up specific spots.
- GTOBase has a trainer mode similar to (but less polished than) GTO Wizard.
- Useful reference tool for players doing their own study.

**What they miss (narrative lens):**
- Pure lookup tools. No teaching, no narrative, no reasoning. The poker equivalent of a dictionary — useful if you already know how to read, useless for learning to read.
- No context, no explanation, no adaptation.
- Encourage the worst kind of memorization: "solver says bet 33% pot with this hand, so I bet 33% pot."
- No opponent considerations whatsoever.

**Implicit learning theory:** Reference learning — look up the answer when you need it. This is not a learning theory; it's a crutch that atrophies the skill it's meant to support.

**Target user:** Budget-conscious players who want solver access without paying for GTO Wizard.

**The gap:** Everything. These are reference tools, not training tools.

---

#### 7. PokerSnowie

**What it is:** AI-based training tool. Uses a neural network (not solver-based) to evaluate play. Offers hand analysis, scenario training, and a "coaching" mode that rates your play.

**What it does well:**
- Evaluates complete hands (not just isolated spots). You play a full hand and get feedback on each decision.
- EV assessment at each decision point: "This call cost you 0.3 BB."
- The AI opponent provides adaptive difficulty (though limited).
- Scenario mode lets you set up specific situations.
- Error categorization: "This was a major error" vs. "This was a minor inaccuracy."

**What it misses (narrative lens):**
- Neural network is a black box — it can't explain WHY an action is wrong, only that it is. "Error: -0.3 BB" gives no narrative insight.
- Outdated AI. The neural network is from ~2015 and plays noticeably below modern solver level, especially in 3-bet/4-bet pots and river play.
- No range visualization. You see your error but not the range-based reasoning behind the correct play.
- No opponent modeling (ironic for an "AI" tool). The AI opponent is fixed — you can't practice adapting to different player types.
- Interface feels dated. Not the polish level that modern users expect.

**Implicit learning theory:** Outcome feedback — play, see score, adjust. This is trial-and-error learning. Effective for pattern detection over thousands of hands but inefficient compared to principled instruction.

**Target user:** Self-directed intermediate players who want to play against an AI and get feedback.

**The gap:** PokerSnowie is the closest to testing complete hands (narrative arcs) rather than isolated spots. But it can't articulate the narrative — it just scores the output. Like a writing teacher who says "this essay is a C+" but can't explain what's wrong with it.

---

#### 8. Flopzilla / Equilab

**What they are:** Range and equity calculators. Input a range, input a board, see equity. Flopzilla pioneered visual range analysis. Equilab is a free alternative.

**What they do well:**
- Flopzilla is the gold standard for range visualization. It shows how a range interacts with a board in an immediately intuitive way.
- Enables self-directed range analysis: "If villain's range is X, how much equity does my hand have?"
- The visual range-board interaction IS narrative thinking — you see which parts of a range connect with the board and which don't.
- Powerful for studying specific spots in depth.
- Equilab's Monte Carlo simulation teaches equity concepts.

**What they miss (narrative lens):**
- Pure sandboxes with no guidance. The user must already know what question to ask.
- No action sequences. You analyze a static snapshot (range vs. board), not a dynamic narrative (how the range evolves over streets).
- No opponent modeling — the user manually inputs the range they think the opponent has.
- No teaching component. No "here's what you should learn from this."
- Flopzilla is actually a brilliant narrative tool used as a calculator because nobody built the narrative layer on top.

**Implicit learning theory:** Constructivist — learn by exploring and building your own understanding. Excellent for motivated self-learners, but most players don't know how to use these tools productively.

**Target user:** Dedicated students willing to do manual study. Typically intermediate+ players who already think in ranges.

**The gap:** Flopzilla is the closest existing tool to narrative visualization. It shows ranges interacting with boards. But it's a raw tool — no guided narrative, no progression, no feedback. HoldemVision is essentially "Flopzilla + narrative guidance + opponent modeling + progressive skill development + active practice."

---

### Synthesis: The Competitive Landscape Map

| Product | Teaches What | Teaches Why | Tests Process | Adapts to Opponents | Narrative Score |
|---|---|---|---|---|---|
| GTO Wizard | 5/5 | 1/5 | 0/5 | 0/5 | 1.5/5 |
| PT/HEM | 3/5 (data) | 0/5 | 0/5 | 2/5 (stats) | 1.0/5 |
| Upswing | 4/5 | 3/5 (video) | 0/5 | 1/5 | 2.0/5 |
| RIO | 4/5 | 4/5 (video) | 0/5 | 1/5 | 2.5/5 |
| PokerCoaching | 3/5 | 2/5 | 1/5 (quizzes) | 0/5 | 1.5/5 |
| Primedope/GTOBase | 3/5 | 0/5 | 0/5 | 0/5 | 0.5/5 |
| PokerSnowie | 3/5 | 1/5 | 1/5 (EV) | 0/5 | 1.0/5 |
| Flopzilla/Equilab | 2/5 (raw) | 0/5 | 0/5 | 0/5 | 1.5/5 (latent) |

**Average "Tests Process" score across the entire market: 0.25 out of 5.** This is the gap.

### Is There ANY Product That Teaches the Thinking Process?

**No existing product makes narrative construction the core mechanic.** The closest:

1. **RIO video content** — Galfond explicitly models bidirectional range construction. But it's passive video, not interactive training. You watch narrative thinking but don't practice it.

2. **Flopzilla** — The visual range-board interaction is proto-narrative. It COULD be the basis for narrative training if someone built guided exercises on top. Nobody has.

3. **PokerSnowie's full-hand evaluation** — Evaluates a complete hand arc (closest to narrative coherence testing). But can't explain the reasoning, making it process feedback without process insight.

4. **Peter Clarke's courses on RIO** — The curriculum structure (explicit skill dependencies, progressive difficulty) is the best in the market. But still delivered as video, not interactive practice.

5. **Poker coaching (1-on-1)** — Private coaching IS narrative training. The coach asks "what are you thinking?" and corrects the process, not just the output. This is the gold standard but costs $100-500/hour and doesn't scale.

### The Gap: What HoldemVision Can Own

The entire market splits into two categories:

**Category 1: "Here's the answer" tools** (GTO Wizard, Primedope, PokerSnowie)
Teach correct actions. Don't teach why. Can't distinguish memorization from understanding. Produce players who know spots but can't adapt.

**Category 2: "Here's how I think" content** (Upswing, RIO, PokerCoaching)
Show expert thinking. No practice mechanism. Passive consumption. Transfer is weak without active engagement.

**The missing Category 3: "Now you think"**
Interactive practice that trains the reasoning process. Asks "why?" before "what?" Tests narrative construction, not just action selection. Adapts to how the player thinks, not just what they choose. Provides the process feedback that private coaching provides, at scale.

No product occupies Category 3. This is what HoldemVision should be.

### What We Can Learn From Each Competitor

| Competitor | Steal This | Avoid This |
|---|---|---|
| **GTO Wizard** | Production polish, spot library breadth, adaptive difficulty system, leaderboards | Frequency-only scoring, no "why", no opponent modeling |
| **PT/HEM** | Opponent tendency data structure, population analysis concept | Raw stats without interpretation, information overload |
| **Upswing** | Chart-based on-ramp for beginners, Doug Polk's hand analysis format | Video-only delivery, chart memorization as end goal |
| **RIO** | Galfond's bidirectional range thinking, Peter Clarke's curriculum structure | Elite-only accessibility, no practice tools |
| **PokerCoaching** | Beginner accessibility, quiz format as active engagement | Shallow quizzes, prescriptive over explanatory |
| **PokerSnowie** | Full-hand evaluation (multi-street coherence), EV-based scoring | Black-box AI, outdated engine, no explanations |
| **Flopzilla** | Visual range-board interaction as the UI paradigm | No guidance, no progression, sandbox-only |

### The Positioning Statement

**GTO Wizard teaches you what to do. HoldemVision teaches you how to think.**

GTO Wizard is a frequency trainer. HoldemVision is a thinking trainer. They're complementary, not competitive — a player who understands narrative thinking will get MORE value from GTO Wizard because they'll understand WHY the frequencies are what they are.

But for the majority of players (recreational through intermediate), narrative thinking produces faster, more durable improvement than frequency memorization. The market is entirely underserved here.

---

## Research Summary: Steps 4-6

### Step 4 Key Findings
- The minimum viable narrative is three questions: "What do I have (relative to the board)?", "What is their action telling me?", "Does my action make sense as part of a story?"
- These three questions are applicable immediately, require no framework study, and deepen naturally as skill grows
- The "one thing" that transforms recreational play: every action is a sentence in a story — ask whether yours makes sense before you act

### Step 5 Key Findings
- Narrative skill progression requires measuring reasoning quality, not just action correctness
- Five measurable capabilities: situation recognition, range construction, narrative coherence, opponent adaptation, metacognitive awareness
- Key measurement instruments: reasoning prompts before action, isomorphic consistency tests, range estimation tasks, prediction calibration, explanation quality rubrics
- The distinction between memorization and understanding can be tested via transfer tasks, inverse tasks, teaching prompts, and counterfactual reasoning

### Step 6 Key Findings
- No existing product teaches the thinking process (narrative construction) as its core mechanic
- The market splits into "here's the answer" tools and "here's how I think" content — nobody occupies "now you think"
- Average "tests process" score across all competitors: 0.25 out of 5
- The closest to narrative training is private coaching ($100-500/hr) — HoldemVision can be coaching-quality process feedback at software prices
- GTO Wizard is the feature benchmark for polish; Flopzilla is the conceptual ancestor for range visualization; RIO/Clarke is the curriculum benchmark for structured learning

### Open Questions for Next Phase
- How do we implement reasoning prompts in the existing drill infrastructure? (UI design + LLM evaluation of free-text responses vs. structured multiple-choice)
- What's the MVP feature set for narrative training? (Minimum: reasoning prompts + range estimation drills + isomorphic spot pairs)
- How do we sequence the rollout? (Layer narrative features onto existing drill mode vs. build a separate "narrative mode")
- Should we use an LLM for real-time reasoning evaluation, or can we build heuristic scoring that's good enough?
- How do we handle the cold-start problem for per-skill progression tracking? (Need enough data points per skill to be meaningful)
