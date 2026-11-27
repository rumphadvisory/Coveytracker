import { test } from "node:test";
import assert from "node:assert/strict";
import {
  containsPoint,
  parseBoundaryText,
  parseGeoJson,
  parseGpx,
  parseKml,
  parsePointList,
  shapeAcres,
  shapesBounds,
} from "../lib/geo.ts";

// A 1320 ft × 1320 ft square (a quarter-quarter section) is 40 acres.
const LAT = 32.03, LNG = -85.62;
const SIDE_M = 402.336;
const dLat = SIDE_M / 110_861; // metres per degree of latitude near 32°N
const dLng = SIDE_M / (111_320 * Math.cos((LAT * Math.PI) / 180));
const square = [
  [LNG, LAT],
  [LNG + dLng, LAT],
  [LNG + dLng, LAT + dLat],
  [LNG, LAT + dLat],
  [LNG, LAT],
];
const kmlCoords = square.map(([x, y]) => `${x},${y},0`).join(" ");

test("acreage of a 40-acre quarter-quarter section", () => {
  const acres = shapeAcres({ name: "QQ", rings: [square.slice(0, 4) as [number, number][]] });
  assert.ok(Math.abs(acres - 40) < 0.5, `got ${acres}`);
});

test("KML polygons from Google Earth / onX, with names, holes and closed lines", () => {
  const kml = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>
    <Placemark><name><![CDATA[Big Woods & Creek]]></name><Polygon><outerBoundaryIs><LinearRing>
      <coordinates>${kmlCoords}</coordinates></LinearRing></outerBoundaryIs>
      <innerBoundaryIs><LinearRing><coordinates>${LNG + dLng * 0.4},${LAT + dLat * 0.4} ${LNG + dLng * 0.6},${LAT + dLat * 0.4} ${LNG + dLng * 0.6},${LAT + dLat * 0.6} ${LNG + dLng * 0.4},${LAT + dLat * 0.4}</coordinates></LinearRing></innerBoundaryIs>
    </Polygon></Placemark>
    <Placemark><name>Walked line</name><LineString><coordinates>${kmlCoords}</coordinates></LineString></Placemark>
    <Placemark><name>Gate</name><Point><coordinates>${LNG},${LAT}</coordinates></Point></Placemark>
  </Document></kml>`;
  const shapes = parseKml(kml);
  assert.deepEqual(shapes.map((s) => s.name), ["Big Woods & Creek", "Walked line"]); // point skipped
  assert.equal(shapes[0].rings.length, 2); // outline + hole
  assert.equal(shapes[0].rings[0].length, 4); // closing duplicate removed
  assert.ok(shapeAcres(shapes[0]) < shapeAcres(shapes[1])); // hole subtracted
  assert.equal(containsPoint(shapes, LAT + dLat * 0.1, LNG + dLng * 0.1), true);
  assert.equal(containsPoint([shapes[0]], LAT + dLat * 0.5, LNG + dLng * 0.5), false); // in the hole
  assert.equal(containsPoint(shapes, LAT - 0.01, LNG), false);
});

test("GPX tracks, routes and corner waypoints", () => {
  const trkpts = square.map(([x, y]) => `<trkpt lat="${y}" lon="${x}"><ele>100</ele></trkpt>`).join("");
  assert.deepEqual(parseGpx(`<gpx><trk><name>Boundary walk</name><trkseg>${trkpts}</trkseg></trk></gpx>`).map((s) => s.name), ["Boundary walk"]);
  const wpts = square.slice(0, 4).map(([x, y], i) => `<wpt lon='${x}' lat='${y}'><name>C${i}</name></wpt>`).join("");
  const w = parseGpx(`<gpx>${wpts}</gpx>`);
  assert.equal(w.length, 1);
  assert.ok(Math.abs(shapeAcres(w[0]) - 40) < 0.5);
});

test("GeoJSON features and multipolygons keep their names", () => {
  const fc = {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { name: "North tract" }, geometry: { type: "Polygon", coordinates: [square] } },
      { type: "Feature", properties: { NAME: "Fields" }, geometry: { type: "MultiPolygon", coordinates: [[square], [square]] } },
      { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [LNG, LAT] } },
    ],
  };
  assert.deepEqual(parseGeoJson(fc).map((s) => s.name), ["North tract", "Fields (1)", "Fields (2)"]);
  assert.equal(parseBoundaryText("tracts.geojson", JSON.stringify(fc)).length, 3);
});

test("pasted point lists in mixed formats; blank lines split areas", () => {
  const text = [
    `${LAT}, ${LNG}`,
    `${LAT} N ${-LNG} W`,
    `31°56'47.8"N 85°38'42.0"W`,
    "not a point",
    "",
    `${LAT}, ${LNG}`,
    `${LAT + 0.01}, ${LNG}`,
    `${LAT + 0.01}, ${LNG + 0.01}`,
  ].join("\n");
  const { shapes, badLines } = parsePointList(text, "Field");
  assert.deepEqual(badLines, [4]);
  // First area has only 2 distinct points after de-duplication, so only the second survives.
  assert.deepEqual(shapes.map((s) => s.name), ["Field"]);
  assert.equal(shapes[0].rings[0].length, 3);
});

test("bounding box", () => {
  const b = shapesBounds([{ name: "a", rings: [square.slice(0, 4) as [number, number][]] }])!;
  assert.ok(Math.abs(b.south - LAT) < 1e-9 && Math.abs(b.west - LNG) < 1e-9);
  assert.equal(shapesBounds([]), null);
});

test("KMZ (zipped KML) and a helpful shapefile message", async () => {
  const { zipSync, strToU8 } = await import("fflate");
  const { readBoundaryFile } = await import("../lib/boundaryFiles.ts");
  const kml = `<kml><Placemark><name>Zipped</name><Polygon><outerBoundaryIs><LinearRing><coordinates>${kmlCoords}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></kml>`;
  const kmz = zipSync({ "doc.kml": strToU8(kml), "files/icon.png": new Uint8Array([1, 2, 3]) });
  const shapes = await readBoundaryFile(new File([kmz], "WindSong.kmz"));
  assert.deepEqual(shapes.map((s) => s.name), ["Zipped"]);
  await assert.rejects(readBoundaryFile(new File([new Uint8Array(4)], "parcels.zip")), /Shapefiles aren't supported yet/);
});
