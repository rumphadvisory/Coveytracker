"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import Icon from "@/components/Icon";
import OfflineMaps from "@/components/OfflineMaps";
import { useProperty } from "@/components/PropertyProvider";
import { CourseSelect, ErrorNote, OfflineNote, PageHeader, SeasonSelect } from "@/components/ui";
import { useMarks } from "@/components/useCounts";
import { ALL } from "@/lib/data";
import { watchPosition, type Fix } from "@/lib/gps";
import { currentSeason } from "@/lib/seasons";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-2xl bg-sand-dark" />,
});

export default function MapPage() {
  const { sb, property, courseName, dogName } = useProperty();
  const [season, setSeason] = useState(currentSeason());
  const [course, setCourse] = useState(ALL);
  const [show, setShow] = useState({ covey: true, contact: true });
  const [fix, setFix] = useState<Fix | null>(null);
  const { marks: loaded, error, offline, reload } = useMarks(season);
  const marks = useMemo(() => loaded ?? [], [loaded]);

  // Live updates: marks dropped by anyone in the field appear without reloading the page.
  useEffect(() => {
    const channel = sb
      .channel(`marks:${property.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "gps_marks", filter: `property_id=eq.${property.id}` },
        () => reload(),
      )
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, [sb, property.id, reload]);

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
      <OfflineNote show={offline} />
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
      <OfflineMaps />
    </>
  );
}
