/**
 * Postflop Hand Class Data — auto-registration via side-effect import.
 *
 * Imports the PokerBench-aggregated postflop JSON files and registers them.
 * Same pattern as solverData.ts and preflopHandClassData.ts.
 */

import { registerPostflopHandClassTable, type PostflopHandClassTable } from "./postflopHandClass";

import aceHighDry from "../../../../data/pokerbench/postflop_tables/ace_high_dry_rainbow.json";
import kqHighDry from "../../../../data/pokerbench/postflop_tables/kq_high_dry_rainbow.json";
import midLowDry from "../../../../data/pokerbench/postflop_tables/mid_low_dry_rainbow.json";
import pairedBoards from "../../../../data/pokerbench/postflop_tables/paired_boards.json";
import twoToneDisco from "../../../../data/pokerbench/postflop_tables/two_tone_disconnected.json";
import twoToneConn from "../../../../data/pokerbench/postflop_tables/two_tone_connected.json";
import monotone from "../../../../data/pokerbench/postflop_tables/monotone.json";
import rainbowConn from "../../../../data/pokerbench/postflop_tables/rainbow_connected.json";

const ALL_POSTFLOP_HAND_CLASS_DATA: PostflopHandClassTable[] = [
  aceHighDry as PostflopHandClassTable,
  kqHighDry as PostflopHandClassTable,
  midLowDry as PostflopHandClassTable,
  pairedBoards as PostflopHandClassTable,
  twoToneDisco as PostflopHandClassTable,
  twoToneConn as PostflopHandClassTable,
  monotone as PostflopHandClassTable,
  rainbowConn as PostflopHandClassTable,
];

for (const table of ALL_POSTFLOP_HAND_CLASS_DATA) {
  registerPostflopHandClassTable(table);
}
