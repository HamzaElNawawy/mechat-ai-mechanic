const test = require("node:test");
const assert = require("node:assert/strict");
const { validateImageDataUrl } = require("../services/imageValidation");

const PNG_HEADER = "iVBORw0KGgo=";

test("accepts a supported image data URL with a matching signature", () => {
  const result = validateImageDataUrl(`data:image/png;base64,${PNG_HEADER}`);
  assert.equal(result.value.mimeType, "image/png");
  assert.equal(result.value.size, 8);
});

test("rejects unsupported types and mismatched file signatures", () => {
  assert.match(
    validateImageDataUrl(`data:image/gif;base64,${PNG_HEADER}`).error,
    /JPEG, PNG, and WebP/
  );
  assert.match(
    validateImageDataUrl(`data:image/jpeg;base64,${PNG_HEADER}`).error,
    /do not match/
  );
});

test("rejects malformed image data", () => {
  assert.match(validateImageDataUrl("not-a-data-url").error, /invalid/);
});
