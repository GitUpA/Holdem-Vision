# HoldemVision — Product Vision

HoldemVision is NOT a GTO trainer. It is a visual + narrative learning platform that
helps poker players build the mental models that take years to develop through experience alone.

## Three Pillars

### Pillar 1: Visual — See What Others Memorize

The player learns fast because they *see* what takes most players thousands of hands to
build a mental map around. The 13×13 grid, range overlays, equity heatmaps, facing
classifications — making the invisible visible.

**What this replaces:** Chart memorization. A student studying traditional preflop charts
memorizes ~1,000 individual hand decisions across positions. With HoldemVision, they memorize
~6 visual shapes (UTG tight cluster, BTN wide wash, BB defense band) and derive the
individual decisions from the shape. The grid becomes a spatial memory palace.

**How it's implemented:** The 5-layer visual grid (`visual-first-principles.md`):
1. **Grid** (13×13) — the hand universe
2. **Equity** (heatmap) — relative hand strength, position-aware
3. **Ranges** (overlays) — who plays what from where
4. **Equity vs Range** (MC) — how strong you are against THEM
5. **Facing** (V/M/B/F) — what to do, compressed to one letter

Each layer adds one concept. Any layer can be toggled off. The student controls complexity.

### Pillar 2: Narrative — Think in Stories, Not Numbers

Like real poker players, the system is narrative-based. The visual map + how a narrative
ties to that map develops the player's intuition. This is how pros actually think — not
in percentages, in stories.

**What this replaces:** Frequency memorization. A solver says "open 76s 43% from UTG."
No human implements that at a table. Instead, pros think: "76s is near the edge of my UTG
range. Against tight blinds I'll open it for board coverage. Against an aggressive 3-bettor
behind me, I'll fold — it doesn't play well in 3-bet pots." That's a narrative, not a number.

**How it's implemented:** The coaching pipeline:
- **Situation registry** (`convex/lib/preflop/situationRegistry.ts`) — classifies every
  preflop spot into one of 10 situations, each with coaching metadata
- **Hand-specific insights** (`preflopClassification.ts` → `handInsight()`) — "suited aces
  have nut flush potential," "medium pairs are set-mining hands," "broadways risk domination"
- **Boundary distance** — continuous measure of how far inside/outside a range a hand is,
  translated to natural language: "usually open," "depends on reads," "clear fold"
- **V/M/B/F compression** — the entire decision collapses to one letter. The narrative
  explains WHY that letter. Over time, the letter becomes the student's inner voice.

### Pillar 3: Discovery — The Range Edge Is the Lesson

Pillars 1 and 2 are strong tools. Analyzing those tools revealed something: **the most
educational part of any range is its boundary — the hands that are just in vs just out.**

A student who understands the range edge understands range construction. They know WHY
UTG opens 15% and BTN opens 44% — not because they memorized it, but because they've
seen which hands fall off as the range tightens and which hands enter as it widens. They
understand that 76s enters the BTN range because of board coverage on low flops, while
A7o enters because of top-pair potential. The range edge teaches the principles that
generate the ranges.

**What this enables that no other tool does:**
- **Interactive boundary** — drag a slider to widen/narrow a range, watch V/M/B/F letters
  update live. The student doesn't memorize where 76s sits — they discover it by finding
  the boundary and seeing what's on each side.
- **Visual gradient** — cell opacity/saturation reflects proximity to the range edge.
  Core range hands are solid. Edge hands are faded. The student sees the gradient and
  intuitively grasps: "the faded hands are where reads matter."
- **Confidence labels** — "always" / "usually" / "depends on reads" / "rarely" derived
  from boundary distance. This is the language pros use. Not "43% raise" but "usually open,
  fold against aggressive opponents."

**The discovery:** The range edge is where poker learning happens. Every training tool
shows you the range. HoldemVision shows you the boundary — and lets you move it.

## Design Principles

### Handle Reality, Not Just Theory

Don't throw out non-GTO scenarios. Handle limping, wide calls, fish behavior — the system
models what actually happens at tables, not just what's theoretically optimal. The grid
is honest about every situation, not just the ones GTO approves of. 10 preflop situations
including facing limpers, BB vs limpers, SB complete — spots that GTO Wizard skips but
that happen every session at real tables.

### Internal Precision, External Simplicity

Internal computation should use the most accurate data available. Student-facing display
should use the most learnable representation. These are not contradictory:

- Compute equity against frequency-weighted ranges → show V/M/B/F letters
- Derive boundary distance from actual frequencies → show "usually" / "depends on reads"
- Weight opponent combos by frequency → show a better equity percentage

The student never sees "43% raise" — they see a gradient, a confidence label, a letter.
But the letter is mathematically grounded.

### Progressive Disclosure

Beginners need categories ("always / sometimes / never"). Intermediates need context
("open vs tight blinds, fold vs aggressive 3-bettors"). Advanced players need data
(raw frequencies, interactive boundary manipulation). The system should meet the student
where they are and grow with them.

## Architecture References

- **Visual grid layers:** `docs/visual-first-principles.md`
- **Mathematical fidelity:** `docs/visual-math-fidelity.md`
- **Preflop situations:** `docs/preflop-situations.md`
- **Engine architecture:** `docs/first-principles.md`
- **Improvement roadmap:** `docs/plans/preflop-improvements-roadmap.md`
