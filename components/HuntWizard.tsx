"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { errorMessage } from "@/lib/data";
import { enqueue, insertOp, updateOp, type Op } from "@/lib/outbox";
import { clearSession, contactsByDog, sessionHours, type FieldSession } from "@/lib/fieldSession";
import { localDateISO, seasonForDate, todayISO } from "@/lib/seasons";
import { fetchConditions, huntWeatherFields } from "@/lib/weather";
import DogChipGrid from "./DogChipGrid";
import Icon from "./Icon";
import { useProperty } from "./PropertyProvider";
import { CourseSelect, ErrorNote, NumberField } from "./ui";

export interface HuntForm {
  date: string;
  course_id: string;
  hours_spent: number;
  weather: string;
  temperature: string;
  wind: string;
  ground: string;
  barometric_pressure: string;
  comments: string;
  dogs: { dog_id: string; contacts: number; hours: number }[];
  coveys_pointed: number;
  coveys_shot: number;
  coveys_flushed: number;
  coveys_flushed_wild: number;
  birds_on_covey_rise: number;
  singles_shot: number;
  total_birds_cocks: number;
  total_birds_hens: number;
  total_birds_juvenile: number;
}

const STEPS = ["Basics", "Dogs", "Coveys", "Birds", "Review"] as const;
const GROUND = ["Dry", "Damp", "Wet", "Frost", "Muddy", "Burned"];

function blankForm(): HuntForm {
  return {
    date: todayISO(),
    course_id: "",
    hours_spent: 3,
    weather: "",
    temperature: "",
    wind: "",
    ground: "",
    barometric_pressure: "",
    comments: "",
    dogs: [],
    coveys_pointed: 0,
    coveys_shot: 0,
    coveys_flushed: 0,
    coveys_flushed_wild: 0,
    birds_on_covey_rise: 0,
    singles_shot: 0,
    total_birds_cocks: 0,
    total_birds_hens: 0,
    total_birds_juvenile: 0,
  };
}

function formFromSession(s: FieldSession): HuntForm {
  const hours = sessionHours(s);
  const contacts = contactsByDog(s);
  const coveyMarks = s.marks.filter((m) => m.type === "covey").length;
  return {
    ...blankForm(),
    date: localDateISO(new Date(s.startedAt)),
    course_id: s.courseId,
    hours_spent: hours,
    ...(s.weather ?? {}),
    dogs: Object.entries(contacts).map(([dog_id, n]) => ({ dog_id, contacts: n, hours })),
    coveys_pointed: coveyMarks,
  };
}

