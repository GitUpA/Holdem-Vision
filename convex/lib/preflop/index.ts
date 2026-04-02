export { normalize6Max, compressRangeByStack } from "./rangeUtils";

export {
  type PreflopSituationId,
  type PreflopSituationContext,
  type PreflopSituationEntry,
  type RangeSource,
  type OpponentCountRule,
  PREFLOP_SITUATIONS,
  classifySituation,
  resolveOpponentCount,
} from "./situationRegistry";

export {
  resolveOpponentRange,
  resolveHeroRange,
} from "./situationRanges";
