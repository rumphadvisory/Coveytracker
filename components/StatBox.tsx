export default function StatBox({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-white px-3 py-2.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-bark">{label}</div>
      <div className="font-display text-xl tabular-nums" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      {sub != null && <div className="text-xs text-bark">{sub}</div>}
    </div>
  );
}

export function RatePill({ label, value }: { label: string; value: string }) {
  return (
    <span className="pill">
      <span className="text-bark/80">{label}</span>
      <strong className="tabular-nums text-ink">{value}</strong>
    </span>
  );
}
