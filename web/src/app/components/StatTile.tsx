import { ArrowUp, ArrowDown } from "lucide-react";
import type { KeyboardEvent } from "react";
import { Card } from "./ui/card";

interface StatTileProps {
  label: string;
  value: string | number;
  change?: {
    value: number;
    isPositive?: boolean;
  };
  className?: string;
  onClick?: () => void;
}

export function StatTile({ label, value, change, className = "", onClick }: StatTileProps) {
  const interactive = onClick
    ? {
        role: "button" as const,
        tabIndex: 0,
        onClick,
        onKeyDown: (e: KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        },
      }
    : {};
  return (
    <Card
      className={`p-3 ${onClick ? "cursor-pointer active:scale-[0.99] touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" : ""} ${className}`}
      {...interactive}
    >
      <div className="text-xs text-muted-foreground mb-0.5 leading-tight">{label}</div>
      <div className="flex items-baseline gap-1.5 flex-wrap">
        <div className="text-lg tabular-nums tracking-tight whitespace-nowrap">{value}</div>
        {change && (
          <div
            className={`flex items-center gap-0.5 text-xs ${change.isPositive !== false ? "text-accent" : "text-destructive"}`}
          >
            {change.isPositive !== false ? (
              <ArrowUp className="w-3 h-3" />
            ) : (
              <ArrowDown className="w-3 h-3" />
            )}
            <span>{Math.abs(change.value)}%</span>
          </div>
        )}
      </div>
    </Card>
  );
}
