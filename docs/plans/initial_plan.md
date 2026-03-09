HoldemVision – Master Build Plan

Project Goal

Build a full-featured Texas Hold’em poker simulation \& learning platform in Next.js + TypeScript.

Core features:



Deck Vision (52-card grid with dead cards + live threat highlighting)

Manual Analysis + Random Deal training modes

Range Placer (action → implied range visualization)

Configurable multi-player tables (2–9 players)

Pluggable opponent profiles (presets + fully custom)

All AI decisions opaque to the hero (user)



Non-goals (Phase 1)



Real-money play, networking, multi-user tables, full GTO solver (CFR)



Technology Stack



Next.js 15 (App Router) + TypeScript (strict)

Tailwind + shadcn/ui + Framer Motion

Zustand or Jotai for global state

Shared /lib folder for all domain logic (pure TS, no React)

Testing: Vitest + React Testing Library

Visualization: SVG cards or lucide/react-playing-cards



High-Level Architecture (Visualize as bottom-up stack or Clean Architecture onion)

textLayer 7: UI / Application (Next.js pages \& components)

Layer 6: Visualization \& Analysis Engine

Layer 5: AI Decision Engine (ProfileDrivenEngine)

Layer 4: Simulation / Hand Runner

Layer 3: Game State \& Table Config

Layer 2: PlayerProfile \& Presets

Layer 1: Game Rules \& Structure

Layer 0: Primitives \& Utilities

Build Order Rule

Never implement a layer until all layers below it are complete and tested.

Each phase must produce working, testable code.

Phase-by-Phase Build Plan

Phase 0: Project Setup \& Tooling (1–2 hours)



Create Next.js 15 app with TypeScript, Tailwind, shadcn/ui

Set up folder structure: /lib (domain), /components, /app, /types

Configure Vitest + absolute imports

Add basic card SVG or image assets

Deliverable: Empty app that renders a placeholder 52-card grid

Acceptance: npm run dev works, tests pass



Phase 1: Layer 0 – Primitives (2–4 hours)



Card, Rank, Suit, Deck classes

Utility functions: shuffle, deal, isValidHand, compareHands stub

Tests: 100% coverage on deck operations

Deliverable: Reusable card primitives

Acceptance: Can create, shuffle, and deal a deck in console tests



Phase 2: Layer 1 – Game Rules (3–5 hours)



GameRules, GameVariant, StakeStructure, Street enums

Blinds/ante/ICM rules for cash vs tournament

Action types + legal move validation

Deliverable: Immutable GameRules object factory

Acceptance: Can create NLHE cash game and tournament rules and validate actions



Phase 3: Layer 2 – PlayerProfile System (4–6 hours)



PlayerProfile interface (all tunable parameters)

Preset library (Nit, Fish, TAG, LAG, PureGTO, etc.) as JSON constants

Profile loader + editor helpers (load preset → modify → save custom)

Deliverable: Fully configurable profile system

Acceptance: Can load “Nit”, tweak aggression to 1.2, save as “NitAggro”



Phase 4: Layer 3 – Game State \& Table (5–8 hours)



GameState (public + private versions)

TableConfig, Seat, Player

Action history log

Deliverable: Complete immutable game state machine

Acceptance: Can create a 9-player table with mixed profiles and advance streets



Phase 5: Layer 4 – Simulation Engine (6–10 hours)



HandSimulator / TableRunner class

Step-by-step hand execution (deal → street → ask for action)

Console runner for testing

Deliverable: Can run a full hand from deal to showdown with stub AI

Acceptance: 100 simulated hands complete without errors



Phase 6: Layer 5 – AI Decision Engine (8–12 hours)



ProfileDrivenEngine (single class)

Decision logic based on profile numbers + game state

Position, street, stack, bet sizing awareness

Deliverable: AI that plays differently for each preset/custom profile

Acceptance: Nit folds 90%+ preflop, Fish calls too wide, GTO is balanced



Phase 7: Layer 6 – Visualization \& Analysis (10–15 hours)



Deck Vision 52-card grid (dead + threat highlighting)

Equity calculator (Monte Carlo)

Range Placer (13×13 grid + filtering)

Threat analysis filtered by observed actions + ranges

Deliverable: All visuals update live from game state

Acceptance: Full Deck Vision + Range Placer working in both manual and random modes



Phase 8: Layer 7 – UI \& Final Use Cases (10–14 hours)



Manual Analysis mode

Random Deal mode (step-by-step reveal)

Table setup screen (add opponents + profiles)

Learning flows, save/load, history

Polish: animations, tooltips, mobile support

Deliverable: Complete working application

Acceptance: All original use cases work end-to-end



Phase 9: Testing, Polish \& Documentation (4–6 hours)



End-to-end tests for both modes

README + architecture diagram

Performance (50k+ Monte Carlo trials < 500ms)

Deploy to Vercel



Total Estimated Effort

~60–90 hours (2–4 weeks part-time for one developer)

Milestones



After Phase 5: Console can simulate full hands with different profiles

After Phase 7: Visual Deck Vision + Range Placer working

After Phase 8: Production-ready web app



Extensibility Notes



New variants (Omaha, Short-Deck) → only change Layer 1

New AI styles → just new preset JSON

Full GTO solver → swap in new engine in Layer 5

Multi-user → add WebSocket layer on top

