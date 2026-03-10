/**
 * Visual directive types — data-only rendering instructions.
 * Components interpret these; the analysis system produces them.
 */

export interface CardHighlight {
  cardIndex: number;
  status: "hero" | "community" | "dead" | "out" | "threat" | "neutral";
  reason: string;
  urgency: number; // 0-1
}

export interface RangeHighlight {
  combo: string;    // "AKs", "TT", "87o"
  weight: number;   // 0-1
  category: string; // "ahead" | "behind" | "drawing"
  color: string;
}

export type VisualDirectiveType =
  | "card_grid"
  | "range_grid"
  | "equity_bar"
  | "equity_breakdown"
  | "hand_strength"
  | "threat_map"
  | "outs_display"
  | "action_indicator"
  | "comparison"
  | "coaching";

export interface VisualDirective {
  type: VisualDirectiveType;
  data: Record<string, unknown>;
  priority: number;
  lensId: string;
}
