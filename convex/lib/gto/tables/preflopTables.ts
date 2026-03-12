/**
 * Preflop frequency tables — hand-curated from standard GTO charts.
 *
 * These cover archetypes 1-5 (preflop foundations).
 * Actions: fold, call, raise (simplified preflop action set).
 *
 * Pure TypeScript, zero Convex imports.
 */
import type { FrequencyTable } from "./types";

// ═══════════════════════════════════════════════════════
// ARCHETYPE 1: RFI OPENING RANGES
// ═══════════════════════════════════════════════════════

export const RFI_OPENING: FrequencyTable = {
  archetypeId: "rfi_opening",
  name: "RFI Opening Ranges",
  description: "Raise First In — standard 6-max opening ranges by position",
  context: {
    street: "preflop",
    potType: "srp",
    heroPosition: ["utg", "hj", "co", "btn", "sb"],
    villainPosition: "bb",
  },
  // IP = late position (BTN/CO), OOP = early position (UTG/HJ)
  // Frequencies represent raise vs fold (no limp in GTO)
  ipFrequencies: {
    // BTN/CO ranges — wider
    premium_pair: { bet_medium: 1.0 },          // Always raise AA-KK
    overpair: { bet_medium: 1.0 },               // Always raise QQ-TT
    middle_pair: { bet_medium: 0.85, fold: 0.15 }, // Raise most pairs, fold 22-33 sometimes
    overcards: { bet_medium: 0.9, fold: 0.1 },   // AK-AJ, KQ always; KJ, QJ mostly
    flush_draw: { bet_medium: 0.75, fold: 0.25 }, // Suited aces, suited broadway
    straight_draw: { bet_medium: 0.65, fold: 0.35 }, // Suited connectors 54s-T9s
    weak_draw: { fold: 0.85, bet_medium: 0.15 },  // Suited gappers
    air: { fold: 1.0 },                           // Junk → fold
  },
  oopFrequencies: {
    // UTG/HJ ranges — tighter
    premium_pair: { bet_medium: 1.0 },
    overpair: { bet_medium: 1.0 },
    middle_pair: { bet_medium: 0.5, fold: 0.5 },  // Raise 55+, fold lower
    overcards: { bet_medium: 0.7, fold: 0.3 },    // AK-ATs, KQs
    flush_draw: { bet_medium: 0.4, fold: 0.6 },   // Only premium suited
    straight_draw: { bet_medium: 0.3, fold: 0.7 }, // Only high suited connectors
    weak_draw: { fold: 1.0 },
    air: { fold: 1.0 },
  },
  actionsIp: ["bet_medium", "fold"],
  actionsOop: ["bet_medium", "fold"],
  keyPrinciple: "Open wider in late position (BTN 45%, UTG 15%). Position is the biggest edge in poker.",
  commonMistakes: [
    "Opening too many hands from early position",
    "Not opening wide enough from the button",
    "Limping instead of raising (no GTO limp from non-SB)",
  ],
  source: "Standard 6-max GTO charts (Upswing, GTO Wizard)",
};

// ═══════════════════════════════════════════════════════
// ARCHETYPE 2: BB DEFENSE VS RFI
// ═══════════════════════════════════════════════════════

