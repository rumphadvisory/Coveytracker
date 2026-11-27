import type { HarvestLine, Pressure } from "@/lib/harvest";

const COLORS: Record<Pressure, string> = {
  green: "#3d6e38",
  yellow: "#d99a1e",
  red: "#b42318",
  none: "#c9c0ae",
};

const LABELS: Record<Pressure, string> = {
  green: "Light pressure",
  yellow: "Approaching budget",
  red: "Over budget",
  none: "No survey data",
};

export default function HarvestGauge({ line }: { line: HarvestLine }) {
  const pct = line.used == null ? (line.harvested > 0 ? 100 : 0) : Math.min(line.used, 1.25) * 80; // 100% budget at 80% width
  return (
    <div>
      <div className="relative h-3 overflow-hidden rounded-full bg-sand-dark">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: COLORS[line.pressure] }} />
        <div className="absolute inset-y-0 left-[80%] w-0.5 bg-ink/40" title="Budget" />
      </div>
      <div className="mt-1 flex justify-between text-xs">
        <span style={{ color: COLORS[line.pressure] }} className="font-semibold">
          {LABELS[line.pressure]}
        </span>
        <span className="text-bark">{line.used == null ? "—" : `${Math.round(line.used * 100)}% of budget`}</span>
      </div>
    </div>
  );
}
