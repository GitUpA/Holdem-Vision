# WASM Solver — Context & Research Summary

## Problem

HoldemVision's coaching recommendations use a layered fallback system:
1. Solver lookup (193 pre-computed boards from TexasSolver batch runs)
2. PokerBench hand-class aggregated data (60k preflop, 500k postflop)
3. Heuristic frequencies (when no data exists)

This works well for common spots but breaks down on uncommon boards, sparse archetypes, and edge cases. Users have no way to verify whether a coaching recommendation is accurate for their specific spot.

A browser-based WASM solver would let users compute exact GTO solutions on-the-fly for any spot, eliminating the need for heuristic fallbacks and giving users a "ground truth" button.

## Research (March 2026)

### Chosen candidate: wasm-postflop / postflop-solver

- **Repo**: https://github.com/b-inary/wasm-postflop (UI), https://github.com/b-inary/postflop-solver (engine)
- **Language**: Rust → WASM via wasm-pack
- **Algorithm**: Discounted CFR (DCFR) — same class as TexasSolver
- **License**: AGPL-3.0 (modifications to solver must be open-sourced; our app code is unaffected)
- **Status**: Development suspended Oct 2023 (author went commercial). Code is stable and complete.
- **WASM build**: Proven pipeline — `rustup nightly` + `wasm-pack` + web workers for multithreading
- **Performance** (Ryzen 7 3700X, browser):
  - Flop: 72-93 seconds (0.1% exploitability target)
  - Turn: estimated 5-15 seconds
  - River: estimated 1-5 seconds
- **Memory**: 660 MB (16-bit mode), 1.25 GB (32-bit mode) for flop solves. Turn/river much less.
- **Features**: 32/64-bit precision, multithreading via SharedArrayBuffer, isomorphic card handling, bunching effect support, zstd compression, custom memory allocator
- **Live demo**: https://wasm-postflop.pages.dev/

### Why wasm-postflop over alternatives

| Project | Language | License | WASM Ready | Notes |
|---|---|---|---|---|
| **wasm-postflop** | Rust | AGPL-3.0 | Yes, proven | Best option — browser-tested, multithreaded |
| RoboPoker | Rust | MIT | Needs work | Active (v1.0.0 Feb 2026), MCCFR+subgame solving (Pluribus-style). PostgreSQL dependency needs removal for WASM. More sophisticated algorithm but overkill for spot-solving. Backup if AGPL is dealbreaker. |
| OpenSolver | Rust | Unspecified | Needs work | Simplest Rust solver, easiest WASM target, but low quality/activity |
| TexasSolver | C++ | AGPL-3.0 | Difficult | Already used for batch solves. CUDA dependency makes WASM hard. Console-only version possible via Emscripten but untested. |
| noambrown/poker_solver | C++/Python | MIT | Partial | By Libratus/Pluribus researcher. River-only. Academic reference. |
| rs-poker | Rust | Apache-2.0 | Possible | Toolkit with CFR agent, not a full postflop solver |
| hucancode/poker-solver | Rust | MIT | Yes | Equity calculator only, not GTO solver |

### Algorithm context

- **DCFR** (wasm-postflop): Iterates full game tree, discounts old regrets. Best for solving specific spots with known board/ranges. Proven, well-understood.
- **MCCFR** (RoboPoker): Samples random paths instead of full tree. Each iteration faster but noisier. Scales to bigger games. Better for full-game AI opponents, overkill for spot-solving.
- **Subgame solving** (RoboPoker): Solves portions in real-time from a coarse blueprint. How Pluribus works. Not needed for our use case.
- **CFR+**: Floors regret at zero, faster convergence. Some commercial solvers use this.

DCFR is the right algorithm for "solve this specific postflop spot" — which is our use case.

## Integration concept

### UX
- Coaching panel shows current recommendation (solver lookup / hand-class / equity fallback)
- "Solve this spot" button below the GTO solution
- Clicking it: WASM solver runs in a web worker, progress bar shows convergence %
- When done: exact solver frequencies replace the approximate ones
- Solved results cached in IndexedDB for instant recall on revisit

### Architecture
- Fork postflop-solver, build WASM with wasm-pack
- Thin TypeScript wrapper: accepts our game state format → configures PostFlopGame → runs solver → returns ActionFrequencies
- Web worker isolates solver from UI thread
- Results feed back into the same coaching display (same FrequencyTable shape)
- Cache layer: board+ranges+positions → solved frequencies (IndexedDB)

### Scope by street
- **River/Turn first** (quick win): solves in 1-15 seconds, <100 MB memory. Very practical.
- **Flop second**: 60-90 seconds, 660 MB RAM. Needs "this will take a minute" UX + 16-bit precision mode.
- **Preflop**: Not supported by postflop solvers. Stays pre-computed from PokerBench data.

### Open questions for planning phase
- AGPL-3.0: acceptable for our use case? (Learning tool, not reselling solver access)
- Bundle size: how large is the compiled WASM? Impact on initial page load?
- SharedArrayBuffer: requires cross-origin isolation headers (COOP/COEP). Any conflicts with Clerk auth?
- Memory limits: 660 MB for flop in a browser tab — test on target devices
- Caching strategy: how many solved spots to keep in IndexedDB before evicting?
- Could solved results feed BACK into our frequency tables, growing the pre-computed data over time?
