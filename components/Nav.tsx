"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Icon from "./Icon";
import { useProperty } from "./PropertyProvider";

export const NAV_ITEMS = [
  { href: "/field", label: "Field", icon: "my_location", primary: true },
  { href: "/scout", label: "Scout", icon: "explore", primary: true },
  { href: "/log", label: "Log Hunt", icon: "edit_note" },
  { href: "/hunts", label: "Hunts", icon: "list_alt", primary: true },
  { href: "/map", label: "Map", icon: "map", primary: true },
  { href: "/weather", label: "Weather", icon: "partly_cloudy_day" },
  { href: "/dogs", label: "Dogs", icon: "pets" },
  { href: "/courses", label: "Courses", icon: "landscape" },
  { href: "/counts", label: "Covey Counts", icon: "hearing" },
  { href: "/harvest", label: "Harvest", icon: "speed" },
  { href: "/boundaries", label: "Boundaries", icon: "polyline" },
  { href: "/season", label: "Seasons", icon: "insights" },
  { href: "/report", label: "Reports", icon: "summarize" },
  { href: "/manage", label: "Manage", icon: "settings" },
] as const;

function isActive(path: string, href: string) {
  return path === href || path.startsWith(`${href}/`);
}

export default function Nav() {
  const path = usePathname();
  const { property, memberships, switchProperty } = useProperty();
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => setMoreOpen(false), [path]);

  const secondaryActive = NAV_ITEMS.some((i) => !("primary" in i) && isActive(path, i.href));

  return (
    <>
      <header className="sticky top-0 z-[1000] border-b print:hidden border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2">
          <Link href="/field" className="flex shrink-0 items-center gap-2">
            <Image src="/logo-mark.png" alt="CoveyTracker" width={48} height={48} className="h-12 w-12" />
            <span className="hidden font-display text-lg sm:inline">CoveyTracker</span>
          </Link>
          <div className="ml-auto min-w-0">
            {memberships.length > 1 ? (
              <select
                aria-label="Property"
                className="input max-w-[220px] truncate py-1.5 text-sm"
                value={property.id}
                onChange={(e) => switchProperty(e.target.value)}
              >
                {memberships.map((m) => (
                  <option key={m.property.id} value={m.property.id}>
                    {m.property.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="block truncate text-sm font-semibold text-bark">{property.name}</span>
            )}
          </div>
        </div>
        <nav className="mx-auto hidden max-w-6xl gap-1 overflow-x-auto px-4 pb-2 md:flex">
          {NAV_ITEMS.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className={`flex items-center gap-1 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm font-medium ${
                isActive(path, i.href) ? "bg-forest-light text-forest-dark" : "text-bark hover:bg-sand"
              }`}
            >
              <Icon name={i.icon} className="text-[18px]" />
              {i.label}
            </Link>
          ))}
        </nav>
      </header>

      {/* Mobile bottom bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-[1000] border-t border-line bg-white md:hidden print:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="grid grid-cols-5">
          {NAV_ITEMS.filter((i) => "primary" in i).map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
                isActive(path, i.href) ? "text-forest" : "text-bark"
              }`}
            >
              <Icon name={i.icon} fill={isActive(path, i.href)} />
              {i.label}
            </Link>
          ))}
          <button
            onClick={() => setMoreOpen((o) => !o)}
            className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
              moreOpen || secondaryActive ? "text-forest" : "text-bark"
            }`}
          >
            <Icon name="menu" />
            More
          </button>
        </div>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-[999] bg-black/30 md:hidden" onClick={() => setMoreOpen(false)}>
          <div
            className="absolute inset-x-0 bottom-[60px] rounded-t-2xl bg-white p-4 shadow-xl"
            style={{ marginBottom: "env(safe-area-inset-bottom)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="grid grid-cols-3 gap-2">
              {NAV_ITEMS.filter((i) => !("primary" in i)).map((i) => (
                <Link
                  key={i.href}
                  href={i.href}
                  className={`flex flex-col items-center gap-1 rounded-xl p-3 text-xs font-medium ${
                    isActive(path, i.href) ? "bg-forest-light text-forest-dark" : "text-ink hover:bg-sand"
                  }`}
                >
                  <Icon name={i.icon} />
                  {i.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