export const BB_DEFENSE: FrequencyTable = {
  archetypeId: "bb_defense_vs_rfi",
  name: "BB Defense vs RFI",
  description: "Big Blind defending against a single raise — fold, call, or 3-bet",
  context: {
    street: "preflop",
    potType: "srp",
    heroPosition: "bb",
    villainPosition: ["utg", "hj", "co", "btn"],
  },
  // IP = vs late position opener (defend wider)
  ipFrequencies: {
    premium_pair: { bet_large: 1.0 },              // 3-bet AA-KK always
    overpair: { bet_large: 0.85, call: 0.15 },     // 3-bet QQ-TT mostly, flat sometimes
    middle_pair: { call: 0.7, fold: 0.2, bet_large: 0.1 }, // Mostly call, some folds
    top_pair_top_kicker: { call: 0.6, bet_large: 0.4 }, // AK: mix 3-bet and call
    overcards: { call: 0.55, fold: 0.25, bet_large: 0.2 }, // AJ, KQ: mostly call
    flush_draw: { call: 0.6, fold: 0.3, bet_large: 0.1 }, // Suited connectors: mostly call
    straight_draw: { call: 0.5, fold: 0.4, bet_large: 0.1 },
    bottom_pair: { call: 0.5, fold: 0.5 },         // Weak pairs: coin flip
    weak_draw: { fold: 0.7, call: 0.3 },
    air: { fold: 0.85, call: 0.15 },               // Mostly fold junk, defend some
  },
  // OOP = vs early position opener (defend tighter)
  oopFrequencies: {
    premium_pair: { bet_large: 1.0 },
    overpair: { bet_large: 0.9, call: 0.1 },
    middle_pair: { call: 0.5, fold: 0.4, bet_large: 0.1 },
    top_pair_top_kicker: { bet_large: 0.5, call: 0.5 },
    overcards: { call: 0.4, fold: 0.4, bet_large: 0.2 },
    flush_draw: { call: 0.4, fold: 0.5, bet_large: 0.1 },
    straight_draw: { call: 0.3, fold: 0.6, bet_large: 0.1 },
    bottom_pair: { fold: 0.7, call: 0.3 },
    weak_draw: { fold: 0.85, call: 0.15 },
    air: { fold: 0.95, call: 0.05 },
  },
  actionsIp: ["fold", "call", "bet_large"],
  actionsOop: ["fold", "call", "bet_large"],
  keyPrinciple: "Defend BB ~55% vs BTN open, ~35% vs UTG. Getting 3.5:1 odds means you defend wide.",
  commonMistakes: [
    "Folding too much from BB (you already have 1bb invested)",
    "3-betting too polar — need some 3-bet bluffs (A5s, suited connectors)",
    "Calling the same range vs UTG and BTN (tighten up vs EP!)",
  ],
  source: "Standard 6-max GTO charts",
};

// ═══════════════════════════════════════════════════════
// ARCHETYPE 3: 3-BET POTS
// ═══════════════════════════════════════════════════════

export const THREE_BET_POTS: FrequencyTable = {
  archetypeId: "three_bet_pots",
  name: "3-Bet Pot Ranges",
  description: "3-bet pot preflop — value/bluff ratios for 3-bettor and caller",
  context: {
    street: "preflop",
    potType: "3bet",
    heroPosition: ["bb", "sb", "btn"],
    villainPosition: ["utg", "hj", "co", "btn"],
  },
  // IP = 3-bettor facing call decision
  ipFrequencies: {
    premium_pair: { bet_large: 1.0 },     // 4-bet with premium
    overpair: { call: 0.7, bet_large: 0.3 }, // Mostly call 3-bet with QQ-TT
    middle_pair: { fold: 0.7, call: 0.3 },   // Fold small pairs to 3-bet
    overcards: { call: 0.6, fold: 0.3, bet_large: 0.1 },
    flush_draw: { fold: 0.6, call: 0.4 },
    straight_draw: { fold: 0.8, call: 0.2 },
    air: { fold: 1.0 },
  },
  // OOP = facing 3-bet as original raiser
  oopFrequencies: {
    premium_pair: { bet_large: 1.0 },
    overpair: { call: 0.6, bet_large: 0.4 },
    middle_pair: { fold: 0.8, call: 0.2 },
    overcards: { call: 0.5, fold: 0.4, bet_large: 0.1 },
    flush_draw: { fold: 0.7, call: 0.3 },
    air: { fold: 1.0 },
  },
  actionsIp: ["fold", "call", "bet_large"],
  actionsOop: ["fold", "call", "bet_large"],
  keyPrinciple: "3-bet range should be polarized: premiums + some suited bluffs (A5s, 76s). No flat 3-bets with medium hands.",
  commonMistakes: [
    "3-betting too linear (only strong hands, no bluffs)",
    "Calling 3-bets with easily dominated hands (KJo, QTo)",
    "3-betting the same frequency regardless of opponent position",
  ],
  source: "Standard 6-max GTO charts",
};

// ═══════════════════════════════════════════════════════
// ARCHETYPE 4: BLIND VS BLIND
// ═══════════════════════════════════════════════════════

