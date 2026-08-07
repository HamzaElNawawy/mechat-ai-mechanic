const config = require("../config");

function validateMessage(value) {
  if (typeof value !== "string" || !value.trim()) {
    return { error: "Message is required" };
  }

  const message = value.trim();
  if (message.length > config.maxMessageChars) {
    return { error: `Message must be ${config.maxMessageChars} characters or fewer` };
  }

  return { value: message };
}

function validateLocation(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { error: "Location is required" };
  }

  const { lat, lng } = value;
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return { error: "Location coordinates are invalid" };
  }

  return { value: { lat, lng } };
}

function validateSessionId(value) {
  if (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value)) {
    return { error: "A valid session ID is required" };
  }
  return { value };
}

function validateVehicle(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { error: "Vehicle year and make/model are required" };
  }

  const year = Number(value.year);
  const maximumYear = new Date().getFullYear() + 1;
  if (!Number.isInteger(year) || year < 1886 || year > maximumYear) {
    return { error: `Vehicle year must be between 1886 and ${maximumYear}` };
  }

  if (typeof value.makeModel !== "string") {
    return { error: "Vehicle make and model are required" };
  }

  const makeModel = value.makeModel.trim().replace(/\s+/g, " ");
  if (makeModel.length < 2 || makeModel.length > 100) {
    return { error: "Vehicle make and model must be between 2 and 100 characters" };
  }

  if (!/^[\p{L}\p{N} .,'&()\-+/]+$/u.test(makeModel)) {
    return { error: "Vehicle make and model contain unsupported characters" };
  }

  return { value: { year, makeModel } };
}

module.exports = { validateMessage, validateLocation, validateSessionId, validateVehicle };
