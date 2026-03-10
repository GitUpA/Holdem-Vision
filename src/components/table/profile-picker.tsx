"use client";

import type { OpponentProfile } from "../../../convex/lib/types/opponents";
import { getAllPresets } from "../../../convex/lib/opponents/presets";

interface ProfilePickerProps {
  currentProfile?: OpponentProfile;
  onSelect: (profile: OpponentProfile | undefined) => void;
}

const presets = getAllPresets();

export function ProfilePicker({ currentProfile, onSelect }: ProfilePickerProps) {
  return (
    <select
      value={currentProfile?.id ?? ""}
      onChange={(e) => {
        const id = e.target.value;
        if (!id) {
          onSelect(undefined);
        } else {
          const profile = presets.find((p) => p.id === id);
          onSelect(profile);
        }
      }}
      className="w-full text-xs px-2.5 py-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] focus:outline-none focus:border-[var(--gold-dim)]/60 transition-colors"
    >
      <option value="">No profile</option>
      {presets.map((preset) => (
        <option key={preset.id} value={preset.id}>
          {preset.name}
        </option>
      ))}
    </select>
  );
}
