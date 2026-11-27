import { test } from "node:test";
import assert from "node:assert/strict";
import { bboxAround, offlineUrls, tileXY, tilesInBBox, formatBytes } from "../lib/tiles.ts";

test("tile coordinates match the standard web-map grid", () => {
  assert.deepEqual(tileXY(0, 0, 1), { x: 1, y: 1 });
  assert.deepEqual(tileXY(31.18, -84.0, 10), { x: 273, y: 418 }); // south Georgia (checked independently)
});

test("a 2-mile box around a property is about 4 miles wide", () => {
  const b = bboxAround(32.03, -85.62, 2);
  const widthMiles = (b.east - b.west) * 69.17 * Math.cos((32.03 * Math.PI) / 180);
  const heightMiles = (b.north - b.south) * 69.17;
  assert.ok(Math.abs(widthMiles - 4) < 0.05, `width ${widthMiles}`);
  assert.ok(Math.abs(heightMiles - 4) < 0.05, `height ${heightMiles}`);
});

test("tiles cover zooms 11–16 and grow with radius", () => {
  const small = tilesInBBox(bboxAround(32.03, -85.62, 1));
  const big = tilesInBBox(bboxAround(32.03, -85.62, 3));
  assert.deepEqual([...new Set(small.map((t) => t.z))], [11, 12, 13, 14, 15, 16]);
  assert.ok(big.length > small.length * 4);
  const urls = offlineUrls(bboxAround(32.03, -85.62, 1), ["topo", "aerial"]);
  assert.equal(urls.length, small.length * 2);
  assert.match(urls[0], /USGSTopo\/MapServer\/tile\/11\/\d+\/\d+$/);
  assert.equal(formatBytes(6_150_000), "6.2 MB");
});
