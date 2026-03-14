/**
 * Archetype Prototypes — the "archetype of the archetype."
 *
 * Each archetype has a platonic ideal: the purest, most representative
 * example of that spot. These prototypes define:
 *   - What hand categories hero should have
 *   - What board features are required
 *   - What position hero should be in
 *   - The teaching narrative — what the user should understand and feel
 *
 * The constrained dealer uses these to generate hands that always
 * express the core concept clearly. Derivatives shift from the prototype
 * but stay within its margins.
 *
 * Pure TypeScript, zero Convex imports.
 */
import type { HandCategory } from "./handCategorizer";
import type { ArchetypeId } from "./archetypeClassifier";
import type { Position } from "../types/cards";

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

export interface BoardConstraint {
  /** Required: flop must be this texture type */
  preferredTextures?: ArchetypeId[];
  /** If true, board must be paired */
  requirePaired?: boolean;
  /** If true, board must NOT be paired */
  requireUnpaired?: boolean;
  /** If true, a draw must have bricked on the river (flush or straight) */
  requireBrickedDraw?: boolean;
  /** If true, board should be dry (rainbow, disconnected) */
  requireDry?: boolean;
  /** If true, board should have draw possibilities */
  requireWet?: boolean;
}

export interface ArchetypePrototype {
  /** Short label for UI display */
  name: string;

  /** One-line concept summary */
  concept: string;

  /**
   * The teaching narrative — what this spot IS at its core.
   * Written in second person, coaching voice.
   */
  teaching: string;

  /**
   * The feeling — what the user should internalize.
   * Short, visceral, quotable.
   */
  feeling: string;

  /** Hand categories that represent the prototype hero hand */
  prototypeHands: HandCategory[];

  /** Hand categories acceptable as derivatives (wider than prototype) */
  acceptableHands: HandCategory[];

  /** Board constraints for the prototype */
  boardConstraints?: BoardConstraint;

  /** Preferred hero position. If not set, defaults to archetype default. */
  preferredPosition?: Position;

  /** Whether hero should be in position for the prototype */
  preferInPosition?: boolean;

  /**
   * How derivatives shift from the prototype — teaching notes
   * for future curriculum expansion.
   */
  derivatives: DerivativeShift[];
}

export interface DerivativeShift {
  /** Label: "slightly off", "further out", "margin case" */
  distance: "near" | "mid" | "far";
  /** What changes from the prototype */
  description: string;
  /** The lesson this derivative teaches */
  lesson: string;
  /** Hand categories for this derivative (optional — uses acceptableHands if not set) */
  hands?: HandCategory[];
}

// ═══════════════════════════════════════════════════════
// POSTFLOP PRINCIPLE PROTOTYPES
// ═══════════════════════════════════════════════════════

