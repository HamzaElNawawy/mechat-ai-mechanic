const test = require("node:test");
const assert = require("node:assert/strict");
const { buildFallbackSearch } = require("../services/mechanicService");

test("fallback is an honest map search rather than a fake zero-distance mechanic", () => {
  const [result] = buildFallbackSearch(30.0444, 31.2357);
  assert.equal(result.resultType, "map_search");
  assert.equal(result.distanceKm, null);
  assert.match(result.address, /No verified/);
});
