/**
 * Hand Categorizer — classifies hero's hand relative to the board.
 *
 * Maps any hole cards + community cards into a HandCategory that the
 * frequency tables use as lookup keys. Categories cover the full spectrum
 * from premium made hands down to air.
 *
 * Integrates with:
 * - evaluateHand() for made-hand tier detection
 * - detectDraws() for draw classification
 * - analyzeBoard() for board-relative context
 *
 * Pure TypeScript, zero Convex imports.
 */
import type { CardIndex } from "../types/cards";
import { rankValue, suitValue } from "../primitives/card";
import { evaluateHand, compareHandRanks } from "../primitives/handEvaluator";
import { detectDraws, type DrawInfo } from "../opponents/engines/drawDetector";
import { CATEGORY_STRENGTH } from "./categoryStrength";

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

export type HandCategory =
  | "premium_pair"          // AA, KK (preflop or overpair on low boards)
  | "overpair"              // Pocket pair above all board cards
  | "top_pair_top_kicker"   // Paired top board card with strong kicker
  | "top_pair_weak_kicker"  // Paired top board card with weak kicker
  | "second_pair"           // Pocket pair just below top board card (e.g., QQ on KT7)
  | "middle_pair"           // Paired with middle board card, or pocket pair between top/bottom
  | "bottom_pair"           // Paired with lowest board card
  | "two_pair"              // Two pair (hero contributes to both)
  | "sets_plus"             // Set, straight, flush, full house, quads
  | "overcards"             // Two cards above the board, no pair
  | "flush_draw"            // 4 to a flush
  | "straight_draw"         // OESD or gutshot
  | "combo_draw"            // Flush draw + straight draw
  | "weak_draw"             // Backdoor flush only
  | "air";                  // Nothing — no pair, no draw, no overcards

export interface HandCategorization {
  category: HandCategory;
  subCategory?: string;
  relativeStrength: number; // 0-1 within category
  description: string;
}

// CATEGORY_STRENGTH imported from ./categoryStrength (single source of truth)

// ═══════════════════════════════════════════════════════
// MAIN CLASSIFIER
// ═══════════════════════════════════════════════════════

/**
 * Categorize hero's hand relative to the board.
 *
 * For preflop (no community cards), classifies into preflop hand groups.
 * For postflop, classifies by made hand strength + draw potential.
 */
export function categorizeHand(
  holeCards: CardIndex[],
  communityCards: CardIndex[],
): HandCategorization {
  if (holeCards.length < 2) {
    return { category: "air", relativeStrength: 0, description: "Unknown hand" };
  }

  if (communityCards.length === 0) {
    return categorizePreflop(holeCards);
  }

  return categorizePostflop(holeCards, communityCards);
}

/**
 * Find the closest hand category by strength for fallback lookups.
 */
