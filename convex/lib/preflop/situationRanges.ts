/**
 * Situation Range Resolver — resolves symbolic RangeSource tags to actual Set<string> ranges.
 *
 * Reads registry entries' opponentRangeSource / heroRangeSource and dispatches to
 * the appropriate range table in preflopRanges.ts. Stack compression and sizing
 * adjustment apply consistently.
 *
 * Pure TypeScript, zero Convex/React imports.
 */

import type { PreflopSituationContext, RangeSource } from "./situationRegistry";
import { PREFLOP_SITUATIONS } from "./situationRegistry";
import { normalize6Max, compressRangeByStack } from "./rangeUtils";
import {
  GTO_RFI_RANGES,
  GTO_3BET_RANGES,
  GTO_COLD_CALL_RANGES,
  GTO_3BET_MIXED,
  GTO_BB_DEFENSE,
  GTO_BVB,
  GTO_4BET,
  GTO_ISO_RAISE_RANGES,
  GTO_BB_RAISE_VS_LIMPERS,
  GTO_SB_COMPLETE_RANGE,
  GTO_BB_RAISE_VS_SB_COMPLETE,
} from "../gto/tables/preflopRanges";
import { HAND_STRENGTH_ORDER } from "../gto/preflopClassification";

// ═══════════════════════════════════════════════════════
// RANGE RESOLUTION
// ═══════════════════════════════════════════════════════

function resolveRange(
  source: RangeSource,
  ctx: PreflopSituationContext,
): Set<string> | null {
  switch (source.type) {
    case "none":
      return null;

    case "rfi_by_position": {
      const pos = ctx.openerPosition ?? ctx.heroPosition;
      return GTO_RFI_RANGES[normalize6Max(pos)] ?? null;
    }

    case "bb_defense_by_opener": {
      if (!ctx.openerPosition) return null;
      const opener = normalize6Max(ctx.openerPosition);
      if (opener === "sb") {
        // BvB defense
        const bvb3bet = (GTO_BVB as Record<string, Set<string>>)["bb_3bet_vs_sb"];
        const bvbCall = (GTO_BVB as Record<string, Set<string>>)["bb_call_vs_sb"];
        const combined = new Set<string>();
        if (bvb3bet) for (const h of bvb3bet) combined.add(h);
        if (bvbCall) for (const h of bvbCall) combined.add(h);
        return combined;
      }
      const key = opener === "co" ? "vs_co"
        : opener === "btn" ? "vs_btn"
        : opener === "hj" ? "vs_hj"
        : "vs_utg";
      const defense = GTO_BB_DEFENSE[key];
      if (!defense) return null;
      const combined = new Set<string>();
      for (const h of defense.threebet) combined.add(h);
      for (const h of defense.call) combined.add(h);
      return combined;
    }

    case "cold_call_plus_3bet": {
      const normPos = normalize6Max(ctx.heroPosition);
      if (ctx.heroPosition === "bb" && ctx.openerPosition) {
        // BB uses defense ranges, not cold-call
        const opener = normalize6Max(ctx.openerPosition);
        if (opener === "sb") {
          const bvb3bet = (GTO_BVB as Record<string, Set<string>>)["bb_3bet_vs_sb"];
          const bvbCall = (GTO_BVB as Record<string, Set<string>>)["bb_call_vs_sb"];
          const combined = new Set<string>();
          if (bvb3bet) for (const h of bvb3bet) combined.add(h);
          if (bvbCall) for (const h of bvbCall) combined.add(h);
          return combined;
        }
        const key = opener === "co" ? "vs_co"
          : opener === "btn" ? "vs_btn"
          : opener === "hj" ? "vs_hj"
          : "vs_utg";
        const defense = GTO_BB_DEFENSE[key];
        if (!defense) return null;
        const combined = new Set<string>();
        for (const h of defense.threebet) combined.add(h);
        for (const h of defense.call) combined.add(h);
        return combined;
      }
      const combined = new Set<string>();
      const coldCall = GTO_COLD_CALL_RANGES[normPos];
      const threeBet = GTO_3BET_RANGES[normPos];
      const mixed = GTO_3BET_MIXED[normPos];
      if (coldCall) for (const h of coldCall) combined.add(h);
      if (threeBet) for (const h of threeBet) combined.add(h);
      if (mixed) for (const h of mixed) combined.add(h);
      return combined;
    }

    case "bvb_defense": {
      const combined = new Set<string>();
      if (ctx.heroPosition === "bb") {
        const bvb3bet = (GTO_BVB as Record<string, Set<string>>)["bb_3bet_vs_sb"];
        const bvbCall = (GTO_BVB as Record<string, Set<string>>)["bb_call_vs_sb"];
        if (bvb3bet) for (const h of bvb3bet) combined.add(h);
        if (bvbCall) for (const h of bvbCall) combined.add(h);
      } else {
        const rfi = GTO_RFI_RANGES["sb"];
        if (rfi) for (const h of rfi) combined.add(h);
      }
      return combined;
    }

    case "four_bet":
      return GTO_4BET.value ? new Set([...GTO_4BET.value, ...GTO_4BET.bluffs]) : null;

    case "four_bet_call_plus_value": {
      const combined = new Set<string>();
      if (GTO_4BET.value) for (const h of GTO_4BET.value) combined.add(h);
      if (GTO_4BET.call) for (const h of GTO_4BET.call) combined.add(h);
      return combined;
    }

    case "limper_by_profile":
      // What the limper is likely holding — wide capped range
      // For now, use a generic fish-like limp range (~35% of hands)
      // Future: derive from opponent profile
      return new Set([
        "22", "33", "44", "55", "66", "77", "88", "99",
        "A2s", "A3s", "A4s", "A5s", "A6s", "A7s", "A8s", "A9s", "ATs",
        "K2s", "K3s", "K4s", "K5s", "K6s", "K7s", "K8s", "K9s", "KTs",
        "Q2s", "Q3s", "Q4s", "Q5s", "Q6s", "Q7s", "Q8s", "Q9s", "QTs",
        "J7s", "J8s", "J9s", "JTs",
        "T8s", "T9s",
        "54s", "65s", "76s", "87s", "98s",
        "53s", "64s", "75s", "86s", "97s",
        "ATo", "AJo",
        "KTo", "KJo", "KQo",
        "QTo", "QJo",
        "JTo",
      ]);

    case "iso_raise_by_position": {
      const pos = normalize6Max(ctx.heroPosition);
      return GTO_ISO_RAISE_RANGES[pos] ?? GTO_ISO_RAISE_RANGES["co"] ?? null;
    }

    case "bb_raise_vs_limpers": {
      const key = ctx.numLimpers >= 3 ? "3+" : String(Math.max(1, ctx.numLimpers));
      return GTO_BB_RAISE_VS_LIMPERS[key] ?? GTO_BB_RAISE_VS_LIMPERS["1"] ?? null;
    }

    case "sb_complete_range":
      return GTO_SB_COMPLETE_RANGE;

    case "bb_raise_vs_sb_complete":
      return GTO_BB_RAISE_VS_SB_COMPLETE;
  }
}

