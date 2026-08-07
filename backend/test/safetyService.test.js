const test = require("node:test");
const assert = require("node:assert/strict");
const { assessImmediateDanger } = require("../services/safetyService");

test("detects brake failure before an LLM call", () => {
  const result = assessImmediateDanger("My brake pedal goes to the floor and I cannot stop");
  assert.equal(result.severity, "critical");
  assert.equal(result.needsMechanic, true);
  assert.match(result.message, /do not continue driving/i);
});

test("detects overheating and tells the user to shut off the engine", () => {
  const result = assessImmediateDanger("The car is overheating and the temperature is red");
  assert.equal(result.action, "shut_off_engine");
});

test("recognizes common natural descriptions of an active vehicle fire", () => {
  const messages = [
    "My car is on fire",
    "The vehicle caught fire",
    "There are flames coming from the engine",
    "The engine bay is in flames",
    "Smoke is pouring from under the bonnet",
  ];

  for (const message of messages) {
    const result = assessImmediateDanger(message);
    assert.equal(result?.reason, "fire_or_smoke", message);
  }
});

test("recognizes varied brake, steering, fuel, and overheating wording", () => {
  assert.equal(assessImmediateDanger("The brake pedal has no pressure")?.reason, "brake_failure");
  assert.equal(assessImmediateDanger("My steering is gone")?.reason, "steering_failure");
  assert.equal(assessImmediateDanger("Petrol is dripping under the car")?.reason, "fuel_leak");
  assert.equal(assessImmediateDanger("The temperature needle is maxed out")?.reason, "overheating");
});

test("does not trigger on a locally negated symptom", () => {
  assert.equal(assessImmediateDanger("There is no smoke from under the hood"), null);
});

test("does not classify a normal maintenance question as immediate danger", () => {
  assert.equal(assessImmediateDanger("When should I replace the cabin air filter?"), null);
});
