/**
 * WorkspaceMode — configuration object that controls what's enabled in the unified workspace.
 *
 * Design principle: everything is always VISIBLE. Mode controls what's ENABLED.
 * Disabled features show grayed-out with a hint about what would enable them.
 * Mode is the starting configuration, not a hard wall.
 *
 * Pure TypeScript, zero React/Convex imports.
 */

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

export type WorkspaceModeId = "vision" | "drill";

export interface CardConfig {
  enabled: boolean;
  heroEditable: boolean;
  communityEditable: boolean;
  villainEditable: boolean;
}

export interface AnalysisConfig {
  enabled: boolean;
  coaching: boolean;
  lenses: boolean;
  lensSelector: boolean;
}

export interface ScoringConfig {
  enabled: boolean;
  showSolution: "always" | "after_act" | "never";
}

export interface ActionConfig {
  style: "game" | "gto";
}

export interface DealConfig {
  style: "manual" | "constrained";
  archetypeSelector: boolean;
}

export interface OpponentConfig {
  editable: boolean;
  randomizable: boolean;
}

export interface SetupConfig {
  enabled: boolean;
  blindsEditable: boolean;
  stackEditable: boolean;
  playerCountEditable: boolean;
}

export interface PostHandConfig {
  replay: boolean;
  revealAll: boolean;
  dealNext: boolean;
  drillNext: boolean;
  drillSummary: boolean;
}

export type WorkspaceLayout = "two-column" | "single-column";

export interface WorkspaceMode {
  id: WorkspaceModeId;
  label: string;
  cards: CardConfig;
  analysis: AnalysisConfig;
  scoring: ScoringConfig;
  action: ActionConfig;
  deal: DealConfig;
  opponents: OpponentConfig;
  setup: SetupConfig;
  postHand: PostHandConfig;
  layout: WorkspaceLayout;
}

// ═══════════════════════════════════════════════════════
// FACTORIES
// ═══════════════════════════════════════════════════════

/** Vision mode — full manual control, analysis + coaching, game-style actions */
export function visionMode(): WorkspaceMode {
  return {
    id: "vision",
    label: "Vision",
    cards: {
      enabled: true,
      heroEditable: true,
      communityEditable: true,
      villainEditable: true,
    },
    analysis: {
      enabled: true,
      coaching: true,
      lenses: true,
      lensSelector: true,
    },
    scoring: {
      enabled: false,
      showSolution: "never",
    },
    action: {
      style: "game",
    },
    deal: {
      style: "manual",
      archetypeSelector: false,
    },
    opponents: {
      editable: true,
      randomizable: true,
    },
    setup: {
      enabled: true,
      blindsEditable: true,
      stackEditable: true,
      playerCountEditable: true,
    },
    postHand: {
      replay: true,
      revealAll: true,
      dealNext: true,
      drillNext: false,
      drillSummary: false,
    },
    layout: "two-column",
  };
}

/** Drill mode — constrained deals, GTO scoring, learn/quiz solution reveal */
export function drillMode(): WorkspaceMode {
  return {
    id: "drill",
    label: "Drill",
    cards: {
      enabled: true,
      heroEditable: false,
      communityEditable: false,
      villainEditable: false,
    },
    analysis: {
      enabled: true,
      coaching: false,     // off by default — could spoil the GTO answer
      lenses: true,
      lensSelector: true,  // user can toggle lenses on to study the spot
    },
    scoring: {
      enabled: true,
      showSolution: "after_act",
    },
    action: {
      style: "gto",
    },
    deal: {
      style: "constrained",
      archetypeSelector: true,
    },
    opponents: {
      editable: false,
      randomizable: false,
    },
    setup: {
      enabled: false,
      blindsEditable: false,
      stackEditable: false,
      playerCountEditable: false,
    },
    postHand: {
      replay: false,
      revealAll: false,
      dealNext: false,
      drillNext: true,
      drillSummary: true,
    },
    layout: "two-column",
  };
}
