"use client";

import type { AnalysisResult } from "../../../convex/lib/types/analysis";
import type { VisualDirective } from "../../../convex/lib/types/visuals";
import { HandStrengthDisplay } from "./hand-strength-display";
import { EquityDisplay } from "./equity-display";
import { EquityComparison } from "./equity-comparison";
import { RangeGrid } from "./range-grid";
import { ThreatPanel } from "./threat-panel";
import { OutsDisplay } from "./outs-display";
import { DrawsPanel } from "./draws-panel";
import { CoachingPanel } from "./coaching-panel";
import type { RangeHighlight } from "../../../convex/lib/types/visuals";
import type { CoachingAdvice, CoachingValue } from "../../../convex/lib/analysis/coachingLens";
import type { Street } from "../../../convex/lib/types/cards";

interface VisualRendererProps {
  results: Map<string, AnalysisResult>;
  street: Street;
}

/**
 * Routes VisualDirectives from analysis results to the correct display components.
 * Collects all visuals, sorts by priority, and renders each.
 */
export function VisualRenderer({ results, street }: VisualRendererProps) {
  // Collect all visuals from all results, sorted by priority
  const allVisuals: VisualDirective[] = [];
  for (const [, result] of results) {
    allVisuals.push(...result.visuals);
  }
  allVisuals.sort((a, b) => b.priority - a.priority);

  const components: React.ReactNode[] = [];

  for (const visual of allVisuals) {
    const key = `${visual.lensId}-${visual.type}`;

    switch (visual.type) {
      case "hand_strength": {
        const data = visual.data as {
          currentHand: { name: string; description: string; tier: number } | null;
          preflopStrength: { category: string; label: string } | null;
        };
        components.push(
          <HandStrengthDisplay
            key={key}
            currentHand={data.currentHand}
            preflopStrength={data.preflopStrength}
          />,
        );
        break;
      }

      case "equity_bar": {
        const data = visual.data as { win: number; tie: number; lose: number };
        components.push(
          <EquityDisplay
            key={key}
            win={data.win}
            tie={data.tie}
            lose={data.lose}
          />,
        );
        break;
      }

      case "threat_map": {
        const threatResult = results.get("threats");
        if (threatResult) {
          const value = threatResult.value as {
            threats: Array<{
              cardIndex: number;
              urgency: number;
              reasons: string[];
              categories: string[];
            }>;
            threatCount: number;
            safeCount: number;
          };
          components.push(
            <ThreatPanel
              key={key}
              threats={value.threats}
              threatCount={value.threatCount}
              safeCount={value.safeCount}
            />,
          );
        }
        break;
      }

      case "outs_display": {
        // This could come from either outs or draws lens
        if (visual.lensId === "outs") {
          const outsResult = results.get("outs");
          if (outsResult) {
            const value = outsResult.value as {
              outs: Array<{
                cardIndex: number;
                currentHandName: string;
                improvedHandName: string;
                improvement: string;
              }>;
              outsCount: number;
              probability: number;
              byImprovement: Record<string, Array<{
                cardIndex: number;
                currentHandName: string;
                improvedHandName: string;
                improvement: string;
              }>>;
            };
            components.push(
              <OutsDisplay
                key={key}
                outs={value.outs}
                outsCount={value.outsCount}
                probability={value.probability}
                byImprovement={value.byImprovement}
                street={street as "flop" | "turn" | "river"}
              />,
            );
          }
        } else if (visual.lensId === "draws") {
          const drawResult = results.get("draws");
          if (drawResult) {
            const value = drawResult.value as {
              draws: Array<{
                type: string;
                outsCount: number;
                description: string;
              }>;
              hasFlushDraw: boolean;
              hasStraightDraw: boolean;
              isCombo: boolean;
              totalDrawOuts: number;
            };
            components.push(
              <DrawsPanel
                key={key}
                draws={value.draws}
                hasFlushDraw={value.hasFlushDraw}
                hasStraightDraw={value.hasStraightDraw}
                isCombo={value.isCombo}
                totalDrawOuts={value.totalDrawOuts}
              />,
            );
          }
        }
        break;
      }

      case "comparison": {
        const cData = visual.data as {
          label: string;
          vacuum: { win: number; tie: number; lose: number };
          reads: { win: number; tie: number; lose: number };
          delta: number;
        };
        components.push(
          <EquityComparison
            key={key}
            vacuum={cData.vacuum}
            reads={cData.reads}
            delta={cData.delta}
          />,
        );
        break;
      }

      case "range_grid": {
        const rgData = visual.data as {
          label: string;
          highlights: RangeHighlight[];
          rangePct: number;
        };
        components.push(
          <RangeGrid
            key={key}
            label={rgData.label}
            highlights={rgData.highlights}
            rangePct={rgData.rangePct}
          />,
        );
        break;
      }

      case "coaching": {
        const cData = visual.data as {
          advices: CoachingAdvice[];
          consensus?: CoachingValue["consensus"];
        };
        components.push(
          <CoachingPanel
            key={key}
            advices={cData.advices}
            consensus={cData.consensus}
          />,
        );
        break;
      }

      // equity_breakdown is handled by equity_bar display
      case "equity_breakdown":
        break;

      default:
        break;
    }
  }

  return <>{components}</>;
}
