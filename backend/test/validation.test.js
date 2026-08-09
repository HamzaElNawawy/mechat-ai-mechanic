const test = require("node:test");
const assert = require("node:assert/strict");
const {
  validateLocation,
  validateMessage,
  validateVehicle,
} = require("../services/requestValidation");

test("accepts zero latitude and longitude", () => {
  assert.deepEqual(validateLocation({ lat: 0, lng: 0 }).value, { lat: 0, lng: 0 });
});

test("rejects non-numeric and out-of-range coordinates", () => {
  assert.match(validateLocation({ lat: "30", lng: 31 }).error, /invalid/i);
  assert.match(validateLocation({ lat: 91, lng: 31 }).error, /invalid/i);
  assert.match(validateLocation({ lat: 30, lng: -181 }).error, /invalid/i);
});

test("trims messages and rejects oversized input", () => {
  assert.equal(validateMessage("  wheel noise  ").value, "wheel noise");
  assert.match(validateMessage("x".repeat(2001)).error, /characters/i);
});

test("validates and normalizes vehicle details", () => {
  assert.deepEqual(validateVehicle({ year: "2020", makeModel: "  Toyota   Corolla " }).value, {
    year: 2020,
    makeModel: "Toyota Corolla",
  });
  assert.match(validateVehicle({ year: 1800, makeModel: "Ford" }).error, /year/i);
  assert.match(validateVehicle({ year: 2026, makeModel: "<script>" }).error, /characters/i);
});
