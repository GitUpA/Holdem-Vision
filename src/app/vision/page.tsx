"use client";

import { useSearchParams } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import type { ArchetypeId } from "../../../convex/lib/gto/archetypeClassifier";
import type { DrillMode, VisionParams } from "@/components/workspace/workspace-shell";
import type { Street } from "../../../convex/lib/types/cards";

export default function VisionPage() {
  const params = useSearchParams();
  const mode = params.get("mode");

  if (mode === "drill") {
    const archetype = params.get("archetype") as ArchetypeId | null;
    const hands = params.get("hands") ? Number(params.get("hands")) : undefined;
    const drillQuizMode = params.get("drillMode") as DrillMode | null;
    return (
      <WorkspaceShell
        initialMode="drill"
        drillParams={archetype ? { archetype, hands, mode: drillQuizMode ?? undefined } : undefined}
      />
    );
  }

  // Vision mode URL params
  const visionParams: VisionParams | undefined = params.get("deal") ? {
    deal: true,
    street: (params.get("street") as Street) ?? undefined,
    players: params.get("players") ? Number(params.get("players")) : undefined,
    dealer: params.get("dealer") ? Number(params.get("dealer")) : undefined,
    lenses: params.get("lenses")?.split(",").filter(Boolean) ?? undefined,
  } : undefined;

  return <WorkspaceShell visionParams={visionParams} />;
}
