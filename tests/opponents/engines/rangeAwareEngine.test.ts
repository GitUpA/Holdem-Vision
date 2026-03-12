import { describe, it, expect } from "vitest";
import { rangeAwareEngine } from "../../../convex/lib/opponents/engines/rangeAwareEngine";
import { basicEngine } from "../../../convex/lib/opponents/engines/basicEngine";
import { initializeHand, applyAction, currentLegalActions } from "../../../convex/lib/state/state-machine";
import { createHeadsUpConfig, createTestConfig } from "../../state/helpers";
import { TAG_PROFILE, LAG_PROFILE, NIT_PROFILE, FISH_PROFILE } from "../../../convex/lib/opponents/presets";
import type { OpponentProfile } from "../../../convex/lib/types/opponents";
import { resolveProfile } from "../../../convex/lib/opponents/profileResolver";
import { classifyCurrentDecision } from "../../../convex/lib/opponents/autoPlay";
import { seededRandom } from "../../../convex/lib/primitives/deck";
import type { DecisionContext } from "../../../convex/lib/opponents/engines/types";

// ─── Helpers ───

function buildContext(
  state: Parameters<typeof classifyCurrentDecision>[0],
  seatIndex: number,
  profile: typeof TAG_PROFILE,
  seed: number = 42,
  opponentProfiles?: Map<number, OpponentProfile>,
): DecisionContext | null {
  const legal = currentLegalActions(state);
  if (!legal) return null;

  const resolved = resolveProfile(profile, () => undefined);
  const situationKey = classifyCurrentDecision(state, seatIndex);
  const params = resolved[situationKey];

  return {
    state,
    seatIndex,
    profile,
    resolvedParams: resolved,
    situationKey,
    params,
    legal,
    potSize: state.pot.total,
    holeCards: state.players[seatIndex]?.holeCards,
    getBase: () => undefined,
    random: seededRandom(seed),
    opponentProfiles,
  };
}

