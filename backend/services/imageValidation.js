const config = require("../config");

const SUPPORTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function matchesSignature(buffer, mimeType) {
  if (mimeType === "image/jpeg") {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === "image/png") {
    return (
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    );
  }
  if (mimeType === "image/webp") {
    return (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP"
    );
  }
  return false;
}

function validateImageDataUrl(value) {
  if (typeof value !== "string") {
    return { error: "A JPEG, PNG, or WebP photo is required" };
  }

  const match = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(value);
  if (!match) return { error: "Photo data is invalid" };

  const mimeType = match[1].toLowerCase();
  if (!SUPPORTED_TYPES.has(mimeType)) {
    return { error: "Only JPEG, PNG, and WebP photos are supported" };
  }

  const base64 = match[2];
  if (base64.length % 4 !== 0) return { error: "Photo data is invalid" };

  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length || buffer.length > config.maxImageBytes) {
    return { error: `Photo must be no larger than ${Math.floor(config.maxImageBytes / 1048576)} MB` };
  }
  if (!matchesSignature(buffer, mimeType)) {
    return { error: "Photo contents do not match its declared file type" };
  }

  return {
    value: {
      dataUrl: `data:${mimeType};base64,${base64}`,
      mimeType,
      size: buffer.length,
    },
  };
}

module.exports = { validateImageDataUrl };
