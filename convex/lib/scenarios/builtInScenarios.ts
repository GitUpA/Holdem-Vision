/**
 * Built-in scenario library — classic poker spots for learning.
 *
 * Each scenario is an AnalysisContext snapshot with teaching metadata.
 * Uses card string notation: rank + suit (e.g., "As" = Ace of spades).
 */
import { cardsFromStrings } from "../primitives/card";

export interface ScenarioSeed {
  title: string;
  category: string;
  difficulty: string;
  heroCards: number[];
  communityCards: number[];
  street: string;
  lesson: string;
  tags: string[];
}

export const BUILT_IN_SCENARIOS: ScenarioSeed[] = [
  // ─── Board Texture Dangers ───
  {
    title: "Overpair on a Wet Board",
    category: "board_texture",
    difficulty: "intermediate",
    heroCards: cardsFromStrings(["Qh", "Qs"]),
    communityCards: cardsFromStrings(["9s", "8s", "7d"]),
    street: "flop",
    lesson:
      "Queens look strong, but this board connects with many hands. Any T makes a straight, any spade threatens a flush, and 6 or J extend straight draws. Your overpair is vulnerable to a wide range of draws.",
    tags: ["wet_board", "overpair", "straight_draw", "flush_draw"],
  },
  {
    title: "Top Pair on a Monotone Flop",
    category: "board_texture",
    difficulty: "intermediate",
    heroCards: cardsFromStrings(["Ah", "Kd"]),
    communityCards: cardsFromStrings(["Ks", "9s", "4s"]),
    street: "flop",
    lesson:
      "You flopped top pair top kicker, but three spades on the board means anyone with two spades already has a flush. Even one spade gives a draw. Your strong pair is devalued by the monotone texture.",
    tags: ["monotone", "top_pair", "flush_complete", "board_texture"],
  },
  {
    title: "The Board Plays You — Broadway Straight",
    category: "board_texture",
    difficulty: "beginner",
    heroCards: cardsFromStrings(["Kh", "Kd"]),
    communityCards: cardsFromStrings(["As", "Qd", "Jh", "Tc"]),
    street: "turn",
    lesson:
      "You have pocket Kings, but the board shows A-Q-J-T. Any opponent with a K has the same straight you do. Worse, anyone with a K has you tied, and you can't improve. The board is playing itself.",
    tags: ["board_plays_itself", "overpair", "straight_on_board"],
  },
  {
    title: "Set on a Four-Flush Board",
    category: "board_texture",
    difficulty: "advanced",
    heroCards: cardsFromStrings(["7h", "7d"]),
    communityCards: cardsFromStrings(["7s", "Ts", "3s", "Qs"]),
    street: "turn",
    lesson:
      "You flopped a set of sevens — normally a monster. But four spades on the board means any single spade in an opponent's hand makes a flush that beats your set. You need the board to pair on the river to make a full house.",
    tags: ["set", "four_flush", "drawing_to_full_house", "board_texture"],
  },

  // ─── Coolers ───
  {
    title: "Set Over Set",
    category: "cooler",
    difficulty: "advanced",
    heroCards: cardsFromStrings(["Jh", "Jd"]),
    communityCards: cardsFromStrings(["Jc", "Ks", "Kd"]),
    street: "flop",
    lesson:
      "You flopped a set of Jacks on a K-K-J board. This is an incredibly strong hand. But if an opponent holds K-x, they have a bigger set (trip Kings). This is a classic cooler — a spot where you'll likely lose a big pot through no fault of your own.",
    tags: ["set_over_set", "cooler", "full_house"],
  },
  {
    title: "AA vs KK Preflop",
    category: "cooler",
    difficulty: "beginner",
    heroCards: cardsFromStrings(["Ah", "As"]),
    communityCards: [],
    street: "preflop",
    lesson:
      "Pocket Aces vs Pocket Kings is the most classic cooler in Hold'em. AA is ~82% to win. Both hands are premium and getting all-in preflop is standard — when you're on the wrong side of it, it's just variance.",
    tags: ["cooler", "premium_pair", "preflop"],
  },

  // ─── Drawing Situations ───
  {
    title: "Nut Flush Draw + Overcards",
    category: "drawing",
    difficulty: "beginner",
    heroCards: cardsFromStrings(["Ah", "Kh"]),
    communityCards: cardsFromStrings(["9h", "5h", "2d"]),
    street: "flop",
    lesson:
      "You missed the flop but have a powerful draw: the nut flush draw (9 outs) plus two overcards (6 more outs to top pair). With ~15 outs, you're roughly a coin flip against most made hands. This is a semi-bluffing spot.",
    tags: ["flush_draw", "overcards", "semi_bluff", "drawing"],
  },
  {
    title: "Open-Ended Straight Draw",
    category: "drawing",
    difficulty: "beginner",
    heroCards: cardsFromStrings(["Jh", "Td"]),
    communityCards: cardsFromStrings(["9c", "8s", "2h"]),
    street: "flop",
    lesson:
      "J-T on a 9-8 board gives you an open-ended straight draw. Any Q or 7 completes your straight (8 outs). With the rule of 4, you have roughly 32% equity with two cards to come. A strong draw to play aggressively.",
    tags: ["oesd", "straight_draw", "drawing"],
  },
  {
    title: "Combo Draw — Flush + Straight",
    category: "drawing",
    difficulty: "intermediate",
    heroCards: cardsFromStrings(["Jh", "Th"]),
    communityCards: cardsFromStrings(["9h", "8d", "2h"]),
    street: "flop",
    lesson:
      "This is a monster draw. You have a flush draw (9 outs) AND an open-ended straight draw (additional 6 non-heart Q/7 outs). With ~15 outs, you're actually a slight favorite against most one-pair hands. Combo draws are often played like made hands.",
    tags: ["combo_draw", "flush_draw", "oesd", "drawing"],
  },

  // ─── Tricky Spots ───
  {
    title: "Two Pair on a Paired Board",
    category: "tricky",
    difficulty: "intermediate",
    heroCards: cardsFromStrings(["Ah", "9d"]),
    communityCards: cardsFromStrings(["As", "9s", "9c"]),
    street: "flop",
    lesson:
      "You have Aces full of Nines — a monster full house. But the board is A-9-9 with two spades. While you're extremely strong, be aware that an opponent with pocket Aces has a bigger full house (Aces full of Aces via quads). Also, anyone with a 9 has trip Nines and is drawing slim.",
    tags: ["full_house", "paired_board", "tricky"],
  },
  {
    title: "Top Pair Facing River Overcard",
    category: "tricky",
    difficulty: "beginner",
    heroCards: cardsFromStrings(["Kd", "Qh"]),
    communityCards: cardsFromStrings(["Qd", "7c", "3s", "2h", "As"]),
    street: "river",
    lesson:
      "You had top pair (Queens) through the flop and turn. The river brought an Ace — the worst card for you. Any opponent with an Ace now has you beat. This is a classic spot where your hand went from strong to marginal on one card.",
    tags: ["overcard", "river_scare_card", "top_pair", "tricky"],
  },
  {
    title: "Underpair on Dry Board",
    category: "tricky",
    difficulty: "beginner",
    heroCards: cardsFromStrings(["Tc", "Td"]),
    communityCards: cardsFromStrings(["Ks", "7d", "2c"]),
    street: "flop",
    lesson:
      "Tens on a K-7-2 rainbow board. The board is dry (few draws), which is good for your hand. But any opponent with a King has you crushed. Your pocket pair is likely the best hand against unpaired holdings but loses to any Kx. Read your opponent's actions carefully.",
    tags: ["underpair", "dry_board", "positional"],
  },

  // ─── Value vs. Danger ───
  {
    title: "Flopped Flush — But Is It the Nut Flush?",
    category: "value_vs_danger",
    difficulty: "advanced",
    heroCards: cardsFromStrings(["Jh", "8h"]),
    communityCards: cardsFromStrings(["Kh", "6h", "3h"]),
    street: "flop",
    lesson:
      "You flopped a flush! But it's the Jack-high flush, not the nut flush. An opponent with Ah-Xh or Qh-Xh has you drawing dead. When the board is monotone and action is heavy, consider that better flushes exist. The Kh on board means Ah is the only one-card flush that dominates you.",
    tags: ["non_nut_flush", "flush", "value_vs_danger"],
  },
  {
    title: "Pocket Aces on a Completed Board",
    category: "value_vs_danger",
    difficulty: "intermediate",
    heroCards: cardsFromStrings(["Ac", "Ad"]),
    communityCards: cardsFromStrings(["8s", "9s", "Ts", "Js"]),
    street: "turn",
    lesson:
      "Pocket Aces, the best starting hand, but the board shows 8-9-T-J all spades. Any opponent with a single spade has a flush. Any Qx has a straight. Even 7x makes a straight. Your Aces are an underpair to nothing on the board and beaten by countless holdings. Position and opponent tendencies are everything here.",
    tags: ["overpair_devalued", "four_straight", "four_flush", "value_vs_danger"],
  },
];
