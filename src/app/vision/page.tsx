"use client";

import { useSearchParams } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import type { ArchetypeId } from "../../../convex/lib/gto/archetypeClassifier";
import type { DrillMode, VisionParams } from "@/components/workspace/workspace-shell";
import type { BoardSource } from "@/types/workspace-mode";
import type { Street } from "../../../convex/lib/types/cards";

export default function VisionPage() {
  const params = useSearchParams();

  // New URL scheme: ?source=archetype&archetype=X&hands=N&quiz=true
  // Backward compat: ?mode=drill → source=archetype
  const source = params.get("source") as BoardSource | null;
  const legacyMode = params.get("mode");
  const resolvedSource: BoardSource = source ?? (legacyMode === "drill" ? "archetype" : "free_play");

  // Archetype params (used when source=archetype or legacy mode=drill)
  const archetype = params.get("archetype") as ArchetypeId | null;
  const hands = params.get("hands") ? Number(params.get("hands")) : undefined;
  const quiz = params.get("quiz");
  const legacyDrillMode = params.get("drillMode") as DrillMode | null;
  const drillMode: DrillMode | undefined = quiz === "false" ? "learn" : legacyDrillMode ?? undefined;

  const drillParams = archetype ? { archetype, hands, mode: drillMode } : undefined;

  // Vision/free-play params
  const visionParams: VisionParams | undefined = params.get("deal") ? {
    deal: true,
    street: (params.get("street") as Street) ?? undefined,
    players: params.get("players") ? Number(params.get("players")) : undefined,
    dealer: params.get("dealer") ? Number(params.get("dealer")) : undefined,
    lenses: params.get("lenses")?.split(",").filter(Boolean) ?? undefined,
  } : undefined;

  return (
    <WorkspaceShell
      initialSource={resolvedSource}
      drillParams={drillParams}
      visionParams={visionParams}
    />
  );
}
