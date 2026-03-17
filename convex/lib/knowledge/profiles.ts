/**
 * Knowledge Base — Player Profile entries
 *
 * Descriptions for the 5 player archetypes (NIT, FISH, TAG, LAG, GTO).
 * UI components reference these by ID instead of hardcoding profile text.
 */

import type { KnowledgeEntry } from "./types";
import { registerKnowledge } from "./registry";

const PROFILES: KnowledgeEntry[] = [
  {
    id: "profile:nit",
    category: "profile",
    name: "NIT",
    short: "Ultra-tight, premium only",
    medium:
      "Nits are ultra-tight players who only enter pots with premium hands — top pairs, AK, AQ suited. They fold everything marginal and rarely bluff.",
    full:
      "Nits are the tightest player type. They only voluntarily put money in the pot with the very best starting hands — premium pocket pairs (AA-JJ), AK, and occasionally AQ suited. They fold all marginal hands preflop and postflop. When a NIT bets or raises, they almost always have a strong made hand. Their bluff frequency is extremely low, which makes them predictable but hard to extract value from. Against NITs, you can profitably steal their blinds often, but should give them credit when they show aggression.",
    related: ["profile:tag", "profile:fish", "concept:vpip", "concept:pfr"],
  },
  {
    id: "profile:fish",
    category: "profile",
    name: "FISH",
    short: "Loose-passive, calls too much",
    medium:
      "Fish play too many hands and call too often. They rarely raise or bluff, preferring to see showdowns with marginal holdings.",
    full:
      "Fish (also called 'calling stations') are loose-passive players who play far too many starting hands — often over half of all deals. They call preflop raises with weak hands, chase draws without proper odds, and rarely fold to aggression postflop. Their betting frequency is low; when they do raise, they usually have a very strong hand. Against fish, the best strategy is to value bet thinner (bet medium-strength hands for value) and avoid bluffing, since they won't fold. Fish lose money long-term because they put too much in the pot with weak holdings.",
    related: ["profile:lag", "profile:nit", "concept:pot_odds"],
  },
  {
    id: "profile:tag",
    category: "profile",
    name: "TAG",
    short: "Tight-aggressive, solid play",
    medium:
      "TAGs play a selective range of hands but play them aggressively. They are solid, disciplined players who balance value bets with well-timed bluffs.",
    full:
      "Tight-aggressive (TAG) is the most commonly recommended playing style. TAGs are selective about which hands they play (tight) but play those hands assertively (aggressive). They open-raise good hands, c-bet frequently on favorable boards, and mix in bluffs at appropriate frequencies. TAGs are harder to exploit because their tight range means they usually have something, and their aggression puts pressure on opponents. They fold marginal spots, take strong lines with good hands, and adjust sizing based on board texture. Most winning players at low-to-mid stakes play a TAG style.",
    related: ["profile:lag", "profile:gto", "concept:position"],
  },
  {
    id: "profile:lag",
    category: "profile",
    name: "LAG",
    short: "Loose-aggressive, high pressure",
    medium:
      "LAGs play many hands and apply constant pressure with bets and raises. They use position and aggression to win pots without showdown.",
    full:
      "Loose-aggressive (LAG) players enter many pots and apply relentless pressure. They open wide ranges, 3-bet frequently, and c-bet most flops regardless of their hand. LAGs win many pots by forcing opponents to fold, making them dangerous and hard to play against. However, the LAG style requires deep skill — without proper hand reading and adjustments, playing too many hands aggressively leads to big losses. LAGs exploit tight players by attacking their wide folding ranges. Against a LAG, the key is to widen your calling range, trap with strong hands, and avoid being bullied out of pots with reasonable holdings.",
    related: ["profile:tag", "profile:fish", "concept:fold_equity"],
  },
  {
    id: "profile:gto",
    category: "profile",
    name: "GTO",
    short: "Game-theory optimal, balanced",
    medium:
      "GTO play uses mathematically balanced strategies that cannot be exploited. It mixes actions at theoretically correct frequencies.",
    full:
      "Game Theory Optimal (GTO) represents the mathematically unexploitable strategy. A GTO player balances their range in every spot — they bet, check, call, and fold at frequencies that prevent any opponent adjustment from being profitable. GTO doesn't try to exploit opponents; instead, it guarantees a baseline win rate regardless of what the opponent does. In practice, pure GTO is computed by solvers and involves mixing actions (e.g., checking 40% and betting 60% with a specific hand). GTO serves as the reference point — deviations from GTO are only profitable if opponents are making mistakes you can exploit. This is why HoldemVision uses GTO as the baseline all other profiles are compared against.",
    related: ["profile:tag", "concept:mixed_strategy", "concept:ev"],
  },
];

registerKnowledge(...PROFILES);
