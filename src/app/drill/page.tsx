"use client";

import { useSearchParams } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import type { ArchetypeId } from "../../../convex/lib/gto/archetypeClassifier";
import type { DrillMode } from "@/components/workspace/workspace-shell";

export default function DrillPage() {
  const params = useSearchParams();
  const archetype = params.get("archetype") as ArchetypeId | null;
  const hands = params.get("hands") ? Number(params.get("hands")) : undefined;
  const mode = params.get("mode") as DrillMode | null;

  return (
    <WorkspaceShell
      initialMode="drill"
      drillParams={archetype ? { archetype, hands, mode: mode ?? undefined } : undefined}
    />
  );
}
