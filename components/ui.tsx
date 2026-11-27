"use client";

import { useMemo, useState } from "react";
import { ALL, fetchSeasons } from "@/lib/data";
import { currentSeason, seasonList } from "@/lib/seasons";
import Icon from "./Icon";
import { useProperty } from "./PropertyProvider";
import { useCachedQuery } from "./useCachedQuery";

export function PageHeader({ title, icon, children }: { title: string; icon?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <h1 className="h-page flex items-center gap-2">
        {icon && <Icon name={icon} className="text-forest" />}
        {title}
      </h1>
      {children && <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

/** Season choices for the current property (always includes the current season). */
export function useSeasons(): string[] {
  const { sb, property } = useProperty();
  const q = useCachedQuery(`seasons:${property.id}`, () => fetchSeasons(sb, property.id));
  return useMemo(() => seasonList(q.data ?? []), [q.data]);
}

/** Shown when a screen is displaying the phone's last-saved copy because there's no signal. */
export function OfflineNote({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="mb-3 flex items-center gap-2 rounded-xl bg-sand-dark p-3 text-sm text-bark">
      <Icon name="cloud_off" className="text-[18px]" />
      No signal — showing what this phone last saved. It updates when you&apos;re back in range.
    </div>
  );
}

export function useSeasonState(initial: string = currentSeason()) {
  return useState<string>(initial);
}

export function SeasonSelect({
  value,
  onChange,
  allowAll = false,
}: {
  value: string;
  onChange: (s: string) => void;
  allowAll?: boolean;
}) {
  const seasons = useSeasons();
  return (
    <select aria-label="Season" className="input w-auto py-2 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
      {allowAll && <option value={ALL}>All seasons</option>}
      {seasons.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}

export function CourseSelect({
  value,
  onChange,
  allowAll = false,
  required = false,
  className = "",
  id,
}: {
  value: string;
  onChange: (id: string) => void;
  allowAll?: boolean;
  required?: boolean;
  className?: string;
  id?: string;
}) {
  const { courses } = useProperty();
  return (
    <select
      id={id}
      aria-label="Course"
      className={`input ${className}`}
      value={value}
      required={required}
      onChange={(e) => onChange(e.target.value)}
    >
      {allowAll ? <option value={ALL}>All courses</option> : <option value="">Select course…</option>}
      {courses.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

export function Empty({ icon, title, children }: { icon: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 py-10 text-center text-bark">
      <Icon name={icon} className="text-4xl text-forest/70" />
      <div className="font-display text-lg text-ink">{title}</div>
      {children && <div className="max-w-sm text-sm">{children}</div>}
    </div>
  );
}

export function Loading() {
  return (
    <div className="flex items-center justify-center py-12 text-bark">
      <Icon name="progress_activity" className="mr-2 animate-spin" /> Loading…
    </div>
  );
}

export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>;
}

export function NumberField({
  label,
  value,
  onChange,
  step = 1,
  min = 0,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
}) {
  const dec = () => onChange(Math.max(min, +(value - step).toFixed(2)));
  const inc = () => onChange(+(value + step).toFixed(2));
  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex items-stretch overflow-hidden rounded-xl border border-line bg-white">
        <button type="button" onClick={dec} className="px-3 text-bark active:bg-sand" aria-label={`Decrease ${label}`}>
          <Icon name="remove" />
        </button>
        <input
          className="w-full min-w-0 border-x border-line py-2.5 text-center text-base tabular-nums outline-none"
          inputMode="decimal"
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => {
            const n = parseFloat(e.target.value);
            onChange(Number.isFinite(n) ? n : 0);
          }}
          aria-label={label}
        />
        <button type="button" onClick={inc} className="px-3 text-bark active:bg-sand" aria-label={`Increase ${label}`}>
          <Icon name="add" />
        </button>
      </div>
    </div>
  );
}
