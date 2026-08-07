const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseDiagnosticReply,
  parseSafetyClassification,
  parseVisionAnalysis,
} = require("../services/groqService");

test("parses a valid structured diagnostic response", () => {
  const result = parseDiagnosticReply(
    JSON.stringify({
      message: "Check the tire pressure.",
      followUpQuestion: "Does the vibration change with speed?",
      severity: "medium",
      action: "continue_cautiously",
      diagnosticState: "continue_troubleshooting",
    })
  );
  assert.match(result.reply, /Does the vibration/);
  assert.equal(result.needsMechanic, false);
});

test("server overrides an unsafe no-referral decision", () => {
  const result = parseDiagnosticReply(
    JSON.stringify({
      message: "Have this inspected.",
      followUpQuestion: null,
      severity: "critical",
      action: "stop_driving",
      diagnosticState: "continue_troubleshooting",
    })
  );
  assert.equal(result.needsMechanic, true);
});

test("does not request location while a useful follow-up question remains", () => {
  const result = parseDiagnosticReply(
    JSON.stringify({
      message: "Several causes are still possible.",
      followUpQuestion: "Does the noise change when you press the brake pedal?",
      severity: "medium",
      action: "professional_inspection",
      diagnosticState: "professional_help_required",
    })
  );
  assert.equal(result.needsMechanic, false);
});

test("requests a mechanic only after troubleshooting is exhausted", () => {
  const result = parseDiagnosticReply(
    JSON.stringify({
      message: "The safe remote checks are exhausted and this needs hands-on testing.",
      followUpQuestion: null,
      severity: "medium",
      action: "professional_inspection",
      diagnosticState: "professional_help_required",
    })
  );
  assert.equal(result.needsMechanic, true);
});

test("rejects invalid or incomplete model output", () => {
  assert.throws(() => parseDiagnosticReply("not json"), /invalid diagnostic JSON/);
  assert.throws(() => parseDiagnosticReply('{"message":"hello"}'), /invalid schema/);
});

test("parses only consistent semantic safety classifications", () => {
  assert.equal(
    parseSafetyClassification('{"isEmergency":true,"category":"fire_or_smoke"}'),
    "fire_or_smoke"
  );
  assert.equal(parseSafetyClassification('{"isEmergency":false,"category":"none"}'), null);
  assert.throws(
    () => parseSafetyClassification('{"isEmergency":false,"category":"brake_failure"}'),
    /invalid schema/
  );
});

test("parses bounded structured visual observations", () => {
  const result = parseVisionAnalysis(
    JSON.stringify({
      imageRelevant: true,
      observations: ["Amber check-engine icon is illuminated"],
      visibleText: "CHECK ENGINE",
      safetyCategory: "none",
      limitations: "The instrument cluster is slightly blurred.",
    })
  );
  assert.equal(result.imageRelevant, true);
  assert.equal(result.observations.length, 1);
  assert.throws(
    () =>
      parseVisionAnalysis(
        JSON.stringify({
          imageRelevant: true,
          observations: [],
          visibleText: null,
          safetyCategory: "invented_category",
          limitations: "",
        })
      ),
    /invalid schema/
  );
});