export default function HuntWizard({ session }: { session?: FieldSession | null }) {
  const { property, activeDogs, dogName, courseName, courses } = useProperty();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<HuntForm>(() => (session ? formFromSession(session) : blankForm()));
  const [weatherState, setWeatherState] = useState<"idle" | "loading" | "done" | "error">(
    session?.weather ? "done" : "idle",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof HuntForm>(k: K, v: HuntForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function loadWeather() {
    if (property.lat == null || property.lng == null) {
      setWeatherState("error");
      return;
    }
    setWeatherState("loading");
    try {
      const c = await fetchConditions(property.lat, property.lng);
      setForm((f) => ({ ...f, ...huntWeatherFields(c) }));
      setWeatherState("done");
    } catch {
      setWeatherState("error");
    }
  }

  // Auto-fill weather when starting a fresh hunt for today.
  useEffect(() => {
    if (!session?.weather && form.date === todayISO() && !form.weather) loadWeather();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalCoveysSeen = form.coveys_pointed + form.coveys_flushed_wild;
  const totalAdult = form.total_birds_cocks + form.total_birds_hens;
  const totalContacts = form.dogs.reduce((a, d) => a + d.contacts, 0);
  const season = seasonForDate(form.date);

  const toggleDog = (id: string) =>
    setForm((f) => ({
      ...f,
      dogs: f.dogs.some((d) => d.dog_id === id)
        ? f.dogs.filter((d) => d.dog_id !== id)
        : [...f.dogs, { dog_id: id, contacts: 0, hours: f.hours_spent }],
    }));

  const updateDog = (id: string, patch: Partial<HuntForm["dogs"][number]>) =>
    setForm((f) => ({ ...f, dogs: f.dogs.map((d) => (d.dog_id === id ? { ...d, ...patch } : d)) }));

  const stepValid = useMemo(() => {
    if (step === 0) return Boolean(form.date && form.course_id);
    return true;
  }, [step, form.date, form.course_id]);

  function save() {
    setSaving(true);
    setError(null);
    try {
      // Saved on the phone first and uploaded in order by QueueSync, so this works with no signal:
      // the hunt, then its dog runs, then the field session's marks are pointed at it.
      const { dogs, ...rest } = form;
      const huntId = crypto.randomUUID();
      const ops: Op[] = [
        insertOp(property.id, "hunts", {
          ...rest,
          id: huntId,
          property_id: property.id,
          season,
          course_id: form.course_id || null,
        }),
        ...dogs.map((d) =>
          insertOp(property.id, "dog_runs", {
            id: crypto.randomUUID(),
            hunt_id: huntId,
            dog_id: d.dog_id,
            contacts: d.contacts,
            hours: d.hours,
          }),
        ),
      ];
      if (session?.marks.length) {
        ops.push(updateOp(property.id, "gps_marks", session.marks.map((m) => m.id), { hunt_id: huntId }));
      }
      enqueue(property.id, ...ops);
      if (session) clearSession(property.id);
      router.push("/hunts");
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  }

  // Dogs that aren't active anymore but are on this hunt (e.g. from the field session).
  const chipDogs = [
    ...activeDogs,
    ...form.dogs
      .filter((d) => !activeDogs.some((a) => a.id === d.dog_id))
      .map((d) => ({ id: d.dog_id, name: dogName(d.dog_id), active: false, property_id: property.id, created_at: "" })),
  ];

  return (
    <div className="mx-auto max-w-2xl">
      {/* Step indicator */}
      <ol className="mb-4 grid grid-cols-5 gap-1">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              type="button"
              disabled={i > step && !stepValid}
              onClick={() => (i <= step || stepValid ? setStep(i) : null)}
              className="w-full text-left"
            >
              <div className={`h-1.5 rounded-full ${i <= step ? "bg-forest" : "bg-line"}`} />
              <div className={`mt-1 text-[11px] font-semibold ${i === step ? "text-forest" : "text-bark"}`}>
                {i + 1}. {s}
              </div>
            </button>
          </li>
        ))}
      </ol>

      {session && (
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-forest-light p-3 text-sm text-forest-dark">
          <Icon name="my_location" />
          From Field Mode: {session.marks.length} GPS mark{session.marks.length === 1 ? "" : "s"} will be attached to
          this hunt.
        </div>
      )}

      <ErrorNote error={error} />

      <div className="card space-y-4">
        {step === 0 && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="date">
                  Date
                </label>
                <input id="date" type="date" className="input" value={form.date} onChange={(e) => set("date", e.target.value)} />
                <div className="mt-1 text-xs text-bark">Season {season}</div>
              </div>
              <NumberField label="Hours" value={form.hours_spent} step={0.25} onChange={(n) => set("hours_spent", n)} />
            </div>
            <div>
              <label className="label" htmlFor="course">
                Course
              </label>
              <CourseSelect id="course" value={form.course_id} onChange={(v) => set("course_id", v)} required />
              {courses.length === 0 && <p className="mt-1 text-xs text-bark">Add courses in Manage first.</p>}
            </div>

            <div className="flex items-center justify-between">
              <span className="label mb-0">Conditions</span>
              <button type="button" className="btn-ghost min-h-0 py-1 text-xs" onClick={loadWeather}>
                <Icon name={weatherState === "loading" ? "progress_activity" : "refresh"} className={`text-[16px] ${weatherState === "loading" ? "animate-spin" : ""}`} />
                {weatherState === "done" ? "Refresh weather" : "Fetch weather"}
              </button>
            </div>
            {weatherState === "error" && (
              <p className="-mt-2 text-xs text-amber-700">
                {property.lat == null ? "Set the property's GPS center in Manage to auto-fill weather." : "Couldn't fetch weather — enter it manually."}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  ["weather", "Weather"],
                  ["temperature", "Temperature"],
                  ["wind", "Wind"],
                  ["barometric_pressure", "Barometer"],
                ] as const
              ).map(([k, label]) => (
                <div key={k}>
                  <label className="label" htmlFor={k}>
                    {label}
                  </label>
                  <input id={k} className="input" value={form[k]} onChange={(e) => set(k, e.target.value)} />
                </div>
              ))}
            </div>
            <div>
              <span className="label">Ground</span>
              <div className="flex flex-wrap gap-2">
                {GROUND.map((g) => (
                  <button
                    key={g}
                    type="button"
                    className={`chip ${form.ground === g ? "chip-on" : ""}`}
                    onClick={() => set("ground", form.ground === g ? "" : g)}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label" htmlFor="comments">
                Comments
              </label>
              <textarea
                id="comments"
                rows={3}
                className="input"
                value={form.comments}
                onChange={(e) => set("comments", e.target.value)}
              />
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <div>
              <span className="label">Dogs hunted</span>
              <DogChipGrid dogs={chipDogs} selected={form.dogs.map((d) => d.dog_id)} onToggle={toggleDog} />
            </div>
            {form.dogs.length > 0 && (
              <div className="space-y-3">
                {form.dogs.map((d) => (
                  <div key={d.dog_id} className="rounded-xl border border-line p-3">
                    <div className="mb-2 flex items-center font-semibold">
                      <Icon name="pets" className="mr-1 text-[18px] text-contact" />
                      {dogName(d.dog_id)}
                      <button type="button" className="ml-auto text-bark" onClick={() => toggleDog(d.dog_id)} aria-label="Remove dog">
                        <Icon name="close" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <NumberField label="Contacts" value={d.contacts} onChange={(n) => updateDog(d.dog_id, { contacts: Math.round(n) })} />
                      <NumberField label="Hours" value={d.hours} step={0.25} onChange={(n) => updateDog(d.dog_id, { hours: n })} />
                    </div>
                  </div>
                ))}
                <div className="text-right text-sm text-bark">
                  Total contacts: <strong className="text-ink">{totalContacts}</strong>
                </div>
              </div>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Pointed" value={form.coveys_pointed} onChange={(n) => set("coveys_pointed", Math.round(n))} />
              <NumberField label="Shot" value={form.coveys_shot} onChange={(n) => set("coveys_shot", Math.round(n))} />
              <NumberField label="Flushed" value={form.coveys_flushed} onChange={(n) => set("coveys_flushed", Math.round(n))} />
              <NumberField label="Flushed wild" value={form.coveys_flushed_wild} onChange={(n) => set("coveys_flushed_wild", Math.round(n))} />
            </div>
            <AutoCalc label="Total coveys seen" value={totalCoveysSeen} formula="pointed + flushed wild" />
          </>
        )}

        {step === 3 && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Birds on covey rise" value={form.birds_on_covey_rise} onChange={(n) => set("birds_on_covey_rise", Math.round(n))} />
              <NumberField label="Singles shot" value={form.singles_shot} onChange={(n) => set("singles_shot", Math.round(n))} />
              <NumberField label="Cocks" value={form.total_birds_cocks} onChange={(n) => set("total_birds_cocks", Math.round(n))} />
              <NumberField label="Hens" value={form.total_birds_hens} onChange={(n) => set("total_birds_hens", Math.round(n))} />
              <NumberField label="Juvenile" value={form.total_birds_juvenile} onChange={(n) => set("total_birds_juvenile", Math.round(n))} />
            </div>
            <AutoCalc label="Total adult birds" value={totalAdult} formula="cocks + hens" />
          </>
        )}

        {step === 4 && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
            {(
              [
                ["Date", form.date],
                ["Season", season],
                ["Course", courseName(form.course_id)],
                ["Hours", form.hours_spent],
                ["Weather", form.weather || "—"],
                ["Temp", form.temperature || "—"],
                ["Wind", form.wind || "—"],
                ["Barometer", form.barometric_pressure || "—"],
                ["Ground", form.ground || "—"],
                ["Dogs", form.dogs.map((d) => `${dogName(d.dog_id)} (${d.contacts})`).join(", ") || "—"],
                ["Contacts", totalContacts],
                ["Pointed", form.coveys_pointed],
                ["Shot", form.coveys_shot],
                ["Flushed", form.coveys_flushed],
                ["Flushed wild", form.coveys_flushed_wild],
                ["Coveys seen", totalCoveysSeen],
                ["Birds on rise", form.birds_on_covey_rise],
                ["Singles shot", form.singles_shot],
                ["Cocks", form.total_birds_cocks],
                ["Hens", form.total_birds_hens],
                ["Adult", totalAdult],
                ["Juvenile", form.total_birds_juvenile],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="border-b border-line pb-1">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-bark">{k}</div>
                <div className="font-medium">{v}</div>
              </div>
            ))}
            {form.comments && (
              <div className="col-span-full">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-bark">Comments</div>
                <div className="whitespace-pre-wrap">{form.comments}</div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 flex gap-3">
        {step > 0 && (
          <button type="button" className="btn-secondary flex-1" onClick={() => setStep((s) => s - 1)}>
            <Icon name="arrow_back" /> Back
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button type="button" className="btn-primary flex-1" disabled={!stepValid} onClick={() => setStep((s) => s + 1)}>
            Next <Icon name="arrow_forward" />
          </button>
        ) : (
          <button type="button" className="btn-primary flex-1" disabled={saving || !form.course_id} onClick={save}>
            <Icon name="save" /> {saving ? "Saving…" : "Save hunt"}
          </button>
        )}
      </div>
    </div>
  );
}

function AutoCalc({ label, value, formula }: { label: string; value: number; formula: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-forest-light px-4 py-3">
      <div>
        <div className="font-semibold text-forest-dark">{label}</div>
        <div className="text-xs text-forest-dark/70">Auto: {formula}</div>
      </div>
      <div className="font-display text-3xl tabular-nums text-forest-dark">{value}</div>
    </div>
  );
}