const POSTFLOP_PROTOTYPES: Partial<Record<ArchetypeId, ArchetypePrototype>> = {

  // ─── Overbet River ───────────────────────────────────
  overbet_river: {
    name: "Overbet River",
    concept: "Exploit a capped villain range with a polarized overbet.",
    teaching:
      "You have a hand so strong that villain cannot have better. The board locked out " +
      "their range — they'd have raised a monster earlier. You're not asking 'should I bet?' " +
      "— you're asking 'how much can I extract?' The overbet exists because villain's range " +
      "is capped and yours isn't. You have the entire top of the range; they can only have " +
      "bluff-catchers.",
    feeling: "I have everything. They have nothing. The only question is how big.",
    prototypeHands: ["sets_plus"],
    acceptableHands: ["sets_plus", "two_pair", "top_pair_top_kicker", "air"],
    boardConstraints: {
      requirePaired: true,
      requireDry: true,
    },
    preferInPosition: true,
    derivatives: [
      {
        distance: "near",
        description: "Hero has a straight instead of the nut flush — still the nuts but less obvious.",
        lesson: "Overbets work with any nut hand, not just flushes.",
        hands: ["sets_plus"],
      },
      {
        distance: "mid",
        description: "Hero has top two pair — strong but not the nuts. Overbet becomes thinner.",
        lesson: "Two pair is strong enough to overbet on boards where villain can't have better.",
        hands: ["two_pair"],
      },
      {
        distance: "far",
        description: "Hero has air with a blocker — the bluff overbet. Same spot shape, opposite hand strength.",
        lesson: "The overbet works because of the spot, not just your cards. If you'd overbet the nuts here, you must also overbet some bluffs.",
        hands: ["air", "overcards"],
      },
    ],
  },

  // ─── Turn Barreling ──────────────────────────────────
  turn_barreling: {
    name: "Turn Barreling",
    concept: "Continue the flop story when the turn card supports your narrative.",
    teaching:
      "You told a story on the flop — you c-bet, representing strength. The turn is the " +
      "next chapter. Barreling means continuing the narrative. The turn card either gave you " +
      "real equity (a draw, a pair) or it's a scare card that villain can't handle. You keep " +
      "the pressure on because the board favors your range and villain's check signals weakness.",
    feeling: "I don't have it yet, but the turn card is perfect for my story. If I bet, they have to worry I have exactly what the board says I could have.",
    prototypeHands: ["flush_draw", "combo_draw", "straight_draw", "overcards"],
    acceptableHands: [
      "flush_draw", "combo_draw", "straight_draw", "overcards",
      "top_pair_top_kicker", "overpair", "middle_pair",
    ],
    boardConstraints: {
      requireWet: true,
    },
    preferInPosition: true,
    derivatives: [
      {
        distance: "near",
        description: "Hero has middle pair plus a draw — has showdown value, barrel is semi-bluff.",
        lesson: "The best barrels have backup equity. Even if called, you can improve.",
        hands: ["middle_pair", "flush_draw", "straight_draw"],
      },
      {
        distance: "mid",
        description: "Turn is a blank — barrel is pure bluff, relies on fold equity alone.",
        lesson: "Sometimes the story is strong enough that the card doesn't matter.",
        hands: ["overcards", "air"],
      },
      {
        distance: "far",
        description: "Turn completes your draw — this is actually a value bet now, not a barrel.",
        lesson: "The line looks the same, but the reason changed. Know which you're doing.",
        hands: ["sets_plus", "two_pair"],
      },
    ],
  },

  // ─── Thin Value River ────────────────────────────────
  thin_value_river: {
    name: "Thin Value River",
    concept: "Bet a hand that beats most — but not all — of villain's calling range.",
    teaching:
      "You have a hand that beats some of villain's calling range but loses to some of it " +
      "too. This is the hardest bet in poker. It's not 'I have the nuts, how much?' — it's " +
      "'If I bet, will the hands that call me be mostly worse, or mostly better?' You're " +
      "betting because you believe your specific hand is ahead of enough of villain's calling " +
      "range to make the bet profitable.",
    feeling: "I'm probably good. But if I bet, will they only call with better? On this dry board, against this passive player — they'll call with worse often enough. Bet.",
    prototypeHands: ["top_pair_top_kicker", "overpair"],
    acceptableHands: [
      "top_pair_top_kicker", "top_pair_weak_kicker", "overpair",
      "two_pair", "middle_pair",
    ],
    boardConstraints: {
      requireDry: true,
      requireUnpaired: true,
    },
    preferInPosition: true,
    derivatives: [
      {
        distance: "near",
        description: "Hero has second pair good kicker — value gets thinner, some top pairs now beat us.",
        lesson: "The thinner the value, the more board texture and villain tendencies matter.",
        hands: ["middle_pair"],
      },
      {
        distance: "mid",
        description: "Board has a completed flush draw — villain's calling range shifts. Missed draws fold but flushes now lurk.",
        lesson: "Wet boards make thin value bets riskier. The same hand is a bet on a dry board and a check on a wet one.",
        hands: ["top_pair_top_kicker", "overpair"],
      },
      {
        distance: "far",
        description: "Hero has top pair weak kicker — is this still a bet? This is where thin value gets truly thin.",
        lesson: "At the margins, the difference between betting and checking is tiny. Getting it right here separates good from great.",
        hands: ["top_pair_weak_kicker"],
      },
    ],
  },

  // ─── C-Bet Strategy ──────────────────────────────────
  cbet_sizing_frequency: {
    name: "C-Bet Strategy",
    concept: "Continuation-bet because the board favors your preflop raising range.",
    teaching:
      "You raised preflop and everyone checked to you — because you're the story-teller. " +
      "The c-bet continues that story. But here's what most players get wrong: you don't c-bet " +
      "because you have a good hand. You c-bet because the flop is good for your range. You " +
      "raised preflop, so your range is full of big cards and overpairs. If the flop has an ace " +
      "or king, that board belongs to you — your range smashes it, villain's range whiffs.",
    feeling: "This flop is mine. My range has all the aces, all the overpairs. They have random stuff that just whiffed. I bet because I'm supposed to have it.",
    prototypeHands: ["overcards", "top_pair_top_kicker", "overpair"],
    acceptableHands: [
      "overcards", "top_pair_top_kicker", "top_pair_weak_kicker",
      "overpair", "flush_draw", "straight_draw", "middle_pair",
      "air", "sets_plus",
    ],
    boardConstraints: {
      requireDry: true,
      preferredTextures: ["ace_high_dry_rainbow", "kq_high_dry_rainbow"],
    },
    preferInPosition: true,
    derivatives: [
      {
        distance: "near",
        description: "Hero actually has top pair — c-bet is both range-based and value. Easy.",
        lesson: "When you have it AND the board favors your range, it's the clearest bet in poker.",
        hands: ["top_pair_top_kicker", "overpair"],
      },
      {
        distance: "mid",
        description: "Flop is king-high two-tone — still favors raiser's range, but draws exist. Sizing matters more.",
        lesson: "On wetter boards, size up. You're still c-betting, but you need to charge draws.",
        hands: ["overcards", "top_pair_top_kicker", "flush_draw"],
      },
      {
        distance: "far",
        description: "Flop is 7-6-5 — this board does NOT favor the preflop raiser. Villain's calling range loves it.",
        lesson: "Sometimes the story doesn't fit the board. The best c-bet frequency on a bad board is zero.",
        hands: ["overcards", "overpair"],
      },
    ],
  },

  // ─── Check-Raise Defense ─────────────────────────────
  three_bet_pot_postflop: {
    name: "Check-Raise Defense",
    concept: "Respond correctly when villain check-raises your c-bet.",
    teaching:
      "You bet, and villain came back over the top. This is the moment most players panic — " +
      "they either fold everything or call everything. Check-raise defense is about staying calm " +
      "and reading what the raise means. On a dry board, the check-raise is polarized: monster " +
      "or bluff. On a wet board, it could be a draw semi-bluffing. Your job is to figure out " +
      "which hands in your range can continue — by calling to let bluffs keep bluffing, or " +
      "re-raising to deny equity.",
    feeling: "They raised me. Do they have it? I have top pair — I'm not folding to one raise on a board where draws exist. I call, and I reassess on the turn.",
    prototypeHands: ["overpair", "top_pair_top_kicker"],
    acceptableHands: [
      "overpair", "top_pair_top_kicker", "top_pair_weak_kicker",
      "sets_plus", "two_pair", "flush_draw", "combo_draw",
    ],
    boardConstraints: {
      requireWet: true,
    },
    preferInPosition: true,
    derivatives: [
      {
        distance: "near",
        description: "Hero has middle pair — thinner continue. Can we call? Sometimes, if villain bluffs enough.",
        lesson: "Against aggressive opponents, you need to defend wider than feels comfortable.",
        hands: ["middle_pair"],
      },
      {
        distance: "mid",
        description: "Board is completely dry — villain's check-raise is more polarized (sets or pure bluff).",
        lesson: "On dry boards, check-raises are rarer and more polar. Adjust your continuing range.",
        hands: ["overpair", "top_pair_top_kicker"],
      },
      {
        distance: "far",
        description: "Hero has overpair + flush draw — calling is easy because even if behind, you have redraws.",
        lesson: "The best hands to continue with aren't always the strongest — sometimes it's the ones with backup equity.",
        hands: ["overpair", "flush_draw", "combo_draw"],
      },
    ],
  },

  // ─── River Bluff-Catching ────────────────────────────
  river_bluff_catching_mdf: {
    name: "River Bluff-Catching",
    concept: "Call with a bluff-catcher when pot odds say villain must be bluffing enough.",
    teaching:
      "Villain has been betting every street — flop, turn, river. Triple barrel. They're " +
      "telling you they have it. But if they always had it, they'd never get called, and their " +
      "bets would print money. Game theory says they must be bluffing some percentage. " +
      "Bluff-catching is about holding a hand that beats bluffs but loses to value, and asking: " +
      "'Am I getting the right price?' This is the most mathematical spot in poker — pot odds " +
      "vs bluff frequency, stripped bare.",
    feeling: "I have one pair. They've been bombing every street. Everything says fold. But I'm getting 2.5:1 — they only need to be bluffing 28% for this call to profit. On this board, with those missed draws... they're bluffing enough. I call.",
    prototypeHands: ["middle_pair", "top_pair_weak_kicker"],
    acceptableHands: [
      "middle_pair", "top_pair_weak_kicker", "top_pair_top_kicker",
      "bottom_pair", "overpair",
    ],
    boardConstraints: {
      requireBrickedDraw: true,
    },
    preferInPosition: false, // Hero is OOP — villain has been pressuring
    preferredPosition: "bb",
    derivatives: [
      {
        distance: "near",
        description: "Missed draw is a straight draw instead of flush — same concept, different blockers.",
        lesson: "Blockers matter: holding a card that blocks villain's value range makes calling better.",
        hands: ["middle_pair", "top_pair_weak_kicker"],
      },
      {
        distance: "mid",
        description: "Board is very wet, multiple draws possible — harder to count villain's bluff combos.",
        lesson: "The math is the same but the inputs are fuzzier. More possible bluffs = more reason to call.",
        hands: ["top_pair_weak_kicker", "middle_pair"],
      },
      {
        distance: "far",
        description: "Hero has bottom pair — is this too weak? Or does rank not matter since all one-pair hands are bluff-catchers?",
        lesson: "A bluff-catcher is a bluff-catcher. The rank of your pair barely matters — what matters is whether you beat bluffs and lose to value.",
        hands: ["bottom_pair"],
      },
    ],
  },

  // ─── Exploitative Overrides (Multiway) ───────────────
  exploitative_overrides: {
    name: "Multiway Dynamics",
    concept: "Adjust strategy when three or more players see the flop.",
    teaching:
      "Everything changes multiway. Bluffing plummets in value because you need to get " +
      "through multiple opponents. Strong hands go up in value because someone is more likely " +
      "to pay you off. In heads-up pots, you're playing ranges and frequencies. In multiway " +
      "pots, you're playing hand strength, honestly. The more players, the more you need to " +
      "actually have it.",
    feeling: "I have top pair, but there are two players out there. I can't just c-bet like heads-up. I need to bet bigger to charge draws — and if someone raises, I need to respect it.",
    prototypeHands: ["top_pair_top_kicker", "overpair", "two_pair", "sets_plus"],
    acceptableHands: [
      "top_pair_top_kicker", "overpair", "two_pair", "sets_plus",
      "flush_draw", "combo_draw",
    ],
    boardConstraints: {
      requireWet: true,
    },
    preferInPosition: true,
    derivatives: [
      {
        distance: "near",
        description: "Hero has a flush draw instead of a made hand — in multiway, draws gain implied odds but lose semi-bluff equity.",
        lesson: "Multiway draws are about implied odds, not fold equity. Call, don't raise.",
        hands: ["flush_draw", "combo_draw"],
      },
      {
        distance: "mid",
        description: "Hero is in middle position — one villain behind. Betting puts you between two opponents.",
        lesson: "Sandwich position is the worst spot multiway. Tighten up drastically.",
        hands: ["top_pair_top_kicker", "overpair"],
      },
      {
        distance: "far",
        description: "Four-way pot with a marginal hand — middle-strength hands are nearly unplayable.",
        lesson: "In multiway pots, marginal hands are death. You need real goods or real draws. The middle is a trap.",
        hands: ["middle_pair", "top_pair_weak_kicker"],
      },
    ],
  },
};

