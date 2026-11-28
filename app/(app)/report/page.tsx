"use client";

import { useMemo, useState } from "react";
import Icon from "@/components/Icon";
import { useProperty } from "@/components/PropertyProvider";
import { ErrorNote, Loading, OfflineNote } from "@/components/ui";
import { useCounts, useMarks } from "@/components/useCounts";
import { useHunts } from "@/components/useHunts";
import { ALL } from "@/lib/data";
import type { Insight } from "@/lib/insights";
import {
  PERIOD_LABEL,
  buildReport,
  change,
  formatKpi,
  formatWindow,
  reportText,
  yoyCsv,
  type Kpi,
  type Period,
} from "@/lib/report";
import { todayISO } from "@/lib/seasons";

const TONE: Record<Insight["tone"], string> = {
  good: "border-forest/30 bg-forest-light/40",
  watch: "border-amber-300 bg-amber-50",
  neutral: "border-line bg-white",
};

export default function ReportPage() {
  const { property, courses, dogs, user } = useProperty();
  const { hunts, error: e1, offline } = useHunts(ALL);
  const { counts, error: e2 } = useCounts(ALL);
  const { marks, error: e3 } = useMarks(ALL);
  const [period, setPeriod] = useState<Period>("week");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = todayISO();

  const report = useMemo(
    () =>
      hunts && counts
        ? buildReport({ period, today, hunts, counts, marks: marks ?? [], courses, dogs })
        : null,
    [period, today, hunts, counts, marks, courses, dogs],
  );

  async function copy() {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(reportText(property.name, report));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy on this device.");
    }
  }

  function downloadCsv() {
    if (!report) return;
    const blob = new Blob([yoyCsv(report.yoy)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${property.name.replace(/[^\w]+/g, "-")}-year-over-year.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="space-y-3 print:hidden">
        <h1 className="h-page flex items-center gap-2">
          <Icon name="summarize" className="text-forest" /> Reports
        </h1>
        <p className="-mt-1 text-sm text-bark">
          Season performance and outlook for owners, management meetings and your year-over-year plan.
        </p>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-sand-dark/60 p-1 text-sm font-semibold">
          {(["week", "month", "season"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-lg py-2 ${period === p ? "bg-white text-forest-dark shadow" : "text-bark"}`}
            >
              {p === "week" ? "This week" : p === "month" ? "This month" : "Season"}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <button className="btn-primary min-h-0 px-2 py-2.5 text-sm" onClick={() => window.print()} disabled={!report}>
            <Icon name="picture_as_pdf" className="text-[18px]" /> PDF / Print
          </button>
          <button className="btn-secondary min-h-0 px-2 py-2.5 text-sm" onClick={copy} disabled={!report}>
            <Icon name={copied ? "check" : "content_copy"} className="text-[18px]" /> {copied ? "Copied" : "Copy text"}
          </button>
          <button className="btn-secondary min-h-0 px-2 py-2.5 text-sm" onClick={downloadCsv} disabled={!report || report.yoy.length === 0}>
            <Icon name="table_view" className="text-[18px]" /> YOY CSV
          </button>
        </div>
        <p className="text-xs text-bark">
          PDF / Print opens your phone&apos;s print screen: choose <strong>Save to Files</strong> (iPhone: pinch out on the
          preview, then Share) to email it. Copy text pastes into an email; the CSV opens in Excel or Sheets for slides.
        </p>
        <ErrorNote error={error ?? e1 ?? e2 ?? e3} />
        <OfflineNote show={offline} />
      </div>

      {!report ? (
        <Loading />
      ) : (
        <article className="space-y-4 print:space-y-3">
          {/* Title block */}
          <header className="card border-forest/30 print:border-0 print:p-0 print:shadow-none">
            <div className="flex items-start gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-mark.png" alt="" className="h-12 w-12 rounded-lg" />
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-wide text-forest">
                  {PERIOD_LABEL[report.period]} report · {report.season} season
                </div>
                <h2 className="font-display text-2xl leading-tight">{property.name}</h2>
                <div className="text-sm text-bark">
                  {formatWindow(report.window)} · compared with {formatWindow(report.prior)}
                </div>
                <div className="text-xs text-bark">
                  Prepared {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} by {user.email}
                </div>
              </div>
            </div>
          </header>

          <Section title={report.period === "season" ? "Season to date vs last season" : `This ${report.period} vs the same dates last year`} icon="monitoring">
            <KpiGrid kpis={report.kpis} />
            {report.kpis[0].value === 0 && <p className="text-sm text-bark">No hunts logged in this period yet.</p>}
          </Section>

          {report.period !== "season" && (
            <Section title={`Season to date (${report.season})`} icon="calendar_month">
              <KpiGrid kpis={report.seasonKpis} />
            </Section>
          )}

          {report.outlook.length > 0 && (
            <Section title="Outlook and recommendations" icon="explore" accent>
              <ul className="space-y-2 text-sm">
                {report.outlook.map((o, i) => (
                  <li key={i} className="flex gap-2">
                    <Icon name="arrow_right" className="text-forest" /> <span>{o}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {report.insights.length > 0 && (
            <Section title="Management insights" icon="insights">
              <div className="grid gap-2 sm:grid-cols-2">
                {report.insights.map((i) => (
                  <div key={i.topic} className={`break-inside-avoid rounded-xl border p-3 text-sm ${TONE[i.tone]}`}>
                    <div className="flex items-center gap-1.5 font-semibold">
                      <Icon name={i.icon} className="text-[18px] text-forest" /> {i.title}
                      {i.tone === "watch" && <span className="ml-auto rounded-full bg-amber-200 px-2 text-[10px] font-bold uppercase text-amber-900">Watch</span>}
                    </div>
                    <p className="mt-1">{i.finding}</p>
                    <p className="mt-1 text-bark">{i.action}</p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {report.courses.length > 0 && (
            <Section title="Courses and harvest (season to date)" icon="landscape">
              <Table
                head={["Course", "Hunts", "Coveys/hr", "Harvest", "Budget used"]}
                rows={report.courses.map((c) => [
                  c.name,
                  c.hunts,
                  c.coveysPerHour != null ? c.coveysPerHour.toFixed(1) : "—",
                  c.harvest ? `${c.harvest.harvested} / ${c.harvest.budget}` : "—",
                  c.harvest?.used != null ? (
                    <span
                      key="u"
                      className={`font-semibold ${c.harvest.pressure === "red" ? "text-red-700" : c.harvest.pressure === "yellow" ? "text-amber-700" : "text-forest"}`}
                    >
                      {Math.round(c.harvest.used * 100)}%
                    </span>
                  ) : (
                    "—"
                  ),
                ])}
              />
              {report.harvest ? (
                <p className="text-xs text-bark">
                  Harvest counts the bag × 1.3 for unrecovered birds, against 15% of the fall covey count population.
                  Property total: {report.harvest.harvested} of {report.harvest.budget} birds.
                </p>
              ) : (
                <p className="text-xs text-bark">Log fall covey counts to set harvest budgets for each course.</p>
              )}
            </Section>
          )}

          {report.dogs.length > 0 && (
            <Section title="Dogs (season to date)" icon="pets">
              <Table
                head={["Dog", "Hunts", "Contacts", "Contacts/hr"]}
                rows={report.dogs.map((d) => [d.name, d.hunts, d.contacts, d.perHour != null ? d.perHour.toFixed(2) : "—"])}
              />
            </Section>
          )}

          {(report.population || report.scouting.coveys > 0 || report.scouting.notes > 0) && (
            <Section title="Population and scouting" icon="hearing">
              <ul className="space-y-1 text-sm">
                {report.population && (
                  <li>
                    Fall covey counts: <strong>{report.population.coveys}</strong> coveys heard, about{" "}
                    <strong>{report.population.birds}</strong> birds
                    {report.population.priorCoveys != null && (
                      <span className="text-bark">
                        {" "}
                        (last season {report.population.priorCoveys} coveys, {report.population.priorBirds} birds)
                      </span>
                    )}
                  </li>
                )}
                {(report.scouting.coveys > 0 || report.scouting.notes > 0) && (
                  <li>
                    Scouting in this period: <strong>{report.scouting.coveys}</strong> coveys located,{" "}
                    <strong>{report.scouting.notes}</strong> habitat notes
                  </li>
                )}
              </ul>
            </Section>
          )}

          {report.highlights.length > 0 && (
            <Section title="Highlights" icon="star">
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {report.highlights.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </Section>
          )}

          {report.yoy.length > 0 && (
            <Section title="Year over year" icon="stacked_line_chart">
              <Table
                head={["Season", "Hunts", "Coveys/hr", "Birds", "Juv/adult", "Wild", "Fall coveys"]}
                rows={[...report.yoy].reverse().map((y) => [
                  y.season.replace(/^20(\d\d)-20(\d\d)$/, "$1–$2"),
                  y.hunts,
                  y.coveysPerHour != null ? y.coveysPerHour.toFixed(1) : "—",
                  y.birds,
                  y.juvPerAdult != null ? y.juvPerAdult.toFixed(2) : "—",
                  y.wildRate != null ? `${Math.round(y.wildRate * 100)}%` : "—",
                  y.countCoveys ?? "—",
                ])}
              />
              <p className="text-xs text-bark">
                Coveys per hour and the fall count are the long-term population index; juveniles per adult reflects the
                nesting season. Download the CSV to chart these in a management plan or slide deck.
              </p>
            </Section>
          )}

          <footer className="pt-2 text-center text-xs text-bark">CoveyTracker · Quail management intelligence · coveytracker.com</footer>
        </article>
      )}
    </div>
  );
}

function Section({ title, icon, accent, children }: { title: string; icon: string; accent?: boolean; children: React.ReactNode }) {
  return (
    <section
      className={`card break-inside-avoid space-y-3 print:shadow-none ${accent ? "border-forest/30 bg-forest-light/40" : ""}`}
    >
      <h3 className="h-section flex items-center gap-2">
        <Icon name={icon} className="text-forest" /> {title}
      </h3>
      {children}
    </section>
  );
}

function KpiGrid({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {kpis.map((k) => {
        const c = change(k);
        const good = c == null || k.higherIsBetter == null ? null : (c >= 0) === k.higherIsBetter;
        return (
          <div key={k.label} className="rounded-xl border border-line bg-white p-2.5">
            <div className="text-xs text-bark">{k.label}</div>
            <div className="font-display text-xl">{formatKpi(k.value, k.format)}</div>
            <div className="text-[11px] text-bark">
              {k.prior != null ? (
                <>
                  last yr {formatKpi(k.prior, k.format)}
                  {c != null && Math.abs(c) >= 0.005 && (
                    <span className={`ml-1 font-semibold ${good == null ? "text-bark" : good ? "text-forest" : "text-red-700"}`}>
                      {c >= 0 ? "▲" : "▼"} {Math.round(Math.abs(c) * 100)}%
                    </span>
                  )}
                </>
              ) : (
                "no data last yr"
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[320px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-bark">
            {head.map((h, i) => (
              <th key={h} className={`px-1 py-1.5 font-semibold ${i ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line/60 last:border-0">
              {r.map((cell, j) => (
                <td key={j} className={`px-1 py-1.5 ${j ? "text-right tabular-nums" : "font-medium"}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