export const BLIND_VS_BLIND: FrequencyTable = {
  archetypeId: "blind_vs_blind",
  name: "Blind vs Blind",
  description: "SB vs BB — wide ranges, unique postflop dynamics",
  context: {
    street: "preflop",
    potType: "bvb",
    heroPosition: ["sb", "bb"],
    villainPosition: ["sb", "bb"],
  },
  // IP = SB (opens wider since only BB to act through)
  ipFrequencies: {
    premium_pair: { bet_medium: 1.0 },
    overpair: { bet_medium: 1.0 },
    middle_pair: { bet_medium: 0.9, call: 0.1 },
    overcards: { bet_medium: 0.85, fold: 0.15 },
    flush_draw: { bet_medium: 0.7, fold: 0.3 },
    straight_draw: { bet_medium: 0.6, fold: 0.4 },
    bottom_pair: { bet_medium: 0.5, fold: 0.5 },
    weak_draw: { bet_medium: 0.35, fold: 0.65 },
    air: { fold: 0.7, bet_medium: 0.3 },
  },
  // OOP = BB (defending vs SB open — defend very wide)
  oopFrequencies: {
    premium_pair: { bet_large: 1.0 },
    overpair: { bet_large: 0.7, call: 0.3 },
    middle_pair: { call: 0.7, bet_large: 0.1, fold: 0.2 },
    overcards: { call: 0.6, bet_large: 0.2, fold: 0.2 },
    flush_draw: { call: 0.65, bet_large: 0.15, fold: 0.2 },
    straight_draw: { call: 0.55, fold: 0.35, bet_large: 0.1 },
    bottom_pair: { call: 0.5, fold: 0.45, bet_large: 0.05 },
    weak_draw: { call: 0.35, fold: 0.65 },
    air: { fold: 0.65, call: 0.35 },
  },
  actionsIp: ["bet_medium", "fold", "call"],
  actionsOop: ["fold", "call", "bet_large"],
  keyPrinciple: "SB opens ~65% of hands. BB defends ~60% vs SB. Both ranges are wide — postflop skill matters most.",
  commonMistakes: [
    "Not opening wide enough from SB (it's almost like BTN)",
    "Over-folding BB vs SB (you're getting great odds)",
    "Not 3-betting enough from BB vs SB (exploit their wide range)",
  ],
  source: "Standard BvB GTO charts",
};

// ═══════════════════════════════════════════════════════
// ARCHETYPE 5: 4-BET / 5-BET
// ═══════════════════════════════════════════════════════

export const FOUR_BET_FIVE_BET: FrequencyTable = {
  archetypeId: "four_bet_five_bet",
  name: "4-Bet / 5-Bet Ranges",
  description: "4-bet and 5-bet polarized ranges — value and bluff ratios",
  context: {
    street: "preflop",
    potType: "4bet",
    heroPosition: ["btn", "co", "bb"],
    villainPosition: ["btn", "co", "bb"],
  },
  // IP = 4-bettor
  ipFrequencies: {
    premium_pair: { bet_large: 1.0 },     // AA, KK always 4-bet/5-bet
    overpair: { call: 0.5, bet_large: 0.5 }, // QQ mix
    middle_pair: { fold: 1.0 },               // Fold small pairs to 3-bet+
    overcards: { bet_large: 0.6, fold: 0.4 }, // AK 4-bets, AQ folds sometimes
    flush_draw: { bet_large: 0.2, fold: 0.8 }, // A5s as 4-bet bluff
    air: { fold: 1.0 },
  },
  // OOP = facing 4-bet
  oopFrequencies: {
    premium_pair: { bet_large: 1.0 },          // 5-bet jam AA, KK
    overpair: { call: 0.6, fold: 0.2, bet_large: 0.2 },
    middle_pair: { fold: 1.0 },
    overcards: { call: 0.4, fold: 0.6 },       // AK calls, AQ folds
    flush_draw: { fold: 0.9, bet_large: 0.1 }, // Rare 5-bet bluff
    air: { fold: 1.0 },
  },
  actionsIp: ["fold", "call", "bet_large"],
  actionsOop: ["fold", "call", "bet_large"],
  keyPrinciple: "4-bet range is polarized: AA/KK/AK for value + A5s/A4s as bluffs. ~2:1 value:bluff ratio.",
  commonMistakes: [
    "4-betting too wide (JJ, AQ should mostly flat the 3-bet)",
    "Never 4-bet bluffing (need some bluffs to be unexploitable)",
    "Calling 4-bets with dominated hands (AJo, KQo)",
  ],
  source: "Standard 4-bet/5-bet GTO charts",
};

// ═══════════════════════════════════════════════════════
// FLOP ARCHETYPE METADATA
// ═══════════════════════════════════════════════════════

/** Metadata for each flop texture archetype — used when importing solver data */
export const FLOP_ARCHETYPE_METADATA: Record<
  string,
  { name: string; description: string; keyPrinciple: string; commonMistakes: string[] }