// ═══════════════════════════════════════════════════════
// FLOP TEXTURE PROTOTYPES
// ═══════════════════════════════════════════════════════

const FLOP_TEXTURE_PROTOTYPES: Partial<Record<ArchetypeId, ArchetypePrototype>> = {

  // ─── Ace-High Dry Rainbow ────────────────────────────
  ace_high_dry_rainbow: {
    name: "Ace-High Dry",
    concept: "The preflop raiser's dream board — range advantage is enormous.",
    teaching:
      "An ace-high dry rainbow flop is the most range-favorable board for the preflop raiser. " +
      "Your range is loaded with aces, broadway hands, and overpairs. Villain's range — " +
      "especially from the blinds — has far fewer aces. This is where high-frequency, " +
      "small-sizing c-bets print money. You bet almost everything because the board itself " +
      "does the work.",
    feeling: "I own this board. Even with nothing, a small bet folds out most of their range. The ace does my job for me.",
    prototypeHands: ["overcards", "top_pair_top_kicker", "overpair"],
    acceptableHands: [
      "overcards", "top_pair_top_kicker", "top_pair_weak_kicker",
      "overpair", "middle_pair", "flush_draw", "air", "sets_plus",
    ],
    preferInPosition: true,
    derivatives: [
      {
        distance: "near",
        description: "Hero has AK on A-7-2 — the clearest value c-bet on the clearest board.",
        lesson: "Top pair top kicker on a dry ace-high board is the most standard bet in poker.",
        hands: ["top_pair_top_kicker"],
      },
      {
        distance: "mid",
        description: "Hero has KQ with no pair — still c-betting because the board favors our range.",
        lesson: "On ace-high boards, even air c-bets profitably. It's about range, not hand.",
        hands: ["overcards", "air"],
      },
      {
        distance: "far",
        description: "Hero has a small pocket pair (66) — technically middle pair but vulnerable multiway.",
        lesson: "Small pairs on ace-high boards are awkward. You have showdown value but can't stand heat.",
        hands: ["middle_pair", "bottom_pair"],
      },
    ],
  },

  // ─── K/Q-High Dry Rainbow ────────────────────────────
  kq_high_dry_rainbow: {
    name: "K/Q-High Dry",
    concept: "Strong range advantage but less extreme than ace-high. Villain has more equity.",
    teaching:
      "King-high and queen-high dry boards still favor the preflop raiser, but the advantage " +
      "is smaller. Villain's calling range connects with kings and queens more than you'd think " +
      "— KT, QJ, suited kings are all in their range. You still c-bet frequently but need to " +
      "respect that villain can have top pair more often.",
    feeling: "I'm ahead of their range, but not as far ahead as on an ace-high board. I c-bet, but I'm sizing up slightly and prepared to face resistance.",
    prototypeHands: ["top_pair_top_kicker", "overpair", "overcards"],
    acceptableHands: [
      "top_pair_top_kicker", "top_pair_weak_kicker", "overpair",
      "overcards", "middle_pair", "flush_draw", "straight_draw",
      "air", "sets_plus",
    ],
    preferInPosition: true,
    derivatives: [
      {
        distance: "near",
        description: "Hero has AK on K-8-3 — top pair, top kicker, dry board. Clear value bet.",
        lesson: "TPTK on K-high dry is strong but not invulnerable. Size for value and protection.",
        hands: ["top_pair_top_kicker"],
      },
      {
        distance: "mid",
        description: "Hero has AJ on Q-7-2 — two overcards, no pair. C-bet as a semi-bluff.",
        lesson: "Overcards on K/Q-high boards have more equity than on ace-high. Six outs to improve.",
        hands: ["overcards"],
      },
      {
        distance: "far",
        description: "Hero has 99 on K-8-3 — underpair to the king. Tougher spot than overpair.",
        lesson: "Pocket pairs below the top card face a tough decision. Check-back for pot control is often correct.",
        hands: ["middle_pair"],
      },
    ],
  },

  // ─── Mid/Low Dry Rainbow ─────────────────────────────
  mid_low_dry_rainbow: {
    name: "Mid/Low Dry",
    concept: "Villain's range actually hits these boards. Raiser advantage shrinks significantly.",
    teaching:
      "Low and mid-card dry boards — think 8-5-2, 7-4-3 — are where the preflop raiser's " +
      "range advantage disappears. Villain's calling range from the blinds is full of suited " +
      "connectors and small pairs that love these boards. You still have overpairs, but villain " +
      "has sets, two pair, and pair + draw combos. C-bet frequency drops. Sizing changes. " +
      "This is where 'auto c-bet everything' players get punished.",
    feeling: "This board didn't help me. My big cards are overcards, and villain's range hit hard. I need to be selective.",
    prototypeHands: ["overpair", "overcards", "top_pair_top_kicker"],
    acceptableHands: [
      "overpair", "overcards", "top_pair_top_kicker", "top_pair_weak_kicker",
      "middle_pair", "air", "flush_draw", "straight_draw", "sets_plus",
    ],
    preferInPosition: true,
    derivatives: [
      {
        distance: "near",
        description: "Hero has AA on 7-4-2 — overpair but the board favors villain's range.",
        lesson: "Even aces need to bet carefully on low boards. Your hand is strong but your range is weak here.",
        hands: ["overpair"],
      },
      {
        distance: "mid",
        description: "Hero has AK — complete air on this board. Overcards only.",
        lesson: "On low boards, AK is essentially a bluff. The c-bet works less often here.",
        hands: ["overcards"],
      },
      {
        distance: "far",
        description: "Hero has TT on 8-5-2 — overpair but not a huge one. Vulnerable.",
        lesson: "Medium overpairs on low boards are the definition of 'way ahead or way behind.'",
        hands: ["overpair"],
      },
    ],
  },

  // ─── Paired Boards ───────────────────────────────────
  paired_boards: {
    name: "Paired Boards",
    concept: "Nobody hits these boards hard. The pair reduces combos and creates a unique dynamic.",
    teaching:
      "When the flop comes paired — like 9-9-4 or K-K-7 — both ranges mostly whiff. The pair " +
      "eats up combos: there are only 3 remaining nines instead of 6 potential pairings. This " +
      "creates a situation where small c-bets at high frequency work because villain rarely has " +
      "trips or better. But when they do have it, they have you crushed. The key insight: " +
      "c-bet small with your whole range, but be ready to give up if raised.",
    feeling: "Nobody has the nine. I'll bet small because they can't call often, but if they raise, I believe them.",
    prototypeHands: ["overcards", "overpair", "top_pair_top_kicker"],
    acceptableHands: [
      "overcards", "overpair", "top_pair_top_kicker", "middle_pair",
      "air", "bottom_pair", "sets_plus",
    ],
    preferInPosition: true,
    derivatives: [
      {
        distance: "near",
        description: "Hero has an overpair on a low paired board (7-7-3). Best hand in range that isn't trips.",
        lesson: "Overpairs on paired boards are gold. You beat every one-pair hand and most of villain's range.",
        hands: ["overpair"],
      },
      {
        distance: "mid",
        description: "Hero has ace-high on K-K-4 — you don't have a king, and neither does villain usually.",
        lesson: "Ace-high is often good enough to win at showdown on paired boards. Small bet to deny equity.",
        hands: ["overcards"],
      },
      {
        distance: "far",
        description: "Hero has pocket trips — you flopped the nuts.",
        lesson: "With trips on a paired board, slow-play is often best. Let villain bluff or catch up.",
        hands: ["sets_plus"],
      },
    ],
  },

  // ─── Two-Tone Disconnected ───────────────────────────
  two_tone_disconnected: {
    name: "Two-Tone Disconnected",
    concept: "Flush draws exist but straight draws don't. Navigate the single draw dimension.",
    teaching:
      "A two-tone disconnected board — like A♠8♠4♦ — has one draw available: the flush draw. " +
      "No straight draws, no wrap possibilities. This simplifies the game tree: villain either " +
      "has a flush draw or they don't. If they do, they'll check-call or check-raise. If they " +
      "don't, they're playing made hands. Your c-bet sizing should charge the draw: 50-66% pot " +
      "forces flush draws to pay too much.",
    feeling: "There's one draw out there. I size my bet to charge it. If they call, I know what they likely have.",
    prototypeHands: ["top_pair_top_kicker", "overpair", "flush_draw"],
    acceptableHands: [
      "top_pair_top_kicker", "top_pair_weak_kicker", "overpair",
      "flush_draw", "combo_draw", "overcards", "middle_pair",
      "air", "sets_plus",
    ],
    preferInPosition: true,
    derivatives: [
      {
        distance: "near",
        description: "Hero has top pair + the nut flush draw — dominating both value and draw categories.",
        lesson: "When you have the best made hand AND the best draw, you're freerolling. Bet for value and protection.",
        hands: ["top_pair_top_kicker", "flush_draw", "combo_draw"],
      },
      {
        distance: "mid",
        description: "Hero has a naked flush draw — no pair, no straight draw. Pure draw.",
        lesson: "Naked flush draws are the classic semi-bluff. You bet with equity and fold equity combined.",
        hands: ["flush_draw"],
      },
      {
        distance: "far",
        description: "Hero has a made hand with no flush draw — if the flush completes, you're done.",
        lesson: "Without the flush draw, your hand is vulnerable to exactly one thing. Plan for the turn.",
        hands: ["top_pair_top_kicker", "overpair"],
      },
    ],
  },

  // ─── Two-Tone Connected ──────────────────────────────
  two_tone_connected: {
    name: "Two-Tone Connected",
    concept: "Maximum draw availability. Both flushes and straights are in play.",
    teaching:
      "This is the wettest common board type — like J♠9♠7♦. Flush draws AND straight draws " +
      "AND combo draws are all possible. Both ranges connect heavily. This is where poker gets " +
      "complex: villain has too many possible hands to discount. C-bet frequency drops, sizing " +
      "goes up, and position matters enormously. You need a real hand or a real draw to continue.",
    feeling: "This board is a war zone. Everyone has a piece or a draw. I need real equity to play for stacks.",
    prototypeHands: ["overpair", "top_pair_top_kicker", "combo_draw"],
    acceptableHands: [
      "overpair", "top_pair_top_kicker", "top_pair_weak_kicker",
      "combo_draw", "flush_draw", "straight_draw", "two_pair",
      "sets_plus", "middle_pair",
    ],
    preferInPosition: true,
    derivatives: [
      {
        distance: "near",
        description: "Hero has an overpair with a backdoor flush draw — strong made hand with redraw potential.",
        lesson: "On wet boards, the best hands have both made-hand strength and draw equity.",
        hands: ["overpair"],
      },
      {
        distance: "mid",
        description: "Hero has a combo draw (flush + straight draw) — no made hand but massive equity.",
        lesson: "Combo draws on wet boards have 40-55% equity against top pair. Play them aggressively.",
        hands: ["combo_draw"],
      },
      {
        distance: "far",
        description: "Hero has top pair weak kicker, no draw — vulnerable to everything.",
        lesson: "TPWK on wet connected boards is a marginal hand. Often better to check and control the pot.",
        hands: ["top_pair_weak_kicker"],
      },
    ],
  },

  // ─── Monotone ────────────────────────────────────────
  monotone: {
    name: "Monotone",
    concept: "Three cards of one suit. The flush dominates all decision-making.",
    teaching:
      "When the flop comes all one suit — like A♠8♠4♠ — the flush is the elephant in the room. " +
      "Anyone with two spades has a made flush. Anyone with one spade has a draw. Anyone with " +
      "no spades is in trouble. C-bet frequency plummets because even strong hands like overpairs " +
      "are vulnerable to a single card. The range advantage shifts toward the caller, who has " +
      "more suited combos than the raiser.",
    feeling: "Do I have a spade? That's the first question. If no, I'm checking and praying. If yes, I'm deciding how to play my draw or my made flush.",
    prototypeHands: ["flush_draw", "sets_plus", "overpair"],
    acceptableHands: [
      "flush_draw", "sets_plus", "overpair", "top_pair_top_kicker",
      "combo_draw", "two_pair", "air",
    ],
    preferInPosition: true,
    derivatives: [
      {
        distance: "near",
        description: "Hero has the nut flush draw (A♠ in hand) — the best draw on the best draw board.",
        lesson: "The nut flush draw on a monotone board is almost never folding. You have the draw to the nuts.",
        hands: ["flush_draw"],
      },
      {
        distance: "mid",
        description: "Hero has an overpair with no flush card — strong made hand, but terrified of one suit.",
        lesson: "Overpairs without a flush card on monotone boards are much weaker than they look. Check often.",
        hands: ["overpair"],
      },
      {
        distance: "far",
        description: "Hero has a small flush already made — but is it the nuts? If someone has a bigger one...",
        lesson: "Made non-nut flushes on monotone flops must be careful. The nut flush draw is always lurking.",
        hands: ["sets_plus"],
      },
    ],
  },

  // ─── Rainbow Connected ───────────────────────────────
  rainbow_connected: {
    name: "Rainbow Connected",
    concept: "No flush draws, but straights and two-pairs are everywhere.",
    teaching:
      "A rainbow connected board — like T♠8♦7♣ — removes flush draws but loads up on straight " +
      "draws and two-pair combos. Villain's calling range from the blinds is packed with " +
      "suited connectors and one-gappers that smash this board. The raiser's range advantage " +
      "is small. C-bet selectively, and when you do bet, size up because villain's range has " +
      "too much equity to let them see cheap cards.",
    feeling: "This board screams 'connectors.' Villain's range loves this. I need to have it or have a big draw.",
    prototypeHands: ["overpair", "top_pair_top_kicker", "straight_draw"],
    acceptableHands: [
      "overpair", "top_pair_top_kicker", "straight_draw",
      "two_pair", "sets_plus", "combo_draw", "middle_pair",
      "top_pair_weak_kicker",
    ],
    preferInPosition: true,
    derivatives: [
      {
        distance: "near",
        description: "Hero has JJ on T-8-7 — overpair above the connected cards. Strong but draws are scary.",
        lesson: "Overpairs above connected boards need to bet for protection. A free card is dangerous.",
        hands: ["overpair"],
      },
      {
        distance: "mid",
        description: "Hero has 96 — an open-ended straight draw fitting the board's connectivity.",
        lesson: "Straight draws on connected boards are the natural semi-bluff. The board supports your story.",
        hands: ["straight_draw"],
      },
      {
        distance: "far",
        description: "Hero has AK — overcards that completely missed a connected board.",
        lesson: "AK on connected rainbow boards is mostly a check. The board doesn't favor your range.",
        hands: ["overcards"],
      },
    ],
  },
};

