import { scentingScore, type Conditions, type ScentRating } from "@/lib/weather";

const STYLES: Record<ScentRating, string> = {
  Excellent: "bg-forest text-white",
  Good: "bg-[#7aa363] text-white",
  Fair: "bg-amber-500 text-white",
  Poor: "bg-red-700 text-white",
};

export default function ScentingBadge({ conditions, detailed = false }: { conditions: Conditions; detailed?: boolean }) {
  const s = scentingScore(conditions);
  return (
    <div>
      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${STYLES[s.rating]}`}>
        <span className="material-symbols-outlined text-[18px]">pets</span>
        Scenting: {s.rating}
        <span className="opacity-80">({s.score}/10)</span>
      </span>
      {detailed && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {s.factors.map((f) => (
            <div key={f.label} className="rounded-lg bg-sand px-2.5 py-1.5 text-xs">
              <div className="text-bark">{f.label}</div>
              <div className="mt-1 flex gap-1">
                {Array.from({ length: f.max }).map((_, i) => (
                  <span key={i} className={`h-1.5 flex-1 rounded-full ${i < f.points ? "bg-forest" : "bg-line"}`} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
