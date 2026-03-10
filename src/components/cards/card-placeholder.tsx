"use client";

import { cn } from "@/lib/utils";

interface CardPlaceholderProps {
  size?: "sm" | "md" | "lg";
  label?: string;
}

export function CardPlaceholder({ size = "md", label }: CardPlaceholderProps) {
  const sizeClasses = {
    sm: "w-10 h-14 text-[10px]",
    md: "w-14 h-[78px] text-xs",
    lg: "w-20 h-28 text-sm",
  };

  return (
    <div
      className={cn(
        "playing-card rounded-md border-2 border-dashed border-[var(--border)] flex items-center justify-center",
        "bg-[var(--muted)]/50 text-[var(--muted-foreground)]",
        sizeClasses[size],
      )}
    >
      {label && <span className="text-center leading-tight">{label}</span>}
    </div>
  );
}