// ═══════════════════════════════════════════════════════
// PREFLOP PROTOTYPES
// ═══════════════════════════════════════════════════════

const PREFLOP_PROTOTYPES: Partial<Record<ArchetypeId, ArchetypePrototype>> = {

  // ─── RFI Opening ─────────────────────────────────────
  rfi_opening: {
    name: "Raise First In",
    concept: "Open-raising when folded to you — position determines range width.",
    teaching:
      "Raise First In is the foundation of preflop strategy. When everyone folds to you, " +
      "you're deciding whether to open. The key insight: your range gets wider as you get " +
      "closer to the button. From UTG, you play tight — premium pairs, big aces, suited " +
      "broadways. From the button, you open wide — any suited ace, suited connectors, " +
      "most broadways. Position is the license to play more hands.",
    feeling: "Folded to me. Where am I sitting? That tells me how wide I can go.",
    prototypeHands: [
      "overcards", "top_pair_top_kicker", "overpair",
    ],
    acceptableHands: [
      "overcards", "top_pair_top_kicker", "overpair",
      "middle_pair", "flush_draw", "straight_draw", "air",
    ],
    derivatives: [
      {
        distance: "near",
        description: "UTG with AKo — clear open from any position. Premium hand.",
        lesson: "Some hands are opens from every seat. Know your always-open list.",
      },
      {
        distance: "mid",
        description: "CO with J9s — suited connector, playable in late position only.",
        lesson: "Suited connectors are position-dependent. The same hand is a fold UTG and an open on the CO.",
      },
      {
        distance: "far",
        description: "BTN with K2s — the margins of a BTN opening range.",
        lesson: "On the button, even weak suited kings can be opens. Position gives you a massive edge postflop.",
      },
    ],
  },

  // ─── BB Defense ──────────────────────────────────────
  bb_defense_vs_rfi: {
    name: "BB Defense",
    concept: "Defending the big blind — you already have money in, now decide how to protect it.",
    teaching:
      "You posted the big blind and someone raised. You're getting a discount — you already " +
      "put 1BB in, so calling costs less relative to the pot. This means your defending range " +
      "is wider than you'd think. But you're out of position for the rest of the hand, so the " +
      "hands you defend with need to play well postflop: suited hands, connected hands, pairs " +
      "that can set-mine.",
    feeling: "I'm getting a discount, and I already have money in. Can this hand play postflop from out of position? If yes, I defend.",
    prototypeHands: ["overcards", "middle_pair", "flush_draw"],
    acceptableHands: [
      "overcards", "middle_pair", "flush_draw", "straight_draw",
      "top_pair_top_kicker", "overpair", "air",
    ],
    preferredPosition: "bb",
    preferInPosition: false,
    derivatives: [
      {
        distance: "near",
        description: "Facing a BTN open with 87s — connected suited hand, great postflop playability.",
        lesson: "Suited connectors are ideal BB defends: they flop draws and two pairs that win big pots.",
      },
      {
        distance: "mid",
        description: "Facing a UTG open with KTo — offsuit broadway. Tighter fold against early position.",
        lesson: "BB defense range shrinks against earlier position opens. UTG raises are stronger.",
      },
      {
        distance: "far",
        description: "Facing a BTN open with T4s — suited but disconnected. The margins of defense.",
        lesson: "At the edges, suitedness is the tiebreaker. T4s can flop a flush draw; T4o is a fold.",
      },
    ],
  },

  // ─── 3-Bet Pots ──────────────────────────────────────
  three_bet_pots: {
    name: "3-Bet Pots",
    concept: "Re-raising a raiser — polarized between premiums and bluffs.",
    teaching:
      "When someone raises and you raise again (3-bet), you're making a strong statement. " +
      "In modern poker, 3-bet ranges are polarized: premium hands (QQ+, AK) for value, and " +
      "selected bluffs (suited aces, suited connectors) that play well if called. The " +
      "middle — hands like AJo, KQo — often just call. The 3-bet says: 'I either have you " +
      "crushed or I have a hand that can outplay you postflop.'",
    feeling: "They raised. I'm re-raising because I either dominate them or I have a hand with great playability and blockers.",
    prototypeHands: ["overpair", "top_pair_top_kicker", "overcards"],
    acceptableHands: [
      "overpair", "top_pair_top_kicker", "overcards",
      "flush_draw", "air",
    ],
    preferInPosition: true,
    derivatives: [
      {
        distance: "near",
        description: "BTN 3-bets CO open with KK — pure value. Want to get money in preflop.",
        lesson: "Premium pairs are always value 3-bets. Position makes them even better.",
      },
      {
        distance: "mid",
        description: "SB 3-bets BTN open with A5s — a bluff 3-bet with a blocker and suitedness.",
        lesson: "A5s is the classic bluff 3-bet: blocks AA/AK, and when called, can flop the nut flush draw.",
      },
      {
        distance: "far",
        description: "BB 3-bets UTG open with 87s — aggressive bluff 3-bet against a strong range.",
        lesson: "3-bet bluffing against early position requires a tighter threshold. Their calling range crushes you.",
      },
    ],
  },

  // ─── Blind vs Blind ──────────────────────────────────
  blind_vs_blind: {
    name: "Blind vs Blind",
    concept: "Wide ranges collide — both players have near-random holdings.",
    teaching:
      "When it folds to the small blind, the pot is tiny and both players have wide ranges. " +
      "SB opens very wide (often 50%+ of hands). BB defends very wide. This creates a " +
      "unique dynamic: both players have weak ranges, so postflop aggression matters more " +
      "than hand strength. Position (SB has it postflop) and aggression win these pots. " +
      "It's the most 'poker' of all preflop spots.",
    feeling: "We both have random hands. This is about who plays their position better and who applies pressure at the right time.",
    prototypeHands: ["overcards", "middle_pair", "air"],
    acceptableHands: [
      "overcards", "middle_pair", "air", "top_pair_top_kicker",
      "flush_draw", "straight_draw", "bottom_pair",
    ],
    preferredPosition: "sb",
    preferInPosition: true,
    derivatives: [
      {
        distance: "near",
        description: "SB opens K8o — offsuit king, typical wide SB open. Playable with position.",
        lesson: "In BvB, position lets you open hands you'd never play elsewhere.",
      },
      {
        distance: "mid",
        description: "SB opens 63s — at the bottom of the opening range. Suitedness is the only thing making this playable.",
        lesson: "Even weak suited hands can be opens in BvB. The pot is small and BB folds often enough.",
      },
      {
        distance: "far",
        description: "BB defends with J3o — the very bottom of the defending range.",
        lesson: "BB can defend very wide due to pot odds, but the worst hands play terribly postflop. Know where to draw the line.",
      },
    ],
  },

  // ─── 4-Bet / 5-Bet ──────────────────────────────────
  four_bet_five_bet: {
    name: "4-Bet / 5-Bet",
    concept: "Maximum aggression preflop — stacks are on the line.",
    teaching:
      "When someone 3-bets and you raise again (4-bet), you're putting 20-30% of stacks in " +
      "preflop. This is premium territory. 4-bet ranges are extremely tight: AA, KK, QQ, AK " +
      "for value, and a small number of bluffs (usually A5s-A2s). 5-bets are essentially " +
      "all-in. At this level, hand reading is simple: they almost always have a premium. " +
      "The question is whether your premium is better than theirs.",
    feeling: "They 3-bet, and I'm coming back. I either have a monster or I'm making a calculated bluff with blockers. There's no middle ground.",
    prototypeHands: ["overpair", "top_pair_top_kicker"],
    acceptableHands: [
      "overpair", "top_pair_top_kicker", "overcards",
    ],
    preferInPosition: true,
    derivatives: [
      {
        distance: "near",
        description: "4-bet with AA — the dream. Want maximum action.",
        lesson: "AA is always a 4-bet for value. The only question is sizing: bigger OOP, smaller IP.",
      },
      {
        distance: "mid",
        description: "4-bet with AKo — premium but not a pair. Racing against QQ-JJ.",
        lesson: "AK is a mandatory 4-bet but plays differently than pairs. You're either dominating or racing.",
      },
      {
        distance: "far",
        description: "4-bet bluff with A5s — blocker to AA, can flop nut flush draw if called.",
        lesson: "The best 4-bet bluffs block villain's value range. A5s blocks AA and AK.",
      },
    ],
  },
};

