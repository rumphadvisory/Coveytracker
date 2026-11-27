"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import Icon from "@/components/Icon";
import { useProperty } from "@/components/PropertyProvider";
import { CourseSelect, ErrorNote, PageHeader, SeasonSelect } from "@/components/ui";
import { ALL, errorMessage, fetchMarks } from "@/lib/data";
import { watchPosition, type Fix } from "@/lib/gps";
import { currentSeason } from "@/lib/seasons";
import type { GpsMarkRow } from "@/types/database";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-2xl bg-sand-dark" />,
});

export default function MapPage() {
  const { sb, property, courseName, dogName } = useProperty();
  const [season, setSeason] = useState(currentSeason());
  const [course, setCourse] = useState(ALL);
  const [show, setShow] = useState({ covey: true, contact: true });
  const [marks, setMarks] = useState<GpsMarkRow[]>([]);
  const [fix, setFix] = useState<Fix | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchMarks(sb, property.id, season)
      .then((m) => live && setMarks(m))
      .catch((e) => live && setError(errorMessage(e)));

    // Live updates: marks dropped by anyone in the field appear immediately.
    const channel = sb
      .channel(`marks:${property.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "gps_marks", filter: `property_id=eq.${property.id}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const id = (payload.old as Partial<GpsMarkRow>).id;
            setMarks((list) => list.filter((m) => m.id !== id));
            return;
          }
          const row = payload.new as GpsMarkRow;
          if (season !== ALL && row.season !== season) return;
          setMarks((list) => [...list.filter((m) => m.id !== row.id), row]);
        },
      )
      .subscribe();
    return () => {
      live = false;
      sb.removeChannel(channel);
    };
  }, [sb, property.id, season]);

  useEffect(() => watchPosition(setFix), []);

  const shown = useMemo(
    () => marks.filter((m) => show[m.type] && (course === ALL || m.course_id === course)),
    [marks, show, course],
  );
  const coveys = shown.filter((m) => m.type === "covey").length;

  return (
    <>
      <PageHeader title="GPS Map" icon="map">
        <SeasonSelect value={season} onChange={setSeason} allowAll />
        <CourseSelect value={course} onChange={setCourse} allowAll className="w-auto py-2 text-sm" />
      </PageHeader>
      <ErrorNote error={error} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          className={`chip ${show.covey ? "border-covey bg-covey text-white" : ""}`}
          onClick={() => setShow((s) => ({ ...s, covey: !s.covey }))}
        >
          <Icon name="location_on" className="text-[18px]" /> Coveys · {coveys}
        </button>
        <button
          className={`chip ${show.contact ? "border-contact bg-contact text-white" : ""}`}
          onClick={() => setShow((s) => ({ ...s, contact: !s.contact }))}
        >
          <Icon name="pets" className="text-[18px]" /> Contacts · {shown.length - coveys}
        </button>
      </div>
      <MapView
        className="h-[calc(100dvh-330px)] min-h-[320px] md:h-[calc(100dvh-240px)]"
        marks={shown}
        fix={fix}
        courseName={courseName}
        dogName={dogName}
        fitKey={`${season}|${course}|${shown.length > 0}`}
      />
    </>
  );
}
