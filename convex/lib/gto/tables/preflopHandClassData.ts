/**
 * Preflop Hand Class Data — auto-registration via side-effect import.
 *
 * Imports the PokerBench-aggregated JSON files and registers them
 * into the preflop hand class registry. Same pattern as solverData.ts.
 */

import { registerPreflopHandClassTable, type PreflopHandClassTable } from "./preflopHandClass";

import rfiOpening from "../../../../data/pokerbench/preflop_tables/rfi_opening.json";
import bbDefense from "../../../../data/pokerbench/preflop_tables/bb_defense_vs_rfi.json";
import threeBetPots from "../../../../data/pokerbench/preflop_tables/three_bet_pots.json";
import blindVsBlind from "../../../../data/pokerbench/preflop_tables/blind_vs_blind.json";
import fourBetFiveBet from "../../../../data/pokerbench/preflop_tables/four_bet_five_bet.json";

const ALL_PREFLOP_HAND_CLASS_DATA: PreflopHandClassTable[] = [
  rfiOpening as PreflopHandClassTable,
  bbDefense as PreflopHandClassTable,
  threeBetPots as PreflopHandClassTable,
  blindVsBlind as PreflopHandClassTable,
  fourBetFiveBet as PreflopHandClassTable,
];

for (const table of ALL_PREFLOP_HAND_CLASS_DATA) {
  registerPreflopHandClassTable(table);
}