// ═══════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════

/** Resolve the opponent's range for a classified situation. */
export function resolveOpponentRange(
  ctx: PreflopSituationContext,
  stackDepthBB: number = 100,
  openerSizingBB: number = 0,
): Set<string> | null {
  const entry = PREFLOP_SITUATIONS[ctx.id];
  const range = resolveRange(entry.opponentRangeSource, ctx);
  if (!range) return null;

  // Stack compression
  let compressed = compressRangeByStack(range, stackDepthBB);

  // Sizing adjustment: larger opens imply tighter ranges
  if (openerSizingBB > 4 && compressed.size > 3) {
    const excessSizing = openerSizingBB - 4;
    const dropPct = Math.min(0.4, excessSizing * 0.08);
    const ranked = [...compressed].sort((a, b) => {
      const idxA = HAND_STRENGTH_ORDER.indexOf(a);
      const idxB = HAND_STRENGTH_ORDER.indexOf(b);
      return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
    });
    const keepCount = Math.max(3, Math.ceil(ranked.length * (1 - dropPct)));
    compressed = new Set(ranked.slice(0, keepCount));
  }

  return compressed;
}

/** Resolve hero's continue range for a classified situation. */
export function resolveHeroRange(
  ctx: PreflopSituationContext,
  stackDepthBB: number = 100,
): Set<string> {
  const entry = PREFLOP_SITUATIONS[ctx.id];
  const range = resolveRange(entry.heroRangeSource, ctx);
  if (!range || range.size === 0) return new Set();

  // Multiway adjustment: each additional caller tightens the continue range
  const numCallers = ctx.numCallers;
  const effectiveStack = stackDepthBB - (numCallers * 15);
  return compressRangeByStack(range, effectiveStack);
}
