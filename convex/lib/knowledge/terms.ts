/**
 * Knowledge Base — Poker term & concept definitions
 *
 * Core poker vocabulary and strategy concepts referenced throughout the UI.
 */

import type { KnowledgeEntry } from "./types";
import { registerKnowledge } from "./registry";

const TERMS: KnowledgeEntry[] = [
  {
    id: "term:equity",
    category: "term",
    name: "Equity",
    short: "Your share of the pot based on win probability",
    medium:
      "Equity is the percentage of the pot you'd win on average if all remaining cards were dealt. A hand with 60% equity 'owns' 60% of the current pot.",
    full:
      "Equity represents your hand's share of the pot based on how often it would win if all remaining community cards were dealt out. It's calculated by simulating all possible runouts. For example, if you hold AA preflop vs a random hand, you have roughly 85% equity — you'd win 85% of the time. Equity changes on every street as new cards are revealed. Understanding equity is fundamental: you should generally put money in the pot when your equity exceeds your pot share, and fold when it doesn't.",
    related: ["term:pot_odds", "term:fold_equity", "concept:ev"],
  },
  {
    id: "term:pot_odds",
    category: "term",
    name: "Pot Odds",
    short: "Price the pot offers you to call",
    medium:
      "Pot odds compare the cost of a call to the total pot. If you must call $10 into a $30 pot, you're getting 3:1 (25% needed to break even).",
    full:
      "Pot odds express the ratio between the size of the pot and the cost of calling a bet. They tell you the minimum equity you need to profitably call. If the pot is $30 and your opponent bets $10, the total pot is $40 and you need to call $10 — you're getting 4:1 odds, so you need at least 20% equity to call. Compare your pot odds to your equity: if your equity exceeds the required percentage, calling is profitable long-term. Pot odds are the foundation of all calling decisions in poker.",
    related: ["term:equity", "term:implied_odds", "concept:ev"],
  },
  {
    id: "term:fold_equity",
    category: "term",
    name: "Fold Equity",
    short: "Value gained when opponents fold to your bet",
    medium:
      "Fold equity is the extra value you gain from the chance that opponents fold when you bet or raise, allowing you to win the pot without showdown.",
    full:
      "Fold equity is the portion of a bet's expected value that comes from the probability of your opponent folding. When you bet, your total EV comes from two sources: (1) the equity of your hand when called, and (2) the fold equity — the times you win the pot immediately because your opponent folds. Semi-bluffs combine both: you have some hand equity if called, plus fold equity from pressure. Pure bluffs rely entirely on fold equity. Understanding fold equity is critical for bet sizing: bigger bets generate more fold equity but risk more when called.",
    related: ["term:equity", "concept:semi_bluff", "concept:ev"],
  },
  {
    id: "term:implied_odds",
    category: "term",
    name: "Implied Odds",
    short: "Future money you expect to win if you hit",
    medium:
      "Implied odds account for additional money you'll win on later streets if you complete your draw. They justify calling when raw pot odds aren't enough.",
    full:
      "Implied odds extend pot odds by considering the money you expect to win on future streets if you complete your draw. Standard pot odds only look at the current pot, but implied odds factor in the additional bets your opponent will likely pay off. For example, if you're drawing to a flush, you might not have direct pot odds to call — but if your opponent will pay off a big river bet when you hit, the implied odds make the call profitable. Implied odds are higher when: your draw is hidden (opponent can't see it), stacks are deep, and your opponent is likely to pay off (e.g., against fish).",
    related: ["term:pot_odds", "term:equity"],
  },
  {
    id: "concept:ev",
    category: "concept",
    name: "Expected Value (EV)",
    short: "Average profit/loss of a decision long-term",
    medium:
      "EV is the average amount you gain or lose from a decision over many repetitions. Positive EV (+EV) decisions are profitable; negative EV (-EV) decisions lose money.",
    full:
      "Expected Value (EV) is the most important concept in poker. It measures the average profit or loss of any decision if you could repeat it thousands of times. A +EV play makes money long-term even if it loses this particular hand. A -EV play loses money long-term even if it wins sometimes. EV is calculated as: (probability of winning × amount won) - (probability of losing × amount lost). Every poker decision — fold, call, raise — has an EV. GTO strategy maximizes EV against a perfect opponent. The goal isn't to win every hand; it's to consistently make +EV decisions.",
    related: ["term:equity", "term:pot_odds", "concept:gto"],
  },
  {
    id: "concept:gto",
    category: "concept",
    name: "Game Theory Optimal (GTO)",
    short: "Mathematically unexploitable strategy",
    medium:
      "GTO is the balanced strategy where no opponent adjustment can increase their profit. It uses mixed-frequency actions computed by solvers.",
    full:
      "Game Theory Optimal (GTO) strategy is the Nash equilibrium of poker — a balanced approach where no opponent can increase their expected value by deviating from their own optimal strategy. GTO involves mixing actions at mathematically precise frequencies. For example, a solver might recommend betting 60% and checking 40% with a specific hand on a specific board. Neither 'always bet' nor 'always check' would be correct. GTO is the reference baseline in HoldemVision: all coaching profiles are compared against it. While pure GTO is unexploitable, most profit at real tables comes from exploiting opponents' deviations from GTO.",
    related: ["concept:ev", "concept:mixed_strategy", "profile:gto"],
  },
  {
    id: "concept:mixed_strategy",
    category: "concept",
    name: "Mixed Strategy",
    short: "Taking different actions with the same hand at set frequencies",
    medium:
      "A mixed strategy means the solver recommends multiple actions with the same hand. You don't always bet or always check — you mix at specific frequencies.",
    full:
      "A mixed strategy means taking different actions with the same hand at specific frequencies. Unlike a pure strategy ('always bet here'), a mixed strategy might be 'bet 65%, check 35%.' Solvers use mixed strategies to remain balanced and unexploitable. If you always bet with a certain hand, opponents can adjust; mixing prevents this. In drill mode, this is why 'Acceptable' verdicts exist — multiple actions can have solver support. The frequency bars show the mix. You don't need to randomize perfectly in real play, but understanding the mix tells you which actions are reasonable and which are mistakes.",
    related: ["concept:gto", "concept:ev", "feature:frequency_bars"],
  },
  {
    id: "concept:position",
    category: "concept",
    name: "Position",
    short: "Acting last gives an information advantage",
    medium:
      "Position means acting after your opponent. The player in position (IP) sees their opponent's action first, gaining information and control over pot size.",
    full:
      "Position is one of the most important concepts in poker. The player 'in position' (IP) acts after their opponent on every postflop street, while the 'out of position' (OOP) player acts first. IP has a massive advantage: they see their opponent's action before deciding, can control pot size, and realize their equity more efficiently. This is why GTO strategies play wider ranges in position and tighter out of position. In HoldemVision, position affects archetype strategy significantly — the same board texture calls for different actions depending on whether you're IP or OOP.",
    related: ["concept:gto", "concept:board_texture"],
  },
  {
    id: "concept:board_texture",
    category: "concept",
    name: "Board Texture",
    short: "How connected, suited, and paired the community cards are",
    medium:
      "Board texture describes the community cards' characteristics — dry (disconnected, rainbow), wet (draw-heavy), paired, monotone — which dramatically affect optimal strategy.",
    full:
      "Board texture refers to the characteristics of the community cards and how they interact with typical hand ranges. Key texture dimensions include: wetness (how many draws are possible), connectivity (how many straight draws exist), suit distribution (rainbow, two-tone, monotone), and pairing (repeated ranks). Dry boards like A-7-2 rainbow favor the preflop aggressor with small c-bets. Wet boards like J-T-8 with two suits create more checking and larger bet sizes. Understanding board texture is essential because GTO strategy changes dramatically based on it — the same hand plays completely differently on different boards.",
    related: ["concept:board_archetypes", "concept:position"],
  },
  {
    id: "concept:semi_bluff",
    category: "concept",
    name: "Semi-Bluff",
    short: "Betting a draw that can improve to win",
    medium:
      "A semi-bluff is betting or raising with a hand that's not currently the best but has outs to improve (like a flush draw). It combines equity with fold equity.",
    full:
      "A semi-bluff is a bet or raise made with a hand that is likely behind but has significant potential to improve — typically a draw. Unlike a pure bluff (which can only win if the opponent folds), a semi-bluff has two ways to win: the opponent folds immediately (fold equity), or you hit your draw and win at showdown (hand equity). Classic semi-bluffs include flush draws (9 outs), open-ended straight draws (8 outs), and combo draws (12+ outs). Semi-bluffing is a key part of GTO strategy because it balances your betting range — if you only bet strong made hands, opponents could easily fold.",
    related: ["term:fold_equity", "term:equity", "concept:gto"],
  },

  // ═══════════════════════════════════════════════════════
  // TIER 1 — Abbreviations / jargon shown as raw labels
  // ═══════════════════════════════════════════════════════

  {
    id: "term:oesd",
    category: "term",
    name: "OESD (Open-Ended Straight Draw)",
    short: "Four consecutive cards needing one on either end",
    medium:
      "An open-ended straight draw (OESD) means you have four cards in a row and can complete the straight with a card on either end. That gives you 8 outs.",
    full:
      "An open-ended straight draw (OESD) occurs when you hold four consecutive cards and can complete a straight with a card at either end. For example, holding 8-9 on a 6-7-x board — either a 5 or a T completes your straight. With 8 outs, an OESD hits roughly 17% of the time on the next card or 31% by the river. OESDs are strong semi-bluff candidates because of the high out count. Compare to a gutshot (4 outs), which needs a specific rank to fill an inside gap.",
    related: ["term:gutshot", "term:outs", "term:straight_draw", "concept:semi_bluff"],
  },
  {
    id: "term:gutshot",
    category: "term",
    name: "Gutshot (Inside Straight Draw)",
    short: "Straight draw needing one specific middle card",
    medium:
      "A gutshot (or inside straight draw) has a gap in the middle that only one rank can fill. With just 4 outs, it hits less often than an OESD.",
    full:
      "A gutshot straight draw means you need one specific rank to fill an interior gap in your straight. For example, holding 5-7 on a 8-9-x board — only a 6 completes the straight. With 4 outs, a gutshot hits roughly 8.5% on the next card or 17% by the river. Gutshots are weaker draws than OESDs but can be valuable as semi-bluff components, especially in combo draws. They're also more deceptive since opponents are less likely to see the completed straight coming.",
    related: ["term:oesd", "term:outs", "term:straight_draw"],
  },
  {
    id: "term:mdf",
    category: "term",
    name: "MDF (Minimum Defense Frequency)",
    short: "How often you must call to prevent profitable bluffs",
    medium:
      "MDF is the minimum percentage of hands you must continue with (call or raise) to prevent your opponent from profiting with any two cards as a bluff.",
    full:
      "Minimum Defense Frequency (MDF) answers: how often must I call to stop my opponent from profiting with pure bluffs? It's calculated as: pot / (pot + bet). If the pot is 100 and they bet 50, MDF = 100/150 = 67% — you must defend at least 67% of your range. If you fold more than that, your opponent can profitably bluff with any hand. MDF is a defensive concept: it sets the floor for how tight you can be. In practice, you don't need to hit MDF exactly — sometimes you have reads that justify folding more, and sometimes your range is strong enough to defend even more.",
    related: ["term:pot_odds", "term:range", "concept:gto"],
  },
  {
    id: "term:ip_oop",
    category: "term",
    name: "IP / OOP (In Position / Out of Position)",
    short: "IP acts last (advantage); OOP acts first",
    medium:
      "IP (In Position) means you act after your opponent on each street. OOP (Out of Position) means you act first. IP has a significant strategic advantage.",
    full:
      "IP and OOP are abbreviations for In Position and Out of Position. The IP player acts after their opponent on every postflop betting round, giving them the advantage of seeing what the opponent does before deciding. The OOP player acts first, forced to make decisions without knowing their opponent's action. This positional advantage is so significant that GTO strategies play wider ranges IP and tighter OOP. In HoldemVision coaching, you'll see situation labels like 'C-Bet IP' and 'Probe OOP' — these describe how strategy changes based on whether you're acting last or first.",
    related: ["concept:position", "term:cbet", "term:probe"],
  },
  {
    id: "term:cbet",
    category: "term",
    name: "C-Bet (Continuation Bet)",
    short: "Betting the flop after raising preflop",
    medium:
      "A continuation bet (c-bet) is when the preflop raiser bets again on the flop, continuing their aggression regardless of whether the flop helped their hand.",
    full:
      "A continuation bet (c-bet) is a bet made on the flop by the player who was the preflop aggressor (the raiser). It 'continues' the story of strength established preflop. C-betting is one of the most common postflop plays — on dry boards, GTO strategies often c-bet at high frequency with small sizing (1/3 pot) because the preflop raiser's range advantage is large. On wet boards, c-bet frequency drops and sizing increases. In HoldemVision, situation labels like 'C-Bet IP' and 'C-Bet OOP' describe the preflop aggressor's postflop strategy based on position.",
    related: ["concept:position", "term:ip_oop", "concept:board_texture", "term:barrel"],
  },
  {
    id: "term:outs",
    category: "term",
    name: "Outs",
    short: "Cards remaining in the deck that improve your hand",
    medium:
      "Outs are the unseen cards that would improve your hand to a likely winner. More outs means a stronger draw — flush draws have 9 outs, OESDs have 8.",
    full:
      "Outs are the cards left in the deck that would improve your hand to what's likely the best hand. Counting outs is fundamental to draw decisions. Common out counts: flush draw = 9 outs, OESD = 8 outs, gutshot = 4 outs, combo draw = 12-15 outs. The 'rule of 2 and 4' gives a quick probability estimate: multiply outs by 2 for the chance of hitting on the next card, or by 4 for hitting by the river. For example, a flush draw (9 outs) has roughly 18% to hit the turn and 36% to hit by the river. Compare your hit probability to pot odds to decide whether to call.",
    related: ["term:oesd", "term:gutshot", "term:flush_draw", "term:pot_odds"],
  },
  {
    id: "term:rfi",
    category: "term",
    name: "RFI (Raise First In)",
    short: "Being the first player to raise preflop",
    medium:
      "RFI means you're the first player to voluntarily put money in the pot by raising. Your RFI range varies by position — wider in late position, tighter early.",
    full:
      "Raise First In (RFI) means being the first player to open-raise preflop — everyone before you has folded. Your RFI range is the set of hands you open with from each position. From early position (UTG), GTO opens around 15% of hands. From the button, it's closer to 45%. RFI ranges are the foundation of preflop strategy: they determine your starting range for every postflop situation. In HoldemVision drills, the 'RFI Opening' archetype trains you on which hands to open from each seat.",
    related: ["concept:position", "term:range", "term:positions", "term:three_bet"],
  },
  {
    id: "term:three_bet",
    category: "term",
    name: "3-Bet / 4-Bet / 5-Bet",
    short: "Re-raising over a raise (3-bet), or re-re-raising (4-bet+)",
    medium:
      "A 3-bet is a re-raise over an initial raise. A 4-bet re-raises the 3-bet, and a 5-bet re-raises the 4-bet. Each level narrows ranges dramatically.",
    full:
      "In poker betting terminology, the blind is the 1st bet, the open-raise is the 2nd bet (2-bet), and a re-raise over that is the 3rd bet (3-bet). A 4-bet re-raises the 3-bet, and a 5-bet re-raises the 4-bet. With each level, ranges get narrower and pots get larger. 3-bet ranges are typically polarized — they include premium hands (for value) and some bluffs (suited connectors, suited aces). 4-bet ranges are very tight, mostly AA/KK/AK for value plus a few bluffs. 5-bets are almost always all-in with the absolute top of your range. HoldemVision's archetype drills cover 3-bet pot dynamics and 4-bet/5-bet scenarios.",
    related: ["term:rfi", "concept:polarized", "term:range"],
  },
  {
    id: "term:range",
    category: "term",
    name: "Range",
    short: "The set of all hands a player could have",
    medium:
      "A range is the collection of all possible hands a player might hold in a given spot. You don't put opponents on one hand — you assign a range of likely holdings.",
    full:
      "A range is the set of all possible starting hands a player could have based on their actions. Rather than trying to guess the exact two cards an opponent holds, strong players think in ranges — all the hands that are consistent with how the opponent has played. For example, if a tight player raises from early position, their range might be top 12% of hands (pocket pairs 77+, AK, AQ, AJs+). As the hand progresses and they bet or check, you narrow their range further. Range-based thinking is the foundation of poker analysis and the basis for equity calculations in HoldemVision.",
    related: ["term:equity", "concept:gto", "term:rfi"],
  },
  {
    id: "term:overbet",
    category: "term",
    name: "Overbet",
    short: "Betting more than the size of the pot",
    medium:
      "An overbet is a bet larger than the current pot (e.g., 1.5x or 2x pot). It's a polarized play used with very strong hands or bluffs on specific board textures.",
    full:
      "An overbet is a bet that exceeds the current pot size — typically 1.2x to 2x pot or even larger. Overbetting is a polarized strategy: you're either extremely strong (the nuts or near-nuts) or bluffing. Medium-strength hands never overbet because they don't benefit from bloating the pot. Overbets are most effective on boards where the bettor can have many nut hands that the caller can't — for example, when a flush completes on the river and only the bettor's range includes flush draws. In HoldemVision, the 'Overbet River' archetype teaches when GTO strategies use this sizing.",
    related: ["concept:polarized", "term:thin_value", "concept:gto"],
  },
  {
    id: "term:barrel",
    category: "term",
    name: "Barrel (Double/Triple Barrel)",
    short: "Betting multiple streets in a row as the aggressor",
    medium:
      "Barreling means betting on consecutive streets — a 'double barrel' is betting flop then turn, a 'triple barrel' adds the river. It maintains pressure and tells a consistent story.",
    full:
      "Barreling refers to betting on consecutive streets as the aggressor. A single barrel is a c-bet on the flop. A double barrel continues on the turn. A triple barrel fires all three streets. Each barrel narrows both your range and your opponent's calling range. GTO turn barrel strategy depends heavily on the turn card — cards that improve the bettor's range advantage (like an ace on a dry board) are good barrel cards. Cards that help the caller's range (like completing an obvious draw) are good checking cards. In HoldemVision, the 'Turn Barreling' archetype teaches when to continue aggression and when to give up.",
    related: ["term:cbet", "concept:board_texture", "term:ip_oop"],
  },
  {
    id: "term:thin_value",
    category: "term",
    name: "Thin Value",
    short: "Betting a medium-strength hand for value",
    medium:
      "A thin value bet uses a hand that's probably ahead but not by much. You're betting for value against slightly weaker hands while risking being called by better.",
    full:
      "Thin value betting means betting a medium-strength hand that you believe is ahead of your opponent's calling range more than half the time. It's 'thin' because the margin is small — you might have top pair with a weak kicker and believe your opponent calls with worse pairs often enough to profit. Thin value is one of the hardest skills in poker: bet too thin and you lose to better hands; don't bet thin enough and you miss value. GTO strategies bet thinner against calling stations (fish) and less against tight players (nits). The 'Thin Value River' archetype in HoldemVision trains this skill.",
    related: ["term:overbet", "concept:ev", "profile:fish"],
  },
  {
    id: "term:probe",
    category: "term",
    name: "Probe Bet",
    short: "Betting into the preflop raiser when they check",
    medium:
      "A probe bet is when the caller (not the preflop raiser) bets after the aggressor checks. It 'probes' for weakness and can win the pot when the raiser gives up.",
    full:
      "A probe bet occurs when the preflop caller bets into the preflop raiser after the raiser checks (declines to c-bet). When the aggressor checks, they're often giving up on the pot — a probe bet exploits this weakness. Probing is most effective on boards that favor the caller's range (low connected boards, paired boards) where the raiser's c-bet frequency is already low. In HoldemVision situation labels, 'Probe IP' means the caller is in position and probing after the raiser checked out of position.",
    related: ["term:cbet", "term:ip_oop", "concept:position"],
  },
  {
    id: "term:donk_bet",
    category: "term",
    name: "Donk Bet",
    short: "Betting into the preflop raiser before they can act",
    medium:
      "A donk bet is when the preflop caller leads out by betting into the raiser on the flop, rather than checking to them. Traditionally seen as weak play, but GTO uses it on specific boards.",
    full:
      "A donk bet (short for 'donkey bet') is when the out-of-position preflop caller bets into the preflop raiser on the flop, instead of checking to them. Traditionally, this was considered a sign of a weak player — hence 'donk.' However, modern GTO analysis shows donk betting is correct at low frequency on certain boards where the caller's range has a nut advantage (e.g., low paired boards where the caller has more sets). In HoldemVision, 'Check / Donk OOP' is the situation label for the preflop caller's out-of-position options.",
    related: ["term:cbet", "term:ip_oop", "term:probe"],
  },
  {
    id: "concept:polarized",
    category: "concept",
    name: "Polarized",
    short: "A range containing only strong hands and bluffs",
    medium:
      "A polarized range has very strong hands (value) and very weak hands (bluffs) but nothing in between. It's the opposite of a 'merged' or 'linear' range.",
    full:
      "A polarized range consists of two extremes: the very best hands (value) and the very worst hands (bluffs), with no medium-strength hands. When you polarize, you're either betting for value with a hand that beats most of your opponent's range, or bluffing with a hand that has no showdown value. This is contrast to a linear (merged) range that includes strong and medium hands but no bluffs. GTO river strategies are almost always polarized — you either have it or you don't. Understanding polarization helps you interpret opponent behavior: large bets (especially overbets) signal a polarized range.",
    related: ["term:overbet", "term:range", "concept:gto", "concept:mixed_strategy"],
  },
  {
    id: "term:counterfeit",
    category: "term",
    name: "Counterfeit",
    short: "A board card that devalues your made hand",
    medium:
      "Being counterfeited means a new community card makes your hand weaker even though it technically pairs or improves the board. Common with two-pair and low pairs.",
    full:
      "Counterfeiting occurs when a community card devalues your hand by giving opponents a better version of the same hand type. The classic example: you hold 7-6 on a board of 7-6-2, giving you two pair. If the turn is a 2, the board now has a pair of twos — anyone with a single card higher than 7 now has a better two pair (their pair + board's two pair). Your two pair went from strong to nearly worthless. Counterfeiting most commonly affects: small two-pair hands, bottom pair, and sets that get rivered by a higher set. In HoldemVision's threat analysis, 'counterfeit' flags board cards that could devalue your current holding.",
    related: ["term:outs", "concept:board_texture"],
  },

  // ═══════════════════════════════════════════════════════
  // TIER 2 — Analysis panel terms
  // ═══════════════════════════════════════════════════════

  {
    id: "term:flush_draw",
    category: "term",
    name: "Flush Draw",
    short: "Four cards of the same suit, needing one more",
    medium:
      "A flush draw means you have four cards of the same suit and need one more to complete a flush. With 9 outs, it's one of the strongest draws.",
    full:
      "A flush draw occurs when you have four cards of the same suit — typically two in your hand and two on the board (or one in hand and three on board). You need one more card of that suit to complete a flush. With 9 outs (13 cards of each suit minus the 4 you see), a flush draw hits roughly 19% on the next card and 35% by the river. Flush draws are premium semi-bluffing hands because of the high out count and the strength of the completed hand. A 'nut flush draw' (holding the ace of the suit) is the strongest version since no higher flush is possible.",
    related: ["term:outs", "concept:semi_bluff", "term:combo_draw", "term:backdoor_draw"],
  },
  {
    id: "term:straight_draw",
    category: "term",
    name: "Straight Draw",
    short: "Cards that could make a straight with one more card",
    medium:
      "A straight draw means you're one card away from completing a five-card straight. OESDs (8 outs) are stronger than gutshots (4 outs).",
    full:
      "A straight draw means you need one more card to complete a five-card straight. There are two main types: an open-ended straight draw (OESD) where either end completes it (8 outs), and a gutshot where you need one specific rank to fill an interior gap (4 outs). Straight draws are common semi-bluff candidates. Key consideration: a straight can be 'dominated' if the board also allows a flush — making your straight the second-best hand even when it hits. In HoldemVision's draw analysis, straight draws are shown with out counts and hit probabilities.",
    related: ["term:oesd", "term:gutshot", "term:outs", "term:combo_draw"],
  },
  {
    id: "term:combo_draw",
    category: "term",
    name: "Combo Draw",
    short: "A flush draw and straight draw combined",
    medium:
      "A combo draw combines a flush draw and a straight draw in the same hand. With 12-15 outs, combo draws are often favorites even against made hands.",
    full:
      "A combo draw is a hand that has both a flush draw and a straight draw simultaneously. For example, holding 9h-Th on a board of 7h-8s-2h — you have a flush draw (9 outs) plus an OESD (additional 6 non-heart outs, since some outs overlap), giving you roughly 15 outs total. With that many outs, a combo draw often has over 50% equity against a single pair — making it a mathematical favorite. Combo draws are premium semi-bluffing hands: they're strong enough to bet or raise for value (equity-wise) while also generating fold equity. In HoldemVision, combo draws are flagged prominently in draw analysis.",
    related: ["term:flush_draw", "term:straight_draw", "term:outs", "concept:semi_bluff"],
  },
  {
    id: "term:backdoor_draw",
    category: "term",
    name: "Backdoor Draw",
    short: "Needing two more cards to complete a draw",
    medium:
      "A backdoor draw needs running cards on both the turn and river to complete. Individually weak (~4% to hit), but they add hidden equity to marginal hands.",
    full:
      "A backdoor draw requires two perfect cards (on both the turn and the river) to complete. A backdoor flush draw means you have three cards of the same suit on the flop — you need the turn AND river to both be that suit. The probability of completing a backdoor flush is roughly 4%. While that's low, backdoor draws add hidden equity to your hand that makes continuing with marginal holdings profitable. They're especially valuable because opponents don't see them coming — if the turn brings a third suited card, you suddenly have a full flush draw with 9 outs. Backdoor straights work similarly but are even rarer.",
    related: ["term:flush_draw", "term:straight_draw", "term:outs"],
  },
  {
    id: "term:wet_dry",
    category: "term",
    name: "Wet / Dry Board",
    short: "Wet = draw-heavy board; Dry = few draws possible",
    medium:
      "A wet board has many possible draws (flushes, straights). A dry board is disconnected with few draws. This dramatically changes optimal strategy.",
    full:
      "Board 'wetness' describes how many draws are possible on the community cards. A wet board (like Jh-Ts-9h) has flush draws, straight draws, and combo draws everywhere — many hands have significant equity. A dry board (like Ah-7c-2d) has almost no draws — made hands dominate and draws are rare. Wetness is measured from 0 (bone dry) to 1 (extremely wet). Strategy changes dramatically: on dry boards, the preflop raiser c-bets frequently with small sizing. On wet boards, checking increases and bet sizing goes larger to charge draws. In HoldemVision's board texture analysis, 'wet' and 'dry' labels appear alongside wetness percentages.",
    related: ["concept:board_texture", "term:cbet", "term:board_suit_patterns"],
  },
  {
    id: "term:hero",
    category: "term",
    name: "Hero",
    short: "You — the player being analyzed",
    medium:
      "Hero refers to you, the player whose perspective HoldemVision analyzes from. All equity, coaching, and strategy advice is calculated from Hero's point of view.",
    full:
      "In poker discussion and analysis tools like HoldemVision, 'Hero' refers to the player being analyzed — that's you. All equity calculations, coaching advice, and strategic recommendations are computed from Hero's perspective. The other players at the table are 'villains.' When HoldemVision shows 'Hero's equity: 65%,' it means your hand wins 65% of the time against the opponents' estimated ranges. You select your Hero seat in the workspace and all analysis flows from that viewpoint.",
    related: ["term:equity", "term:range"],
  },
  {
    id: "term:showdown",
    category: "term",
    name: "Showdown",
    short: "When players reveal hands to determine the winner",
    medium:
      "Showdown happens after all betting rounds are complete and two or more players remain. Hands are revealed and the best five-card hand wins the pot.",
    full:
      "Showdown is the final phase of a poker hand where remaining players reveal their hole cards to determine who wins the pot. It occurs after the river betting round is complete, provided two or more players haven't folded. The player with the best five-card combination wins. Not all hands reach showdown — many pots are won when all opponents fold to a bet ('win by fold'). The concept of showdown equity vs. fold equity is central to strategy: some hands are better at winning at showdown (made hands), while others are better at winning without showdown (bluffs with fold equity).",
    related: ["term:equity", "term:fold_equity"],
  },
  {
    id: "term:vacuum_equity",
    category: "term",
    name: "Vacuum Equity",
    short: "Equity against a random, unread opponent hand",
    medium:
      "Vacuum equity calculates your win rate against a completely random hand — as if you know nothing about the opponent. It's a baseline before applying reads.",
    full:
      "Vacuum equity (also called 'vs random') is your hand's equity against a completely random hand — every possible two-card combination is equally likely. It represents the baseline before you apply any reads or range estimates. For example, AA has roughly 85% vacuum equity preflop. In HoldemVision, vacuum equity appears alongside 'vs Opponent Reads' equity to show the difference that opponent profiling makes. The delta between the two tells you how much your reads shift the analysis — a large delta means your opponent's range is significantly different from random.",
    related: ["term:equity", "term:range", "term:delta"],
  },
  {
    id: "term:blinds",
    category: "term",
    name: "Blinds (SB / BB)",
    short: "Forced bets posted before cards are dealt",
    medium:
      "The blinds are forced bets: the Small Blind (SB) posts half a bet and the Big Blind (BB) posts a full bet. They create a pot to fight over and rotate each hand.",
    full:
      "Blinds are mandatory bets posted before cards are dealt. The Small Blind (SB), directly left of the dealer button, posts half a standard bet. The Big Blind (BB), to the left of the SB, posts a full bet. Blinds create an initial pot that incentivizes play — without them, players could fold every hand for free. The BB also serves as the standard unit of measurement in poker: stacks, bets, and winnings are expressed in BB (e.g., '100 BB stack,' '0.5 BB EV loss'). In HoldemVision, all chip amounts are displayed relative to the big blind for consistency.",
    related: ["term:positions", "term:stack_depth", "concept:position"],
  },
  {
    id: "term:stack_depth",
    category: "term",
    name: "Stack Depth",
    short: "How many big blinds a player has",
    medium:
      "Stack depth is a player's chip count measured in big blinds (e.g., '100 BB'). Deeper stacks allow more complex play; shallow stacks simplify decisions to push/fold.",
    full:
      "Stack depth is the number of big blinds a player has. A '100 BB stack' means the player has 100 times the big blind in chips. Stack depth fundamentally changes strategy: with deep stacks (100+ BB), implied odds matter more, drawing hands gain value, and multi-street play creates complex decisions. With shallow stacks (20-30 BB), play simplifies toward push-or-fold decisions since there's not enough behind to bet multiple streets. In HoldemVision, stack sizes are shown for each seat and factor into coaching advice — the same hand might be a raise with 100 BB but a fold with 15 BB.",
    related: ["term:blinds", "term:implied_odds", "concept:position"],
  },
  {
    id: "concept:exploitative",
    category: "concept",
    name: "Exploitative Play",
    short: "Deviating from GTO to punish opponent mistakes",
    medium:
      "Exploitative play intentionally deviates from balanced GTO strategy to maximize profit against opponents who have identifiable leaks or tendencies.",
    full:
      "Exploitative play means deliberately deviating from GTO (balanced) strategy to take advantage of specific opponent mistakes. If you know a player folds too much, you bluff more against them. If they call too much, you value bet thinner and never bluff. The trade-off: exploitative adjustments make you vulnerable to counter-exploitation — if the opponent adapts, your deviation becomes a leak. That's why GTO is the safe baseline and exploitation is layered on top with reads. In HoldemVision, the 'Exploitative Overrides' archetype teaches when deviations from GTO are profitable against common population tendencies.",
    related: ["concept:gto", "term:thin_value", "profile:fish", "profile:nit"],
  },
  {
    id: "term:consensus",
    category: "term",
    name: "Consensus",
    short: "When multiple coaching profiles agree on an action",
    medium:
      "Consensus means most or all of HoldemVision's coaching profiles (GTO, TAG, LAG, NIT, FISH) recommend the same action. Strong consensus suggests a clear-cut decision.",
    full:
      "In HoldemVision's coaching panel, consensus occurs when multiple player profiles arrive at the same recommended action independently. If 4 out of 5 profiles agree to 'bet,' that's a strong signal the spot is straightforward. When profiles disagree (no consensus), the spot is more nuanced and the right play depends on your specific situation and opponent. Consensus is most useful for identifying clear mistakes — if every profile says fold, you should almost certainly fold. When profiles split, study the GTO recommendation for the balanced play.",
    related: ["concept:gto", "profile:tag", "profile:lag", "profile:nit"],
  },

  // ═══════════════════════════════════════════════════════
  // TIER 3 — Grouped reference entries
  // ═══════════════════════════════════════════════════════

  {
    id: "term:positions",
    category: "term",
    name: "Table Positions",
    short: "Seats at the table named by strategic role",
    medium:
      "Positions determine your playing order. Early positions (UTG) are disadvantaged; late positions (CO, BTN) have the advantage of acting last.",
    full:
      "Table positions in a 6-max game, from earliest to latest: UTG (Under the Gun) — first to act preflop, tightest range. HJ (Hijack) — middle position, moderate range. CO (Cutoff) — second-to-last, wide range. BTN (Button) — last to act postflop, widest range and biggest advantage. SB (Small Blind) — posts small blind, acts first postflop. BB (Big Blind) — posts full blind, acts last preflop but first postflop. In a 9-max game, UTG1, UTG2, MP, and MP1 fill early/middle positions. Position is the single biggest factor in preflop hand selection — the same hand might be a raise from the BTN but a fold from UTG.",
    related: ["concept:position", "term:blinds", "term:rfi"],
  },
  {
    id: "term:streets",
    category: "term",
    name: "Streets (Preflop / Flop / Turn / River)",
    short: "The four betting rounds in a hand of poker",
    medium:
      "A poker hand has four streets: Preflop (hole cards dealt), Flop (3 community cards), Turn (4th card), River (5th card). Each has a betting round.",
    full:
      "A hand of Texas Hold'em consists of four betting rounds called 'streets.' Preflop: each player receives two private hole cards, and betting begins with the player left of the big blind. Flop: three community cards are dealt face-up, followed by a betting round starting with the first active player left of the dealer. Turn: a fourth community card is dealt, followed by betting. River: the fifth and final community card is dealt, followed by the last betting round. After the river, any remaining players go to showdown. Strategy changes significantly on each street as more information (cards) is revealed.",
    related: ["term:blinds", "term:showdown", "concept:board_texture"],
  },
  {
    id: "term:hand_categories",
    category: "term",
    name: "Hand Categories",
    short: "How HoldemVision classifies your current hand strength",
    medium:
      "HoldemVision categorizes your hand into types like overpair, top pair, sets, draws, and air. Each category has different strategic implications.",
    full:
      "HoldemVision classifies your postflop hand into strategic categories: Premium Pair — AA/KK. Overpair — pocket pair above all board cards (e.g., QQ on J-8-3). Top Pair Top Kicker (TPTK) — paired the highest board card with a strong kicker. Top Pair Weak Kicker — same but weaker kicker. Middle Pair — paired a middle board card. Bottom Pair — paired the lowest board card. Two Pair — using both hole cards to make two pair. Set — pocket pair matching a board card (very strong). Trips — one hole card matching a paired board card (weaker than a set). Overcards — two cards above the board, no pair. Flush/Straight Draw — drawing hands. Air — nothing (no pair, no draw, no overcards). These categories determine how to play your hand — sets bet for value, draws semi-bluff, air either folds or pure bluffs.",
    related: ["term:outs", "term:equity", "concept:board_texture"],
  },
  {
    id: "term:board_suit_patterns",
    category: "term",
    name: "Board Suit Patterns",
    short: "How many suits appear on the community cards",
    medium:
      "Rainbow (all different suits), Two-Tone (two cards share a suit), Monotone (three+ of one suit). Suit patterns determine flush draw possibilities.",
    full:
      "Board suit patterns describe how suits are distributed across the community cards. Rainbow: all cards are different suits (e.g., Ah-7c-2d) — no flush draws are possible. Two-Tone: exactly two cards share a suit (e.g., Jh-Ts-9h) — one flush draw is possible for players holding two cards of that suit. Monotone: three or more cards of the same suit (e.g., 8h-5h-3h) — anyone with one card of that suit has a flush draw, and two cards means a made flush. Suit patterns dramatically affect strategy: monotone boards slow down betting because so many hands have flush equity. Rainbow boards allow more aggressive betting since draws are limited to straights.",
    related: ["concept:board_texture", "term:flush_draw", "term:wet_dry"],
  },

  // ═══════════════════════════════════════════════════════
  // TIER 4 — Nice-to-have
  // ═══════════════════════════════════════════════════════

  {
    id: "term:delta",
    category: "term",
    name: "Delta (Equity Change)",
    short: "How much opponent reads change your equity",
    medium:
      "Delta is the difference between your vacuum equity (vs random) and your equity after accounting for opponent reads. Positive delta means reads help you.",
    full:
      "In HoldemVision's equity display, delta shows the difference between your vacuum equity (against a random hand) and your adjusted equity (against the opponent's estimated range). A positive delta means your equity goes up when opponent reads are factored in — 'opponents strengthen you' — typically because opponents' likely holdings are weaker than random. A negative delta means opponents' estimated range is stronger than random, narrowing your edge. A minimal delta means reads don't change much, often because the opponent's range is close to random or you have a hand that performs similarly regardless.",
    related: ["term:equity", "term:vacuum_equity", "term:range"],
  },
  {
    id: "term:suited_offsuit",
    category: "term",
    name: "Suited / Offsuit",
    short: "Whether your two hole cards share a suit",
    medium:
      "Suited (s) means both cards are the same suit, giving flush potential. Offsuit (o) means different suits. AKs is significantly stronger than AKo.",
    full:
      "Suited means your two hole cards are the same suit (e.g., Ah-Kh = AKs), giving you backdoor flush potential on any flop and a flush draw when two of your suit appear. Offsuit means different suits (e.g., Ah-Kc = AKo), removing flush possibilities. The 's' and 'o' suffixes are standard notation. Being suited adds roughly 3-4% equity preflop and makes hands significantly more playable postflop due to flush draw potential. This is why hand charts often include suited hands that aren't playable offsuit — for example, T9s might be an open from the cutoff while T9o is a fold.",
    related: ["term:flush_draw", "term:range", "term:rfi"],
  },
  {
    id: "term:broadway",
    category: "term",
    name: "Broadway",
    short: "Cards Ten through Ace (T, J, Q, K, A)",
    medium:
      "Broadway cards are Ten, Jack, Queen, King, and Ace — the five highest ranks. 'Broadway' also refers to the highest possible straight (T-J-Q-K-A).",
    full:
      "Broadway refers to the five highest card ranks: Ten (T), Jack (J), Queen (Q), King (K), and Ace (A). A 'Broadway straight' is T-J-Q-K-A, the highest possible straight. 'Broadway hands' are starting hands where both cards are T or higher (e.g., KQ, AJ, QT). These hands make top pair with top kicker frequently and can make the nut straight. In HoldemVision's hand categorization, 'broadway_suited' and 'broadway_offsuit' identify these holdings. Broadway hands are core parts of opening ranges from most positions.",
    related: ["term:hand_categories", "term:suited_offsuit", "term:rfi"],
  },
  {
    id: "term:connector_gapper",
    category: "term",
    name: "Connector / Gapper",
    short: "Cards close in rank that can make straights",
    medium:
      "A connector has adjacent ranks (e.g., 8-9). A gapper has a one-rank gap (e.g., 8-T). Both are valued for straight-making potential, especially when suited.",
    full:
      "Connectors are two cards of adjacent rank (e.g., 7-8, J-Q) that have strong straight-making potential. One-gappers have a single rank gap (e.g., 7-9, T-Q) and are slightly weaker but still have straight potential. Two-gappers (e.g., 7-T) are even weaker. Suited connectors (like 7h-8h) are premium speculative hands because they can make both straights and flushes — they're core 3-bet bluff candidates and profitable opens from late position. In HoldemVision's hand categorization, 'suited_connector' and 'suited_gapper' classify these holdings.",
    related: ["term:suited_offsuit", "term:straight_draw", "term:range"],
  },
  {
    id: "term:pot_odds_ratio",
    category: "term",
    name: "Pot Odds Ratio (X:1)",
    short: "How much the pot offers relative to your call",
    medium:
      "The X:1 ratio expresses pot odds as 'pot size : call amount.' Getting 3:1 means the pot offers three times your call, so you need 25% equity to break even.",
    full:
      "Pot odds expressed as a ratio (e.g., 3:1) tell you how much the pot is offering relative to what you need to call. If the pot is $30 and you face a $10 bet, you're getting 4:1 — the pot offers $40 (original pot + bet) for a $10 call. To convert a ratio to the equity percentage needed: 1 / (ratio + 1). So 3:1 = 1/4 = 25% equity needed. 4:1 = 1/5 = 20%. In HoldemVision's opponent detail panel, pot odds are displayed in this ratio format alongside the equity percentage for easy comparison — if your equity exceeds the required percentage, calling is profitable.",
    related: ["term:pot_odds", "term:equity", "term:implied_odds"],
  },
];

registerKnowledge(...TERMS);
