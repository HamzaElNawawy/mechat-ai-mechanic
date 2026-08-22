const test = require("node:test");
const assert = require("node:assert/strict");
const { validateAudioDataUrl } = require("../services/audioValidation");

const WEBM_HEADER = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]).toString("base64");

test("validates supported voice recording data and rejects mismatched content", () => {
  const valid = validateAudioDataUrl(`data:audio/webm;base64,${WEBM_HEADER}`);
  assert.equal(valid.value.mimeType, "audio/webm");
  assert.equal(valid.value.extension, "webm");

  const invalid = validateAudioDataUrl(`data:audio/ogg;base64,${WEBM_HEADER}`);
  assert.match(invalid.error, /do not match/);
});