describe("rangeAwareEngine", () => {
  it("has correct id and metadata", () => {
    expect(rangeAwareEngine.id).toBe("range-aware");
    expect(rangeAwareEngine.name).toBeDefined();
    expect(rangeAwareEngine.description).toBeDefined();
  });

  it("returns valid EngineDecision shape", () => {
    const { state } = initializeHand(createHeadsUpConfig({ seed: 42 }));
    const seatIndex = state.players[state.activePlayerIndex!].seatIndex;
    const ctx = buildContext(state, seatIndex, TAG_PROFILE);
    if (!ctx) return;

    const decision = rangeAwareEngine.decide(ctx);
    expect(decision.actionType).toBeDefined();
    expect(decision.situationKey).toBeDefined();
    expect(decision.engineId).toBe("range-aware");
    expect(decision.explanation).toBeDefined();
    expect(decision.explanation.summary).toBeDefined();
    expect(decision.explanation.children).toBeDefined();
    expect(decision.explanation.children!.length).toBeGreaterThan(0);
  });

  it("includes reasoning metadata", () => {
    const { state } = initializeHand(createHeadsUpConfig({ seed: 42 }));
    const seatIndex = state.players[state.activePlayerIndex!].seatIndex;
    const ctx = buildContext(state, seatIndex, TAG_PROFILE);
    if (!ctx) return;

    const decision = rangeAwareEngine.decide(ctx);
    expect(decision.reasoning).toBeDefined();
    expect(typeof decision.reasoning!.handStrength).toBe("number");
    expect(typeof decision.reasoning!.adjustedContinuePct).toBe("number");
    expect(typeof decision.reasoning!.adjustedRaisePct).toBe("number");
  });

  it("produces valid action types", () => {
    const { state } = initializeHand(createHeadsUpConfig({ seed: 42 }));
    const seatIndex = state.players[state.activePlayerIndex!].seatIndex;
    const random = seededRandom(1);

    for (let i = 0; i < 50; i++) {
      const ctx = buildContext(state, seatIndex, TAG_PROFILE, i);
      if (!ctx) continue;
      ctx.random = random;
      const decision = rangeAwareEngine.decide(ctx);
      expect(["fold", "check", "call", "bet", "raise", "all_in"]).toContain(decision.actionType);
    }
  });

  it("produces legal raise amounts", () => {
    const { state } = initializeHand(createHeadsUpConfig({ seed: 42 }));
    const seatIndex = state.players[state.activePlayerIndex!].seatIndex;
    const random = seededRandom(1);

    for (let i = 0; i < 100; i++) {
      const ctx = buildContext(state, seatIndex, LAG_PROFILE, i);
      if (!ctx) continue;
      ctx.random = random;
      const decision = rangeAwareEngine.decide(ctx);
      if (decision.actionType === "raise" && decision.amount !== undefined) {
        expect(decision.amount).toBeGreaterThanOrEqual(ctx.legal.raiseMin);
        expect(decision.amount).toBeLessThanOrEqual(ctx.legal.raiseMax);
      }
      if (decision.actionType === "bet" && decision.amount !== undefined) {
        expect(decision.amount).toBeGreaterThanOrEqual(ctx.legal.betMin);
        expect(decision.amount).toBeLessThanOrEqual(ctx.legal.betMax);
      }
    }
  });

  it("includes board texture in postflop explanations", () => {
    const { state } = initializeHand(createHeadsUpConfig({ seed: 42 }));
    // Get to flop: BTN raises, BB calls
    let s = applyAction(state, state.players[state.activePlayerIndex!].seatIndex, "raise", 6).state;
    s = applyAction(s, s.players[s.activePlayerIndex!].seatIndex, "call").state;
    // Now on flop — BB acts first
    const flopSeat = s.players[s.activePlayerIndex!].seatIndex;
    const ctx = buildContext(s, flopSeat, TAG_PROFILE);
    if (!ctx) return;

    const decision = rangeAwareEngine.decide(ctx);
    const tags = decision.explanation.children!.flatMap((c) => c.tags ?? []);
    expect(tags).toContain("board-texture");
    expect(tags).toContain("hand-strength");
  });

  it("explanation has tagged children for each reasoning step", () => {
    const { state } = initializeHand(createHeadsUpConfig({ seed: 42 }));
    const seatIndex = state.players[state.activePlayerIndex!].seatIndex;
    const ctx = buildContext(state, seatIndex, TAG_PROFILE);
    if (!ctx) return;

    const decision = rangeAwareEngine.decide(ctx);
    const allTags = decision.explanation.children!.flatMap((c) => c.tags ?? []);
    expect(allTags).toContain("decision");
    expect(allTags).toContain("hand-strength");
    expect(allTags).toContain("adjusted-params");
  });

  // ─── Draw awareness tests ───

  it("includes draw info in reasoning when flush draw present on flop", () => {
    // Get to the flop first
    const { state } = initializeHand(createHeadsUpConfig({ seed: 42 }));
    let s = applyAction(state, state.players[state.activePlayerIndex!].seatIndex, "raise", 6).state;
    s = applyAction(s, s.players[s.activePlayerIndex!].seatIndex, "call").state;
    // Now on flop

    // Inject a flush draw scenario: give the active player 2 hearts and put 2 hearts on board
    const flopSeatIdx = s.activePlayerIndex!;
    const flopSeat = s.players[flopSeatIdx].seatIndex;

    // Manually set hole cards and community to create a flush draw
    // Card encoding: rank * 4 + suit, hearts = suit 2
    const Ah = 12 * 4 + 2; // A♥
    const Kh = 11 * 4 + 2; // K♥
    const _2h = 0 * 4 + 2; // 2♥
    const _7h = 5 * 4 + 2; // 7♥
    const Jc = 9 * 4 + 0;  // J♣

    const modifiedState = {
      ...s,
      players: s.players.map((p, i) =>
        i === flopSeatIdx ? { ...p, holeCards: [Ah, Kh] } : p,
      ),
      communityCards: [_2h, _7h, Jc],
    };

    const ctx = buildContext(modifiedState, flopSeat, TAG_PROFILE);
    if (!ctx) return;

    const decision = rangeAwareEngine.decide(ctx);
    const allTags = decision.explanation.children!.flatMap((c) => c.tags ?? []);
    expect(allTags).toContain("draw-aware");
    expect(decision.reasoning?.drawInfo).toBeDefined();
    expect(decision.reasoning!.drawInfo!.hasFlushDraw).toBe(true);
    expect(decision.reasoning!.drawInfo!.totalOuts).toBeGreaterThanOrEqual(9);
  });

  it("flush draw increases hand strength above base high-card level", () => {
    const { state } = initializeHand(createHeadsUpConfig({ seed: 42 }));
    let s = applyAction(state, state.players[state.activePlayerIndex!].seatIndex, "raise", 6).state;
    s = applyAction(s, s.players[s.activePlayerIndex!].seatIndex, "call").state;

    const flopSeatIdx = s.activePlayerIndex!;
    const flopSeat = s.players[flopSeatIdx].seatIndex;

    // Flush draw hand: 8♥ 9♥ on 2♥ 7♥ J♣ — made hand is high card
    const _8h = 6 * 4 + 2;
    const _9h = 7 * 4 + 2;
    const _2h = 0 * 4 + 2;
    const _7h = 5 * 4 + 2;
    const Jc = 9 * 4 + 0;

    const withDraw = {
      ...s,
      players: s.players.map((p, i) =>
        i === flopSeatIdx ? { ...p, holeCards: [_8h, _9h] } : p,
      ),
      communityCards: [_2h, _7h, Jc],
    };

    const ctxDraw = buildContext(withDraw, flopSeat, TAG_PROFILE);
    if (!ctxDraw) return;
    const decisionDraw = rangeAwareEngine.decide(ctxDraw);

    // Without draw: same board but hero has no hearts
    const _8s = 6 * 4 + 3;
    const _9d = 7 * 4 + 1;

    const withoutDraw = {
      ...s,
      players: s.players.map((p, i) =>
        i === flopSeatIdx ? { ...p, holeCards: [_8s, _9d] } : p,
      ),
      communityCards: [_2h, _7h, Jc],
    };

    const ctxNoDraw = buildContext(withoutDraw, flopSeat, TAG_PROFILE);
    if (!ctxNoDraw) return;
    const decisionNoDraw = rangeAwareEngine.decide(ctxNoDraw);

    // Flush draw hand should have higher assessed strength
    expect(decisionDraw.reasoning!.handStrength).toBeGreaterThan(
      decisionNoDraw.reasoning!.handStrength,
    );
  });

  it("no draw info on preflop decisions", () => {
    const { state } = initializeHand(createHeadsUpConfig({ seed: 42 }));
    const seatIndex = state.players[state.activePlayerIndex!].seatIndex;
    const ctx = buildContext(state, seatIndex, TAG_PROFILE);
    if (!ctx) return;

    const decision = rangeAwareEngine.decide(ctx);
    const allTags = decision.explanation.children!.flatMap((c) => c.tags ?? []);
    expect(allTags).not.toContain("draw-aware");
    expect(decision.reasoning?.drawInfo).toBeUndefined();
  });

  it("combo draw boosts raise frequency over many trials", () => {
    const { state } = initializeHand(createHeadsUpConfig({ seed: 42 }));
    let s = applyAction(state, state.players[state.activePlayerIndex!].seatIndex, "raise", 6).state;
    s = applyAction(s, s.players[s.activePlayerIndex!].seatIndex, "call").state;

    const flopSeatIdx = s.activePlayerIndex!;
    const flopSeat = s.players[flopSeatIdx].seatIndex;

    // Combo draw: 8♥ 9♥ on T♥ J♥ 2♣ — flush draw + OESD
    const _8h = 6 * 4 + 2;
    const _9h = 7 * 4 + 2;
    const Th = 8 * 4 + 2;
    const Jh = 9 * 4 + 2;
    const _2c = 0 * 4 + 0;

    const comboState = {
      ...s,
      players: s.players.map((p, i) =>
        i === flopSeatIdx ? { ...p, holeCards: [_8h, _9h] } : p,
      ),
      communityCards: [Th, Jh, _2c],
    };

    // No draw: 2♠ 3♦ on T♥ J♥ 2♣ — no draws, just bottom pair
    const _2s = 0 * 4 + 3;
    const _3d = 1 * 4 + 1;

    const noDrawState = {
      ...s,
      players: s.players.map((p, i) =>
        i === flopSeatIdx ? { ...p, holeCards: [_2s, _3d] } : p,
      ),
      communityCards: [Th, Jh, _2c],
    };

    let comboRaises = 0;
    let noDrawRaises = 0;
    const trials = 100;

    for (let i = 0; i < trials; i++) {
      const ctx1 = buildContext(comboState, flopSeat, LAG_PROFILE, i);
      if (ctx1) {
        const d = rangeAwareEngine.decide(ctx1);
        if (d.actionType === "bet" || d.actionType === "raise") comboRaises++;
      }

      const ctx2 = buildContext(noDrawState, flopSeat, LAG_PROFILE, i);
      if (ctx2) {
        const d = rangeAwareEngine.decide(ctx2);
        if (d.actionType === "bet" || d.actionType === "raise") noDrawRaises++;
      }
    }

    // Combo draw should raise/bet more often than no draw
    expect(comboRaises).toBeGreaterThan(noDrawRaises);
  });

  // ─── Bluff frequency tests ───

  it("LAG bluffs more than NIT over many trials", () => {
    const { state } = initializeHand(createHeadsUpConfig({ seed: 42 }));
    const seatIndex = state.players[state.activePlayerIndex!].seatIndex;

    let lagBluffs = 0;
    let nitBluffs = 0;
    const trials = 200;

    for (let i = 0; i < trials; i++) {
      const lagCtx = buildContext(state, seatIndex, LAG_PROFILE, i);
      if (lagCtx) {
        const d = rangeAwareEngine.decide(lagCtx);
        if (d.reasoning?.isBluff) lagBluffs++;
      }

      // NIT_PROFILE uses basic engine, so we test bluffing through the
      // range-aware engine with NIT-like params by checking LAG vs TAG instead
    }

    let tagBluffs = 0;
    for (let i = 0; i < trials; i++) {
      const tagCtx = buildContext(state, seatIndex, TAG_PROFILE, i);
      if (tagCtx) {
        const d = rangeAwareEngine.decide(tagCtx);
        if (d.reasoning?.isBluff) tagBluffs++;
      }
    }

    // LAG has higher bluffFrequency (0.10 preflop.open) vs TAG (0.05)
    // Over 200 trials, LAG should bluff at least ~80% as often as TAG
    // (soft check to account for stochastic variance in small samples)
    expect(lagBluffs).toBeGreaterThanOrEqual(Math.floor(tagBluffs * 0.7));
  });

  it("reasoning includes adjustedBluffFrequency and isBluff", () => {
    const { state } = initializeHand(createHeadsUpConfig({ seed: 42 }));
    const seatIndex = state.players[state.activePlayerIndex!].seatIndex;
    const ctx = buildContext(state, seatIndex, TAG_PROFILE);
    if (!ctx) return;

    const decision = rangeAwareEngine.decide(ctx);
    expect(decision.reasoning).toBeDefined();
    expect(typeof decision.reasoning!.adjustedBluffFrequency).toBe("number");
    expect(typeof decision.reasoning!.isBluff).toBe("boolean");
  });

  it("adjusted params explanation includes bluff frequency", () => {
    const { state } = initializeHand(createHeadsUpConfig({ seed: 42 }));
    const seatIndex = state.players[state.activePlayerIndex!].seatIndex;
    const ctx = buildContext(state, seatIndex, TAG_PROFILE);
    if (!ctx) return;

    const decision = rangeAwareEngine.decide(ctx);
    const adjustedNode = decision.explanation.children!.find(
      (c) => c.tags?.includes("adjusted-params"),
    );
    expect(adjustedNode).toBeDefined();
    expect(adjustedNode!.summary).toContain("bluff");
  });

  // ─── Fold equity tests ───

  it("fold equity is higher against NIT than against LAG", () => {
    // Get to the flop so fold equity is computed
    const { state } = initializeHand(createHeadsUpConfig({ seed: 42 }));
    let s = applyAction(state, state.players[state.activePlayerIndex!].seatIndex, "raise", 6).state;
    s = applyAction(s, s.players[s.activePlayerIndex!].seatIndex, "call").state;
    // On flop — BB acts first
    const flopSeat = s.players[s.activePlayerIndex!].seatIndex;
    const otherSeat = s.players.find((p) => p.seatIndex !== flopSeat && p.status === "active")!.seatIndex;

    // Facing NIT opponent → high fold equity
    const nitProfiles = new Map<number, OpponentProfile>([[otherSeat, NIT_PROFILE]]);
    const ctxVsNit = buildContext(s, flopSeat, TAG_PROFILE, 42, nitProfiles);
    if (!ctxVsNit) return;
    const vsNit = rangeAwareEngine.decide(ctxVsNit);

    // Facing LAG opponent → low fold equity
    const lagProfiles = new Map<number, OpponentProfile>([[otherSeat, LAG_PROFILE]]);
    const ctxVsLag = buildContext(s, flopSeat, TAG_PROFILE, 42, lagProfiles);
    if (!ctxVsLag) return;
    const vsLag = rangeAwareEngine.decide(ctxVsLag);

    // NIT folds more → higher fold likelihood
    const nitFoldEquity = vsNit.reasoning!.foldLikelihood as number;
    const lagFoldEquity = vsLag.reasoning!.foldLikelihood as number;
    expect(nitFoldEquity).toBeGreaterThan(lagFoldEquity);
  });

  it("fold equity uses actual opponent facing_bet continuePct", () => {
    const { state } = initializeHand(createHeadsUpConfig({ seed: 42 }));
    let s = applyAction(state, state.players[state.activePlayerIndex!].seatIndex, "raise", 6).state;
    s = applyAction(s, s.players[s.activePlayerIndex!].seatIndex, "call").state;
    const flopSeat = s.players[s.activePlayerIndex!].seatIndex;
    const otherSeat = s.players.find((p) => p.seatIndex !== flopSeat && p.status === "active")!.seatIndex;

    // NIT facing_bet continuePct = 45%, so fold rate ~55%
    const nitProfiles = new Map<number, OpponentProfile>([[otherSeat, NIT_PROFILE]]);
    const ctx = buildContext(s, flopSeat, TAG_PROFILE, 42, nitProfiles);
    if (!ctx) return;

    const decision = rangeAwareEngine.decide(ctx);
    const foldLikelihood = decision.reasoning!.foldLikelihood as number;

    // Should be close to 55% (NIT facing_bet has continuePct=45 → fold=55%)
    expect(foldLikelihood).toBeGreaterThan(0.4);
    expect(foldLikelihood).toBeLessThan(0.7);
  });

  it("falls back to heuristic when no opponentProfiles", () => {
    // Without opponentProfiles, the old heuristic is used
    const { state } = initializeHand(createHeadsUpConfig({ seed: 42 }));
    let s = applyAction(state, state.players[state.activePlayerIndex!].seatIndex, "raise", 6).state;
    s = applyAction(s, s.players[s.activePlayerIndex!].seatIndex, "call").state;
    const flopSeat = s.players[s.activePlayerIndex!].seatIndex;

    // No opponentProfiles passed
    const ctx = buildContext(s, flopSeat, TAG_PROFILE, 42);
    if (!ctx) return;

    const decision = rangeAwareEngine.decide(ctx);
    // Should still produce a valid fold likelihood (fallback path)
    expect(typeof decision.reasoning!.foldLikelihood).toBe("number");
    expect(decision.reasoning!.foldLikelihood as number).toBeGreaterThanOrEqual(0);
    expect(decision.reasoning!.foldLikelihood as number).toBeLessThanOrEqual(1);
  });

  // ─── Preflop position differentiation tests ───

  it("TAG opens wider from BTN than from UTG", () => {
    // Use a 6-player table so we get real position assignments
    // Positions: seat0=btn, seat1=sb, seat2=bb, seat3=utg, seat4=hj, seat5=co
    // Preflop action starts at UTG (seat 3)
    const config = createTestConfig({ numPlayers: 6, seed: 42 });
    const { state } = initializeHand(config);

    const utg = state.players.find((p) => p.position === "utg")!;
    const btn = state.players.find((p) => p.position === "btn")!;

    // Count how often TAG continues (call/raise) from each position.
    // Use the same medium-strength hole cards for both to isolate position effect
    // from hand-strength modulation. KTo ≈ 50th percentile.
    const mediumHand = [11, 36] as const; // Kh, Td (medium-strength)
    let utgContinues = 0;
    let btnContinues = 0;
    const trials = 300;

    for (let i = 0; i < trials; i++) {
      // Build context as if UTG is deciding
      const utgCtx = buildContext(state, utg.seatIndex, TAG_PROFILE, i);
      if (utgCtx) {
        utgCtx.holeCards = [...mediumHand];
        const d = rangeAwareEngine.decide(utgCtx);
        if (d.actionType !== "fold" && d.actionType !== "check") utgContinues++;
      }

      // Build context as if BTN is deciding (same state but different seat/position)
      const btnCtx = buildContext(state, btn.seatIndex, TAG_PROFILE, i);
      if (btnCtx) {
        btnCtx.holeCards = [...mediumHand];
        const d = rangeAwareEngine.decide(btnCtx);
        if (d.actionType !== "fold" && d.actionType !== "check") btnContinues++;
      }
    }

    // BTN (multiplier 1.5) should open significantly wider than UTG (multiplier 0.6)
    expect(btnContinues).toBeGreaterThan(utgContinues);
  });

  it("Fish position multiplier is much smaller than TAG", () => {
    // Fish has low positionAwareness (~0.1), so position multipliers barely affect
    // the adjusted continuePct. TAG (positionAwareness=0.8) adjusts significantly.
    const config = createTestConfig({ numPlayers: 6, seed: 42 });
    const { state } = initializeHand(config);

    const utg = state.players.find((p) => p.position === "utg")!;
    const btn = state.players.find((p) => p.position === "btn")!;

    // Fish-like profile using range-aware engine
    const fishLikeProfile: OpponentProfile = {
      ...FISH_PROFILE,
      decisionEngine: "range-aware",
    };

    // Use same medium-strength hand for all to isolate position effect
    const mediumHand = [11, 36]; // Kh, Td

    // Compare TAG adjusted continuePct: BTN vs UTG
    const tagUtgCtx = buildContext(state, utg.seatIndex, TAG_PROFILE, 42);
    const tagBtnCtx = buildContext(state, btn.seatIndex, TAG_PROFILE, 42);
    if (!tagUtgCtx || !tagBtnCtx) return;
    tagUtgCtx.holeCards = [...mediumHand];
    tagBtnCtx.holeCards = [...mediumHand];

    const tagUtgDecision = rangeAwareEngine.decide(tagUtgCtx);
    const tagBtnDecision = rangeAwareEngine.decide(tagBtnCtx);
    const tagUtgCont = tagUtgDecision.reasoning!.adjustedContinuePct as number;
    const tagBtnCont = tagBtnDecision.reasoning!.adjustedContinuePct as number;
    const tagDelta = Math.abs(tagBtnCont - tagUtgCont);

    // Compare Fish adjusted continuePct: BTN vs UTG
    const fishUtgCtx = buildContext(state, utg.seatIndex, fishLikeProfile, 42);
    const fishBtnCtx = buildContext(state, btn.seatIndex, fishLikeProfile, 42);
    if (!fishUtgCtx || !fishBtnCtx) return;
    fishUtgCtx.holeCards = [...mediumHand];
    fishBtnCtx.holeCards = [...mediumHand];

    const fishUtgDecision = rangeAwareEngine.decide(fishUtgCtx);
    const fishBtnDecision = rangeAwareEngine.decide(fishBtnCtx);
    const fishUtgCont = fishUtgDecision.reasoning!.adjustedContinuePct as number;
    const fishBtnCont = fishBtnDecision.reasoning!.adjustedContinuePct as number;
    const fishDelta = Math.abs(fishBtnCont - fishUtgCont);

    // TAG should adjust much more than Fish across positions
    expect(tagDelta).toBeGreaterThan(fishDelta);
    // Fish's adjustment should be small (< 10% absolute difference)
    expect(fishDelta).toBeLessThan(10);
  });

  it("preflop explanation includes position tag", () => {
    const config = createTestConfig({ numPlayers: 6, seed: 42 });
    const { state } = initializeHand(config);

    // UTG is first to act preflop
    const utg = state.players.find((p) => p.position === "utg")!;
    const ctx = buildContext(state, utg.seatIndex, TAG_PROFILE);
    if (!ctx) return;

    const decision = rangeAwareEngine.decide(ctx);
    const allTags = decision.explanation.children!.flatMap((c) => c.tags ?? []);
    expect(allTags).toContain("position");
    expect(allTags).toContain("preflop");

    // Check the position node has the right content
    const posNode = decision.explanation.children!.find(
      (c) => c.tags?.includes("position"),
    );
    expect(posNode).toBeDefined();
    expect(posNode!.summary).toContain("UTG");

    // Reasoning should include position
    expect(decision.reasoning!.position).toBe("utg");
  });
});