export function closestCategory(
  target: HandCategory,
  available: HandCategory[],
): HandCategory {
  if (available.includes(target)) return target;
  const targetStrength = CATEGORY_STRENGTH[target];
  let best = available[0];
  let bestDist = Math.abs(CATEGORY_STRENGTH[best] - targetStrength);
  for (const cat of available) {
    const dist = Math.abs(CATEGORY_STRENGTH[cat] - targetStrength);
    if (dist < bestDist) {
      best = cat;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * Get the base strength value for a category (for EV scoring).
 */
export function categoryStrength(cat: HandCategory): number {
  return CATEGORY_STRENGTH[cat];
}

// ═══════════════════════════════════════════════════════
// PREFLOP CLASSIFICATION
// ═══════════════════════════════════════════════════════

function categorizePreflop(holeCards: CardIndex[]): HandCategorization {
  const r1 = rankValue(holeCards[0]);
  const r2 = rankValue(holeCards[1]);
  const suited = suitValue(holeCards[0]) === suitValue(holeCards[1]);
  const highRank = Math.max(r1, r2);
  const lowRank = Math.min(r1, r2);
  const isPair = r1 === r2;
  const gap = highRank - lowRank;

  if (isPair) {
    if (highRank >= 11) {
      // AA, KK
      return {
        category: "premium_pair",
        subCategory: highRank === 12 ? "aces" : "kings",
        relativeStrength: 0.9 + highRank * 0.008,
        description: `Pocket ${rankName(highRank)}s`,
      };
    }
    if (highRank >= 8) {
      // QQ-TT
      return {
        category: "overpair",
        subCategory: "high_pair",
        relativeStrength: 0.7 + highRank * 0.02,
        description: `Pocket ${rankName(highRank)}s`,
      };
    }
    return {
      category: "middle_pair",
      subCategory: "pocket_pair",
      relativeStrength: 0.4 + highRank * 0.03,
      description: `Pocket ${rankName(highRank)}s`,
    };
  }

  // Broadway hands (both cards T+)
  if (highRank >= 8 && lowRank >= 8) {
    const strength = suited ? 0.65 + highRank * 0.02 : 0.55 + highRank * 0.02;
    return {
      category: "overcards",
      subCategory: suited ? "broadway_suited" : "broadway_offsuit",
      relativeStrength: strength,
      description: `${rankName(highRank)}${rankName(lowRank)}${suited ? "s" : "o"}`,
    };
  }

  // Suited connectors
  if (suited && gap <= 2 && highRank >= 4) {
    return {
      category: "straight_draw",
      subCategory: gap === 1 ? "suited_connector" : "suited_gapper",
      relativeStrength: 0.35 + highRank * 0.02,
      description: `${rankName(highRank)}${rankName(lowRank)}s`,
    };
  }

  // Suited aces
  if (suited && highRank === 12) {
    return {
      category: "flush_draw",
      subCategory: "suited_ace",
      relativeStrength: 0.55 + lowRank * 0.02,
      description: `A${rankName(lowRank)}s`,
    };
  }

  // One high card
  if (highRank >= 10) {
    return {
      category: "overcards",
      subCategory: suited ? "one_broadway_suited" : "one_broadway",
      relativeStrength: 0.2 + highRank * 0.02 + lowRank * 0.005,
      description: `${rankName(highRank)}${rankName(lowRank)}${suited ? "s" : "o"}`,
    };
  }

  // Everything else — suited junk is marginal (flush potential), offsuit is air
  if (suited) {
    return {
      category: "weak_draw",
      subCategory: "suited_junk",
      relativeStrength: 0.1 + highRank * 0.01,
      description: `Weak suited hand (${rankName(highRank)}${rankName(lowRank)}s)`,
    };
  }
  return {
    category: "air",
    subCategory: "offsuit_junk",
    relativeStrength: 0.05 + highRank * 0.01,
    description: `Weak offsuit hand (${rankName(highRank)}${rankName(lowRank)}o)`,
  };
}

// ═══════════════════════════════════════════════════════
// POSTFLOP CLASSIFICATION
// ═══════════════════════════════════════════════════════

function categorizePostflop(
  holeCards: CardIndex[],
  communityCards: CardIndex[],
): HandCategorization {
  const allCards = [...holeCards, ...communityCards];
  const heroRanks = holeCards.map(rankValue);
  const boardRanks = communityCards.map(rankValue).sort((a, b) => b - a);
  const highHero = Math.max(...heroRanks);
  const isPocketPair = heroRanks[0] === heroRanks[1];

  // Get made hand and draw info
  const madeHand = evaluateHand(allCards);
  const draws = detectDraws(holeCards, communityCards);
  const tier = madeHand.rank.tier;

  // ── Check if hero's cards actually improve on the board ──
  // If the board alone makes the same hand (or better), hero doesn't contribute
  // and should be classified by kicker/draw potential instead.
  // Compare actual hand ranks, not just tiers, to catch cases like
  // board straight 5-9 vs hero's higher straight 7-J (same tier, different rank).
  let heroImprovesBoardHand = true;
  let boardOnlyTier = -1;
  if (communityCards.length >= 5) {
    const boardOnlyHand = evaluateHand(communityCards);
    boardOnlyTier = boardOnlyHand.rank.tier;
    heroImprovesBoardHand = compareHandRanks(madeHand.rank, boardOnlyHand.rank) > 0;
  } else if (communityCards.length === 4) {
    // On turn: detect board trips/quads from rank counts even without 5-card eval
    const boardRankCounts = new Map<number, number>();
    for (const r of boardRanks) boardRankCounts.set(r, (boardRankCounts.get(r) ?? 0) + 1);
    const maxBoardCount = Math.max(...boardRankCounts.values());
    if (maxBoardCount >= 3) boardOnlyTier = 3; // board has trips
    if (maxBoardCount >= 4) boardOnlyTier = 7; // board has quads
    // Check if hero actually contributes to the made hand
    if (boardOnlyTier >= 3) {
      const tripRank = [...boardRankCounts.entries()].find(([, c]) => c >= 3)?.[0];
      const heroHasTripCard = tripRank !== undefined && heroRanks.includes(tripRank);
      if (!heroHasTripCard && !isPocketPair) {
        heroImprovesBoardHand = false;
      }
    }
  }

  // ── Monster hands: straight+ (tier >= 4) ──
  if (tier >= 4 && heroImprovesBoardHand) {
    return {
      category: "sets_plus",
      subCategory: madeHand.rank.name.toLowerCase().replace(/ /g, "_"),
      relativeStrength: 0.9 + tier * 0.01,
      description: madeHand.rank.name,
    };
  }

  // Board has a monster but hero doesn't improve it — classify by kicker/draws
  if (tier >= 4 && !heroImprovesBoardHand) {
    // Hero's cards are irrelevant to the made hand; everyone has the same hand.
    // Classify based on kicker strength (if it matters) or draw potential.
    if (highHero > boardRanks[0]) {
      return {
        category: "overcards",
        subCategory: "board_monster_kicker",
        relativeStrength: 0.2 + highHero * 0.005,
        description: `Board ${madeHand.rank.name} (${rankName(highHero)} kicker)`,
      };
    }
    return {
      category: "air",
      subCategory: "board_monster",
      relativeStrength: 0.05 + highHero * 0.003,
      description: `Board ${madeHand.rank.name} (no kicker)`,
    };
  }

  // ── Three of a kind (set or trips) ──
  if (tier === 3) {
    // Check hero actually holds one of the trip cards
    const tripRank = boardRanks.find((r) =>
      boardRanks.filter((br) => br === r).length >= 2,
    );
    const heroHasTrip = tripRank !== undefined && heroRanks.includes(tripRank);
    const isSet = isPocketPair;

    // If board already has trips and hero doesn't contribute, downgrade
    if (!isSet && !heroHasTrip && boardOnlyTier >= 3) {
      if (highHero > boardRanks[0]) {
        return {
          category: "overcards",
          subCategory: "board_trips_kicker",
          relativeStrength: 0.25 + highHero * 0.005,
          description: `Board trips (${rankName(highHero)} kicker)`,
        };
      }
      return {
        category: "air",
        subCategory: "board_trips",
        relativeStrength: 0.05 + highHero * 0.003,
        description: "Board trips (no kicker)",
      };
    }

    return {
      category: "sets_plus",
      subCategory: isSet ? "set" : "trips",
      relativeStrength: isSet ? 0.88 : 0.82,
      description: isSet ? "Set" : "Trips",
    };
  }

  // ── Two pair ──
  if (tier === 2) {
    // Check hero contributes to both pairs
    const heroPairsBoard = heroRanks.filter((r) => boardRanks.includes(r));
    const uniqueHeroPairs = new Set(heroPairsBoard);
    if (uniqueHeroPairs.size >= 2) {
      return {
        category: "two_pair",
        relativeStrength: 0.8 + highHero * 0.005,
        description: "Two pair",
      };
    }
    // If hero only contributes one pair, board has the other pair
    // Still classify as two pair but lower strength
    if (uniqueHeroPairs.size === 1) {
      return {
        category: "two_pair",
        subCategory: "board_paired",
        relativeStrength: 0.7 + highHero * 0.005,
        description: "Two pair (one on board)",
      };
    }
    // Board has both pairs — hero has neither
    if (isPocketPair) {
      // Pocket pair + board pair = two pair (hero contributes the second pair)
      // heroPairsBoard was empty because hero's rank isn't ON the board,
      // but the pocket pair IS the second pair in the two-pair hand.
      return {
        category: "two_pair",
        subCategory: "pocket_pair_plus_board",
        relativeStrength: 0.7 + heroRanks[0] * 0.005,
        description: "Two pair (pocket pair + board pair)",
      };
    }
    // Non-pocket pair hero, board has both pairs — treat as kicker
    if (highHero >= boardRanks[0]) {
      return {
        category: "overcards",
        relativeStrength: 0.3,
        description: "Board two pair with overcard",
      };
    }
    return {
      category: "air",
      subCategory: "board_two_pair",
      relativeStrength: 0.1 + highHero * 0.005,
      description: "Board two pair (no kicker)",
    };
  }

  // ── One pair ──
  if (tier === 1) {
    return classifyOnePair(holeCards, communityCards, heroRanks, boardRanks, isPocketPair, draws);
  }

  // ── No pair (tier 0 = high card) ──
  // On river (5 community cards), draws are meaningless — suppress draw categories
  const isRiver = communityCards.length >= 5;
  return classifyUnpaired(heroRanks, boardRanks, draws, isRiver);
}

function classifyOnePair(
  holeCards: CardIndex[],
  communityCards: CardIndex[],
  heroRanks: number[],
  boardRanks: number[],
  isPocketPair: boolean,
  draws: DrawInfo,
): HandCategorization {
  const topBoardRank = boardRanks[0];

  if (isPocketPair) {
    // Pocket pair: overpair, middle pair, or underpair
    if (heroRanks[0] > topBoardRank) {
      if (heroRanks[0] >= 11) {
        return {
          category: "premium_pair",
          subCategory: "overpair_premium",
          relativeStrength: 0.85 + heroRanks[0] * 0.005,
          description: `Overpair (${rankName(heroRanks[0])}${rankName(heroRanks[0])})`,
        };
      }
      return {
        category: "overpair",
        relativeStrength: 0.75 + heroRanks[0] * 0.008,
        description: `Overpair (${rankName(heroRanks[0])}${rankName(heroRanks[0])})`,
      };
    }
    if (heroRanks[0] < boardRanks[boardRanks.length - 1]) {
      return {
        category: "bottom_pair",
        subCategory: "underpair",
        relativeStrength: 0.25 + heroRanks[0] * 0.01,
        description: `Underpair (${rankName(heroRanks[0])}${rankName(heroRanks[0])})`,
      };
    }
    // Pocket pair between top and bottom board cards — stronger than a random middle pair
    // because it's hidden and both cards contribute. QQ on KT7 = 0.65, JJ = 0.64, etc.
    const isSecondPair = boardRanks.length >= 2 && heroRanks[0] > boardRanks[1];
    return {
      category: isSecondPair ? "second_pair" : "middle_pair",
      subCategory: "pocket_pair_middle",
      relativeStrength: 0.5 + heroRanks[0] * 0.015,
      description: isSecondPair
        ? `Second pair (${rankName(heroRanks[0])}${rankName(heroRanks[0])})`
        : `Middle pair (${rankName(heroRanks[0])}${rankName(heroRanks[0])})`,
    };
  }

  // Hero pairs with a board card
  const pairedRank = heroRanks.find((r) => boardRanks.includes(r));
  if (pairedRank === undefined) {
    // Board has a pair, hero doesn't contribute — check for draws
    const isRiver = communityCards.length >= 5;
    return classifyUnpaired(heroRanks, boardRanks, draws, isRiver);
  }

  const kicker = heroRanks.find((r) => r !== pairedRank) ?? 0;

  if (pairedRank === topBoardRank) {
    // Top pair
    if (kicker >= 10) {
      // T+ kicker = "top kicker" territory
      return {
        category: "top_pair_top_kicker",
        relativeStrength: 0.7 + kicker * 0.008,
        description: `Top pair, ${rankName(kicker)} kicker`,
      };
    }
    return {
      category: "top_pair_weak_kicker",
      relativeStrength: 0.55 + kicker * 0.005,
      description: `Top pair, ${rankName(kicker)} kicker`,
    };
  }

  // Middle board rank
  const midRank = boardRanks.length >= 2 ? boardRanks[1] : -1;
  if (pairedRank === midRank) {
    return {
      category: "middle_pair",
      relativeStrength: 0.4 + pairedRank * 0.01 + kicker * 0.003,
      description: `Middle pair (${rankName(pairedRank)}s)`,
    };
  }

  // Bottom pair
  return {
    category: "bottom_pair",
    relativeStrength: 0.28 + pairedRank * 0.01 + kicker * 0.003,
    description: `Bottom pair (${rankName(pairedRank)}s)`,
  };
}

function classifyUnpaired(
  heroRanks: number[],
  boardRanks: number[],
  draws: DrawInfo,
  isRiver = false,
): HandCategorization {
  const highHero = Math.max(...heroRanks);
  const lowHero = Math.min(...heroRanks);
  const topBoardRank = boardRanks[0];
  const hasOvercards = highHero > topBoardRank && lowHero > topBoardRank;

  // On the river, draws are meaningless (no cards to come) — skip draw detection
  // and classify by made hand / kicker strength only
  if (isRiver) {
    if (hasOvercards) {
      return {
        category: "overcards",
        relativeStrength: 0.22 + highHero * 0.005,
        description: `Overcards (${rankName(highHero)} high)`,
      };
    }
    return {
      category: "air",
      subCategory: highHero >= 8 ? "one_overcard" : undefined,
      relativeStrength: 0.02 + highHero * 0.003,
      description: `Air (${rankName(highHero)} high)`,
    };
  }

  // Combo draw (flush + straight)
  if (draws.isCombo) {
    return {
      category: "combo_draw",
      subCategory: draws.bestDrawType,
      relativeStrength: 0.55 + draws.totalOuts * 0.005,
      description: `Combo draw (${draws.totalOuts} outs)`,
    };
  }

  // Flush draw
  if (draws.hasFlushDraw) {
    const isNutFlush = highHero === 12; // Ace-high flush draw
    return {
      category: "flush_draw",
      subCategory: isNutFlush ? "nut_flush_draw" : "flush_draw",
      relativeStrength: isNutFlush ? 0.52 : 0.42,
      description: isNutFlush ? "Nut flush draw" : "Flush draw",
    };
  }

  // Straight draw
  if (draws.hasStraightDraw) {
    const isOESD = draws.straightOuts >= 8;
    return {
      category: "straight_draw",
      subCategory: isOESD ? "oesd" : "gutshot",
      relativeStrength: isOESD ? 0.38 : 0.28,
      description: isOESD ? "Open-ended straight draw" : "Gutshot",
    };
  }

  // Overcards
  if (hasOvercards) {
    const hasBdFlush = draws.hasBackdoorFlush;
    if (hasBdFlush) {
      return {
        category: "overcards",
        subCategory: "overcards_with_backdoor",
        relativeStrength: 0.28 + highHero * 0.005,
        description: `Overcards with backdoor flush`,
      };
    }
    return {
      category: "overcards",
      relativeStrength: 0.22 + highHero * 0.005,
      description: `Overcards (${rankName(highHero)} high)`,
    };
  }

  // One overcard (not both) — ace-high or king-high with some equity
  // This is HIGHER priority than a pure backdoor draw because the overcard
  // has immediate showdown value if the board checks down.
  const hasOneOvercard = highHero > topBoardRank;
  if (hasOneOvercard) {
    const hasBdFlush = draws.hasBackdoorFlush;
    const isAceHigh = highHero === 12;
    const strength = isAceHigh
      ? 0.30 + lowHero * 0.005 + (hasBdFlush ? 0.05 : 0) // A-high with kicker
      : 0.20 + highHero * 0.005 + (hasBdFlush ? 0.05 : 0);
    const drawNote = hasBdFlush ? " + backdoor flush" : "";
    return {
      category: "overcards",
      subCategory: isAceHigh ? "ace_high" : "one_overcard",
      relativeStrength: strength,
      description: isAceHigh
        ? `Ace high (${rankName(lowHero)} kicker${drawNote})`
        : `${rankName(highHero)} high${drawNote}`,
    };
  }

  // Backdoor flush only (no overcards)
  if (draws.hasBackdoorFlush) {
    return {
      category: "weak_draw",
      subCategory: "backdoor_flush",
      relativeStrength: 0.12,
      description: "Backdoor flush draw",
    };
  }

  // Air
  return {
    category: "air",
    relativeStrength: 0.02 + highHero * 0.003,
    description: `Air (${rankName(highHero)} high)`,
  };
}

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

const RANK_NAMES = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];

function rankName(rankVal: number): string {
  return RANK_NAMES[rankVal] ?? "?";
}
