// Thin wrapper over the browser Geolocation API.

export interface Fix {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
}

export const GEO_OPTIONS: PositionOptions = { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 };

export function gpsSupported(): boolean {
  return typeof navigator !== "undefined" && "geolocation" in navigator;
}

function toFix(p: GeolocationPosition): Fix {
  return { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, timestamp: p.timestamp };
}

/** Start watching position. Returns a stop function. */
export function watchPosition(onFix: (f: Fix) => void, onError?: (msg: string) => void): () => void {
  if (!gpsSupported()) {
    onError?.("GPS not available on this device");
    return () => {};
  }
  const id = navigator.geolocation.watchPosition(
    (p) => onFix(toFix(p)),
    (e) => onError?.(geoErrorMessage(e)),
    GEO_OPTIONS,
  );
  return () => navigator.geolocation.clearWatch(id);
}

export function getPosition(): Promise<Fix> {
  return new Promise((resolve, reject) => {
    if (!gpsSupported()) return reject(new Error("GPS not available on this device"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(toFix(p)),
      (e) => reject(new Error(geoErrorMessage(e))),
      GEO_OPTIONS,
    );
  });
}

function geoErrorMessage(e: GeolocationPositionError): string {
  switch (e.code) {
    case e.PERMISSION_DENIED:
      return "Location permission denied — enable it in your browser settings";
    case e.POSITION_UNAVAILABLE:
      return "GPS position unavailable";
    case e.TIMEOUT:
      return "GPS timed out — still searching";
    default:
      return e.message || "GPS error";
  }
}

export function formatCoord(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

/** Default map center: south Georgia quail country. */
export const DEFAULT_CENTER: [number, number] = [31.18, -84.0];
