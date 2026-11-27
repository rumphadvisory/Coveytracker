"use client";

import { useState } from "react";
import { getPosition } from "@/lib/gps";
import { errorMessage } from "@/lib/data";
import { formatCoordinate, parseCoordinate, parsePair, suspectMissingWest, type Axis } from "@/lib/coords";
import Icon from "./Icon";

export interface PropertyValues {
  name: string;
  lat: string;
  lng: string;
}

export function parseCoord(v: string, max: number): number | null {
  return parseCoordinate(v, max === 90 ? "lat" : "lng");
}

/** Message for coordinates that were typed but can't be read (blank is allowed). */
export function coordsError(values: PropertyValues): string | null {
  const bad: string[] = [];
  if (values.lat.trim() && parseCoordinate(values.lat, "lat") == null) bad.push("latitude");
  if (values.lng.trim() && parseCoordinate(values.lng, "lng") == null) bad.push("longitude");
  if (!bad.length) return null;
  return `Couldn't read the ${bad.join(" and ")}. Try a form like 31.9466 N, 85.645 W, or paste from Google or Apple Maps.`;
}

/** One coordinate box with a hemisphere switch (N/S or E/W) instead of needing a minus sign. */
function CoordInput({
  axis,
  value,
  onChange,
  onPair,
  disabled,
}: {
  axis: Axis;
  value: string;
  onChange: (v: string) => void;
  onPair: (lat: number, lng: number) => void;
  disabled?: boolean;
}) {
  const parsed = parseCoordinate(value, axis);
  const [pos, neg] = axis === "lat" ? ["N", "S"] : ["E", "W"];
  // Empty boxes show the US default (N / W).
  const hemi = parsed == null ? (axis === "lat" ? pos : neg) : parsed < 0 ? neg : pos;
  const name = axis === "lat" ? "Latitude" : "Longitude";

  return (
    <div className="flex overflow-hidden rounded-xl border border-line bg-white focus-within:border-forest focus-within:ring-2 focus-within:ring-forest/20">
      <input
        aria-label={name}
        className="w-full min-w-0 bg-transparent px-3 py-2.5 text-base text-ink outline-none disabled:bg-sand"
        type="text"
        inputMode="text"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder={axis === "lat" ? "31.9466" : "85.645"}
        disabled={disabled}
        value={value}
        onChange={(e) => {
          // A whole "lat, lng" pasted into either box fills both.
          const pair = parsePair(e.target.value);
          if (pair) onPair(pair.lat, pair.lng);
          else onChange(e.target.value);
        }}
      />
      <button
        type="button"
        onClick={() => parsed != null && onChange(String(-parsed))}
        disabled={disabled || parsed == null}
        className="w-11 shrink-0 border-l border-line bg-sand text-sm font-bold text-forest-dark disabled:text-bark/60"
        aria-label={`${name} is ${hemi}. Tap to switch to ${hemi === pos ? neg : pos}.`}
      >
        {hemi}
      </button>
    </div>
  );
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

  const lat = parseCoordinate(values.lat, "lat");
  const lng = parseCoordinate(values.lng, "lng");
  const west = lat != null && lng != null ? suspectMissingWest(lat, lng) : null;
  const unreadable = coordsError(values);

  function setPair(la: number, ln: number) {
    onChange({ ...values, lat: String(la), lng: String(ln) });
  }

  async function pasteFromMaps() {
    setErr(null);
    try {
      const text = await navigator.clipboard.readText();
      const pair = parsePair(text);
      if (pair) setPair(pair.lat, pair.lng);
      else setErr(`The copied text doesn't look like coordinates: "${text.slice(0, 60)}"`);
    } catch {
      setErr("This browser didn't allow pasting from the button. Press and hold in a box above and choose Paste.");
    }
  }

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
        <span className="label">Property center (for weather and maps)</span>
        <div className="grid grid-cols-2 gap-2">
          <CoordInput axis="lat" value={values.lat} disabled={disabled} onChange={(lat) => onChange({ ...values, lat })} onPair={setPair} />
          <CoordInput axis="lng" value={values.lng} disabled={disabled} onChange={(lng) => onChange({ ...values, lng })} onPair={setPair} />
        </div>

        {lat != null && lng != null && (
          <p className="mt-1 text-xs text-bark">
            Reads as {formatCoordinate(lat, "lat")}, {formatCoordinate(lng, "lng")}
          </p>
        )}
        {west != null && !disabled && (
          <div className="mt-2 flex items-center gap-2 rounded-xl bg-amber-50 p-2.5 text-xs text-amber-900">
            <Icon name="warning" className="text-[18px]" />
            <span className="flex-1">That longitude is east of Greenwich (Asia). US longitudes are West.</span>
            <button type="button" className="btn-secondary min-h-0 px-2.5 py-1 text-xs" onClick={() => onChange({ ...values, lng: String(west) })}>
              Make it W
            </button>
          </div>
        )}
        {unreadable && <p className="mt-1 text-xs text-red-700">{unreadable}</p>}

        {!disabled && (
          <div className="mt-1 flex flex-wrap gap-x-1">
            <button type="button" className="btn-ghost text-xs" onClick={locate} disabled={busy}>
              <Icon name={busy ? "progress_activity" : "my_location"} className={`text-[18px] ${busy ? "animate-spin" : ""}`} />
              Use my current location
            </button>
            <button type="button" className="btn-ghost text-xs" onClick={pasteFromMaps}>
              <Icon name="content_paste" className="text-[18px]" />
              Paste from Maps
            </button>
          </div>
        )}
        {err && <p className="text-xs text-red-700">{err}</p>}
        {!disabled && (
          <p className="mt-1 text-xs text-bark">
            In Google or Apple Maps, press and hold on the property to drop a pin, copy its coordinates, then tap
            Paste from Maps. You can also type them, e.g. 31.9466 N and 85.645 W.
          </p>
        )}
      </div>
    </div>
  );
}
