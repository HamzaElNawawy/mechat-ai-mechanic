const test = require("node:test");
const assert = require("node:assert/strict");
const app = require("../app");
const store = require("../services/sessionStore");
const groqService = require("../services/groqService");

let server;
let baseUrl;

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test.beforeEach(() => store.resetForTests());

async function post(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
}

test("creates a session and runs emergency triage without Groq", async () => {
  const fresh = await post("/api/chat/new", {});
  assert.equal(fresh.status, 201);

  const emergency = await post("/api/chat", {
    sessionId: fresh.data.sessionId,
    message: "My brakes failed and I cannot stop",
  });
  assert.equal(emergency.status, 200);
  assert.equal(emergency.data.status, "needs_location");
  assert.equal(emergency.data.severity, "critical");

  const continued = await post("/api/chat/continue", { sessionId: fresh.data.sessionId });
  assert.equal(continued.status, 200);
  assert.equal(continued.data.status, "active");
});

test("rejects invalid sessions and coordinates", async () => {
  const invalidSession = await post("/api/chat", { sessionId: "bad", message: "hello" });
  assert.equal(invalidSession.status, 400);

  const fresh = await post("/api/chat/new", {});
  await post("/api/chat", {
    sessionId: fresh.data.sessionId,
    message: "There is a fuel smell and fuel is leaking",
  });
  const invalidLocation = await post("/api/chat/refer", {
    sessionId: fresh.data.sessionId,
    location: { lat: "30", lng: 31 },
  });
  assert.equal(invalidLocation.status, 400);
});

test("asks for vehicle details before diagnosing a non-emergency symptom", async () => {
  const originalClassifier = groqService.classifyImmediateDanger;
  groqService.classifyImmediateDanger = async () => null;

  try {
  const fresh = await post("/api/chat/new", {});
  const symptom = await post("/api/chat", {
    sessionId: fresh.data.sessionId,
    message: "The car vibrates at highway speed",
  });

  assert.equal(symptom.status, 200);
  assert.equal(symptom.data.status, "needs_vehicle_info");
  assert.match(symptom.data.reply, /year and make\/model/i);

  const invalidVehicle = await post("/api/chat/vehicle", {
    sessionId: fresh.data.sessionId,
    vehicle: { year: 1700, makeModel: "Toyota Corolla" },
  });
  assert.equal(invalidVehicle.status, 400);
  } finally {
    groqService.classifyImmediateDanger = originalClassifier;
  }
});

test("rejects invalid photo content before calling the vision model", async () => {
  const fresh = await post("/api/chat/new", {});
  const photo = await post("/api/chat/photo", {
    sessionId: fresh.data.sessionId,
    message: "What is shown here?",
    imageDataUrl: "data:image/jpeg;base64,aGVsbG8=",
  });
  assert.equal(photo.status, 400);
  assert.match(photo.data.error, /file type/);
});
