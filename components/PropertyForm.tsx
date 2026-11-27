"use client";

import { useState } from "react";
import { getPosition } from "@/lib/gps";
import { errorMessage } from "@/lib/data";
import Icon from "./Icon";

export interface PropertyValues {
  name: string;
  lat: string;
  lng: string;
}

export function parseCoord(v: string, max: number): number | null {
  const n = parseFloat(v);
  return Number.isFinite(n) && Math.abs(n) <= max ? n : null;
}

/** Name + center coordinates, with "use my location". */
export default function PropertyFields({
  values,
  onChange,
  disabled,
}: {
  values: PropertyValues;
  onChange: (v: PropertyValues) => void;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function locate() {
    setBusy(true);
    setErr(null);
    try {
      const f = await getPosition();
      onChange({ ...values, lat: f.lat.toFixed(5), lng: f.lng.toFixed(5) });
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="label" htmlFor="pname">
          Property name
        </label>
        <input
          id="pname"
          className="input"
          required
          disabled={disabled}
          placeholder="Longleaf Plantation"
          value={values.name}
          onChange={(e) => onChange({ ...values, name: e.target.value })}
        />
      </div>
      <div>
        <span className="label">Property center (for weather)</span>
        <div className="grid grid-cols-2 gap-2">
          <input
            aria-label="Latitude"
            className="input"
            inputMode="decimal"
            placeholder="Latitude 31.18"
            disabled={disabled}
            value={values.lat}
            onChange={(e) => onChange({ ...values, lat: e.target.value })}
          />
          <input
            aria-label="Longitude"
            className="input"
            inputMode="decimal"
            placeholder="Longitude -84.00"
            disabled={disabled}
            value={values.lng}
            onChange={(e) => onChange({ ...values, lng: e.target.value })}
          />
        </div>
        <button type="button" className="btn-ghost mt-1 text-xs" onClick={locate} disabled={busy || disabled}>
          <Icon name={busy ? "progress_activity" : "my_location"} className={`text-[18px] ${busy ? "animate-spin" : ""}`} />
          Use my current location
        </button>
        {err && <p className="text-xs text-red-700">{err}</p>}
      </div>
    </div>
  );
}
