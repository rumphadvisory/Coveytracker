// Browser side of boundary import: read the picked file (unzipping KMZ) and hand the text to
// the parsers in lib/geo.ts.
import { strFromU8, unzipSync } from "fflate";
import { parseBoundaryText, type BoundaryShape } from "./geo.ts";

export const BOUNDARY_FILE_TYPES = ".kml,.kmz,.gpx,.geojson,.json,.txt,.csv";

export async function readBoundaryFile(file: File): Promise<BoundaryShape[]> {
  const name = file.name;
  if (name.toLowerCase().endsWith(".kmz")) {
    // KMZ is a zip with a .kml inside (usually doc.kml).
    const files = unzipSync(new Uint8Array(await file.arrayBuffer()));
    const kml = Object.keys(files).find((k) => k.toLowerCase().endsWith(".kml"));
    if (!kml) throw new Error("That KMZ file doesn't contain a KML map.");
    return parseBoundaryText(kml, strFromU8(files[kml]));
  }
  if (name.toLowerCase().endsWith(".zip") || name.toLowerCase().endsWith(".shp")) {
    throw new Error(
      "Shapefiles aren't supported yet. In Google Earth, QGIS or your GIS tool, export as KML or GeoJSON and upload that.",
    );
  }
  return parseBoundaryText(name, await file.text());
}