// ═══════════════════════════════════════════════════════
// COMBINED REGISTRY + API
// ═══════════════════════════════════════════════════════

const ALL_PROTOTYPES: Partial<Record<ArchetypeId, ArchetypePrototype>> = {
  ...PREFLOP_PROTOTYPES,
  ...FLOP_TEXTURE_PROTOTYPES,
  ...POSTFLOP_PROTOTYPES,
};

/**
 * Get the prototype definition for an archetype.
 * Returns undefined for archetypes without defined prototypes.
 */
export function getPrototype(archetypeId: ArchetypeId): ArchetypePrototype | undefined {
  return ALL_PROTOTYPES[archetypeId];
}

/**
 * Get all defined archetype prototypes.
 */
export function getAllPrototypes(): Partial<Record<ArchetypeId, ArchetypePrototype>> {
  return ALL_PROTOTYPES;
}

/**
 * Get the prototype hand categories for an archetype.
 * Returns the prototype hands (strictest match) first,
 * then acceptable hands as fallback.
 */
export function getPrototypeHands(archetypeId: ArchetypeId): {
  prototype: HandCategory[];
  acceptable: HandCategory[];
} | undefined {
  const proto = ALL_PROTOTYPES[archetypeId];
  if (!proto) return undefined;
  return {
    prototype: proto.prototypeHands,
    acceptable: proto.acceptableHands,
  };
}

/**
 * Get teaching content for an archetype prototype.
 */
export function getTeachingContent(archetypeId: ArchetypeId): {
  name: string;
  concept: string;
  teaching: string;
  feeling: string;
  derivatives: DerivativeShift[];
} | undefined {
  const proto = ALL_PROTOTYPES[archetypeId];
  if (!proto) return undefined;
  return {
    name: proto.name,
    concept: proto.concept,
    teaching: proto.teaching,
    feeling: proto.feeling,
    derivatives: proto.derivatives,
  };
}
