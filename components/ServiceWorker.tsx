"use client";

import { useEffect } from "react";

const WARM = ["/field", "/log", "/map", "/hunts", "/counts"];

/** Registers the service worker (production only) and pre-caches the field pages. */
export default function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        // Assets this page already loaded before the worker took control (scripts, CSS, icon font)
        // so the app renders offline on the next open, not just the one after.
        const assets = performance
          .getEntriesByType("resource")
          .map((e) => e.name)
          .filter((u) => {
            const url = new URL(u);
            return (
              (url.origin === location.origin && url.pathname.startsWith("/_next/static/")) ||
              url.hostname === "fonts.googleapis.com" ||
              url.hostname === "fonts.gstatic.com"
            );
          });
        reg.active?.postMessage({ type: "warm", urls: WARM, assets });
      })
      .catch(() => {});
  }, []);
  return null;
}
