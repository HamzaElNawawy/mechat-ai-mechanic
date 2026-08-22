const config = require("../config");

const AUDIO_TYPES = {
  "audio/webm": { extension: "webm", signature: (buffer) => buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) },
  "audio/ogg": { extension: "ogg", signature: (buffer) => buffer.subarray(0, 4).toString("ascii") === "OggS" },
  "audio/wav": {
    extension: "wav",
    signature: (buffer) =>
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WAVE",
  },
  "audio/mp4": { extension: "m4a", signature: (buffer) => buffer.subarray(4, 8).toString("ascii") === "ftyp" },
  "audio/mpeg": {
    extension: "mp3",
    signature: (buffer) =>
      buffer.subarray(0, 3).toString("ascii") === "ID3" ||
      (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0),
  },
};

function validateAudioDataUrl(value) {
  if (typeof value !== "string") {
    return { error: "A supported voice recording is required" };
  }

  const match = /^data:(audio\/[a-z0-9.+-]+)(?:;[^,]*)?;base64,([A-Za-z0-9+/]+={0,2})$/i.exec(
    value
  );
  if (!match) return { error: "Voice recording data is invalid" };

  const mimeType = match[1].toLowerCase();
  const type = AUDIO_TYPES[mimeType];
  if (!type) return { error: "Only WebM, OGG, WAV, M4A, or MP3 recordings are supported" };

  const base64 = match[2];
  if (base64.length % 4 !== 0) return { error: "Voice recording data is invalid" };

  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length || buffer.length > config.maxAudioBytes) {
    return {
      error: `Voice recording must be no larger than ${Math.floor(config.maxAudioBytes / 1048576)} MB`,
    };
  }
  if (!type.signature(buffer)) {
    return { error: "Voice recording contents do not match its declared file type" };
  }

  return { value: { buffer, mimeType, extension: type.extension, size: buffer.length } };
}

module.exports = { validateAudioDataUrl };
