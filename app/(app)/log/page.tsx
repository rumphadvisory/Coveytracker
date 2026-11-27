"use client";

import { useEffect, useState } from "react";
import HuntWizard from "@/components/HuntWizard";
import { useProperty } from "@/components/PropertyProvider";
import { PageHeader } from "@/components/ui";
import { loadSession, type FieldSession } from "@/lib/fieldSession";

export default function LogPage() {
  const { property } = useProperty();
  const [session, setSession] = useState<FieldSession | null | undefined>(undefined);

  useEffect(() => {
    const fromField = new URLSearchParams(window.location.search).get("from") === "field";
    setSession(fromField ? loadSession(property.id) : null);
  }, [property.id]);

  if (session === undefined) return null;
  return (
    <>
      <PageHeader title="Log Hunt" icon="edit_note" />
      <HuntWizard key={session?.startedAt ?? "new"} session={session} />
    </>
  );
}
