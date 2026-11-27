"use client";

import type { DogRow } from "@/types/database";

export default function DogChipGrid({
  dogs,
  selected,
  onToggle,
  emptyHint = "No active dogs yet — add them in Manage.",
}: {
  dogs: DogRow[];
  selected: string[];
  onToggle: (id: string) => void;
  emptyHint?: string;
}) {
  if (dogs.length === 0) return <p className="text-sm text-bark">{emptyHint}</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {dogs.map((d) => {
        const on = selected.includes(d.id);
        return (
          <button
            key={d.id}
            type="button"
            aria-pressed={on}
            className={`chip ${on ? "chip-on" : ""}`}
            onClick={() => onToggle(d.id)}
          >
            <span className="material-symbols-outlined text-[18px]">{on ? "check" : "pets"}</span>
            {d.name}
          </button>
        );
      })}
    </div>
  );
}