> = {
  ace_high_dry_rainbow: {
    name: "Ace-High Dry Rainbow",
    description: "Axx rainbow flop in SRP, BTN vs BB",
    keyPrinciple: "BTN has massive range advantage on A-high dry boards. Bet small (33%) with high frequency — merged c-bet strategy.",
    commonMistakes: [
      "Checking too much — bet 55-70% of range on A-high dry",
      "Betting too large — 33% pot is the primary sizing on dry boards",
      "Slow-playing sets — they still need protection on A-high boards",
    ],
  },
  kq_high_dry_rainbow: {
    name: "K/Q-High Dry Rainbow",
    description: "K/Q-xx rainbow flop in SRP, BTN vs BB",
    keyPrinciple: "Moderate range advantage. Mix between 33% and 75% sizing. Check more than on A-high boards.",
    commonMistakes: [
      "Treating K-high the same as A-high (K-high boards are more contested)",
      "Not using larger sizings with your best hands",
      "Betting air too often — check/fold more on K-high vs A-high",
    ],
  },
  mid_low_dry_rainbow: {
    name: "Mid/Low Dry Rainbow",
    description: "7-T high dry rainbow flop in SRP, BTN vs BB",
    keyPrinciple: "Smaller range advantage. Check more frequently. BB hits these boards better than high-card boards.",
    commonMistakes: [
      "C-betting too often — check ~50% of range on low boards",
      "Using same sizing as high-card boards (prefer mixing 33%/75%)",
      "Forgetting BB has more sets and two pairs on low boards",
    ],
  },
  paired_boards: {
    name: "Paired Boards",
    description: "Paired flop (xxy) in SRP, BTN vs BB",
    keyPrinciple: "Fewer combos connect. High c-bet frequency with small sizing. Board pairing reduces equity realization for defender.",
    commonMistakes: [
      "Not c-betting enough — paired boards are great for range bets",
      "Using too large a sizing — small bets work well here",
      "Overvaluing trips — kicker matters a lot on paired boards",
    ],
  },
  two_tone_disconnected: {
    name: "Two-Tone Disconnected",
    description: "Two-tone, disconnected flop in SRP, BTN vs BB",
    keyPrinciple: "Flush draws present but few straight draws. Use polarized sizing — check or bet 75%. Flush draws add equity to your bluffs.",
    commonMistakes: [
      "Betting small with flush draws (use medium sizing to build pot)",
      "Not protecting hands against flush draws with larger bets",
      "Ignoring that villain has flush draws too — don't overbet",
    ],
  },
  two_tone_connected: {
    name: "Two-Tone Connected",
    description: "Two-tone, connected flop in SRP, BTN vs BB",
    keyPrinciple: "Wet board — many draws for both sides. Check more, use larger sizing when betting. Draw equity makes defending easy.",
    commonMistakes: [
      "C-betting too much on wet boards — check at higher frequency",
      "Betting small on draw-heavy boards (draws get too good a price)",
      "Not recognizing when you have a combo draw (play aggressively!)",
    ],
  },
  monotone: {
    name: "Monotone",
    description: "All one suit flop in SRP, BTN vs BB",
    keyPrinciple: "Highly specialized. If you don't have the suit, check/fold. Having the nut flush draw is huge. Range advantage shrinks.",
    commonMistakes: [
      "C-betting without a flush card (pure bluff into a flush-heavy board)",
      "Not value betting strong flushes enough (villain may have draws)",
      "Overfolding — having one card of the suit gives backdoor equity",
    ],
  },
  rainbow_connected: {
    name: "Rainbow Connected",
    description: "Rainbow, connected flop in SRP, BTN vs BB",
    keyPrinciple: "No flush draws, but many straight draws. Medium c-bet frequency. Sizing depends on how connected the board is.",
    commonMistakes: [
      "Treating rainbow connected like rainbow disconnected (these are wetter)",
      "Not betting draws as semi-bluffs (straight draws have good equity)",
      "Using only one bet size — mix 33% with merged range and 75% with polarized",
    ],
  },
};

// ═══════════════════════════════════════════════════════
// ALL PREFLOP TABLES
// ═══════════════════════════════════════════════════════

export const ALL_PREFLOP_TABLES: FrequencyTable[] = [
  RFI_OPENING,
  BB_DEFENSE,
  THREE_BET_POTS,
  BLIND_VS_BLIND,
  FOUR_BET_FIVE_BET,
];
