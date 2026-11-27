import { test } from "node:test";
import assert from "node:assert/strict";
import { formatCoordinate, parseCoordinate as p, parsePair, suspectMissingWest } from "../lib/coords.ts";

test("decimal degrees with sign or hemisphere letter", () => {
  assert.equal(p("31.9466", "lat"), 31.9466);
  assert.equal(p("-85.645", "lng"), -85.645);
  assert.equal(p("85.645 W", "lng"), -85.645);
  assert.equal(p("W 85.645", "lng"), -85.645);
  assert.equal(p("85.645w", "lng"), -85.645);
  assert.equal(p("85.645° W", "lng"), -85.645);
  assert.equal(p("-85.645 W", "lng"), -85.645); // redundant but clear
  assert.equal(p("31.9466 N", "lat"), 31.9466);
  assert.equal(p("33.9 S", "lat"), -33.9);
});

test("degrees-minutes-seconds and degrees-minutes", () => {
  assert.equal(p(`85°38'42" W`, "lng"), -85.645);
  assert.equal(p("85 38 42 W", "lng"), -85.645);
  assert.equal(p(`31°56'47.76"N`, "lat"), 31.9466);
  assert.equal(p("31°56.796' N", "lat"), 31.9466);
});

test("rejects things that would be guesses", () => {
  assert.equal(p("", "lat"), null);
  assert.equal(p("85.6 N", "lng"), null); // wrong hemisphere letter for longitude
  assert.equal(p("31.9 W", "lat"), null);
  assert.equal(p("-85.6 E", "lng"), null); // contradicts itself
  assert.equal(p("95", "lat"), null); // out of range
  assert.equal(p("85 61 00 W", "lng"), null); // 61 minutes
  assert.equal(p("abc", "lat"), null);
  assert.equal(p("31.9 2 N", "lat"), null); // decimal degrees can't be followed by minutes
});

test("pairs pasted from Google or Apple Maps", () => {
  assert.deepEqual(parsePair("31.9466, -85.645"), { lat: 31.9466, lng: -85.645 });
  assert.deepEqual(parsePair("31.9466° N, 85.6450° W"), { lat: 31.9466, lng: -85.645 });
  assert.deepEqual(parsePair(`31°56'47.8"N 85°38'42.0"W`), { lat: 31.946611, lng: -85.645 });
  assert.deepEqual(parsePair("31.9466 -85.645"), { lat: 31.9466, lng: -85.645 });
  assert.equal(parsePair("31.9466"), null);
  assert.equal(parsePair("-85.645"), null);
});

test("formatting and the missing-minus check", () => {
  assert.equal(formatCoordinate(-85.645, "lng"), "85.64500° W");
  assert.equal(formatCoordinate(31.9466, "lat"), "31.94660° N");
  assert.equal(suspectMissingWest(31.9466, 85.645), -85.645);
  assert.equal(suspectMissingWest(31.9466, -85.645), null);
  assert.equal(suspectMissingWest(-33.9, 151.2), null); // Sydney is legitimately east
});
