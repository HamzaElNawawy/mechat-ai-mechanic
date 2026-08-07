const express = require("express");
const sessionStore = require("../services/sessionStore");
const groqService = require("../services/groqService");
const mechanicService = require("../services/mechanicService");
const safetyService = require("../services/safetyService");
const { validateImageDataUrl } = require("../services/imageValidation");
const {
  validateLocation,
  validateMessage,
  validateSessionId,
  validateVehicle,
} = require("../services/requestValidation");

const router = express.Router();

function getSessionFromRequest(req, res) {
  const idResult = validateSessionId(req.body?.sessionId);
  if (idResult.error) {
    res.status(400).json({ error: idResult.error });
    return null;
  }

  const session = sessionStore.getSession(idResult.value);
  if (!session) {
    res.status(404).json({ error: "Session was not found or has expired" });
    return null;
  }
  return session;
}

function busyResponse(res) {
  return res.status(409).json({ error: "Another request is already running for this session" });
}

function needsLocationResponse(session, reply, decision = {}) {
  return {
    sessionId: session.id,
    reply,
    status: "needs_location",
    mechanics: null,
    severity: decision.severity || "high",
    action: decision.action || "professional_inspection",
  };
}

router.post("/", async (req, res) => {
  const messageResult = validateMessage(req.body?.message);
  if (messageResult.error) return res.status(400).json({ error: messageResult.error });

  const session = getSessionFromRequest(req, res);
  if (!session) return undefined;
  if (session.busy) return busyResponse(res);
  if (session.pendingMechanicReferral) {
    return res.status(409).json({
      error: "Choose whether to share your location before continuing",
      status: "needs_location",
    });
  }
  if (session.pendingDiagnosticMessage && !session.vehicle) {
    return res.status(409).json({
      error: "Add the vehicle year and make/model before continuing",
      status: "needs_vehicle_info",
    });
  }
  if (sessionStore.hasReachedTurnLimit(session)) {
    return res.status(409).json({
      error: "This chat reached its turn limit. Start a new chat to continue.",
      status: "limit",
    });
  }

  const message = messageResult.value;
  sessionStore.setBusy(session, true);

  try {
    let immediateDanger = safetyService.assessImmediateDanger(message);

    if (!immediateDanger && !session.vehicle) {
      const semanticCategory = await groqService.classifyImmediateDanger(message);
      immediateDanger = safetyService.buildDangerResponse(semanticCategory);
    }

    if (immediateDanger) {
      sessionStore.addMessage(session, "user", message);
      sessionStore.addMessage(session, "assistant", immediateDanger.message);
      sessionStore.setPendingMechanicReferral(session, true);
      return res.json(needsLocationResponse(session, immediateDanger.message, immediateDanger));
    }

    if (!session.vehicle) {
      const reply =
        "Before I diagnose the problem or suggest checks, what is the vehicle year and make/model?";
      sessionStore.setPendingDiagnosticMessage(session, message);
      return res.json({
        sessionId: session.id,
        reply,
        status: "needs_vehicle_info",
        mechanics: null,
      });
    }

    const decision = await groqService.getMechanicReply(session, message);
    sessionStore.addMessage(session, "user", message);
    sessionStore.addMessage(session, "assistant", decision.reply);

    if (decision.needsMechanic) {
      sessionStore.setPendingMechanicReferral(session, true);
      return res.json(needsLocationResponse(session, decision.reply, decision));
    }

    return res.json({
      sessionId: session.id,
      reply: decision.reply,
      status: "active",
      mechanics: null,
      severity: decision.severity,
      action: decision.action,
    });
  } catch (error) {
    console.error(error);
    if (error.message === "GROQ_API_KEY is not configured") {
      return res.status(500).json({ error: "Groq API key is missing on the server" });
    }
    if (error.status === 429) {
      return res.status(503).json({ error: "The AI service is busy. Please try again shortly." });
    }
    return res.status(502).json({ error: "The mechanic assistant is temporarily unavailable" });
  } finally {
    sessionStore.setBusy(session, false);
  }
});

function formatVisionEvidence(caption, analysis) {
  return [
    caption ? `User description: ${caption}` : "User uploaded a vehicle photo without a caption.",
    `Visible photo observations: ${analysis.observations.join("; ") || "No clear details identified"}`,
    analysis.visibleText ? `Visible text: ${analysis.visibleText}` : null,
    analysis.limitations ? `Image limitations: ${analysis.limitations}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

router.post("/photo", async (req, res) => {
  const session = getSessionFromRequest(req, res);
  if (!session) return undefined;
  if (session.busy) return busyResponse(res);
  if (session.pendingMechanicReferral) {
    return res.status(409).json({
      error: "Choose whether to share your location before uploading another photo",
      status: "needs_location",
    });
  }
  if (session.pendingDiagnosticMessage && !session.vehicle) {
    return res.status(409).json({
      error: "Add the vehicle year and make/model before uploading another photo",
      status: "needs_vehicle_info",
    });
  }
  if (sessionStore.hasReachedTurnLimit(session)) {
    return res.status(409).json({
      error: "This chat reached its turn limit. Start a new chat to continue.",
      status: "limit",
    });
  }

  const imageResult = validateImageDataUrl(req.body?.imageDataUrl);
  if (imageResult.error) return res.status(400).json({ error: imageResult.error });

  let caption = "";
  if (req.body?.message != null && String(req.body.message).trim()) {
    const messageResult = validateMessage(req.body.message);
    if (messageResult.error) return res.status(400).json({ error: messageResult.error });
    caption = messageResult.value;
  }

  sessionStore.setBusy(session, true);
  try {
    let immediateDanger = caption ? safetyService.assessImmediateDanger(caption) : null;
    if (immediateDanger) {
      const userEntry = caption || "Uploaded a vehicle photo.";
      sessionStore.addMessage(session, "user", userEntry);
      sessionStore.addMessage(session, "assistant", immediateDanger.message);
      sessionStore.setPendingMechanicReferral(session, true);
      return res.json(needsLocationResponse(session, immediateDanger.message, immediateDanger));
    }

    const analysis = await groqService.analyzeVehiclePhoto(imageResult.value.dataUrl, caption);
    immediateDanger = safetyService.buildDangerResponse(analysis.safetyCategory);
    if (immediateDanger) {
      const userEntry = formatVisionEvidence(caption, analysis);
      sessionStore.addMessage(session, "user", userEntry);
      sessionStore.addMessage(session, "assistant", immediateDanger.message);
      sessionStore.setPendingMechanicReferral(session, true);
      return res.json({
        ...needsLocationResponse(session, immediateDanger.message, immediateDanger),
        photoAnalysis: analysis,
      });
    }

    if (!analysis.imageRelevant) {
      const reply =
        "I could not identify useful vehicle-related evidence in that photo. Upload a clear image of the dashboard, warning light, leak, tire, damage, or relevant component, and include a short description.";
      sessionStore.addMessage(session, "user", caption || "Uploaded a photo.");
      sessionStore.addMessage(session, "assistant", reply);
      return res.json({
        sessionId: session.id,
        reply,
        status: "active",
        mechanics: null,
        photoAnalysis: analysis,
      });
    }

    const evidence = formatVisionEvidence(caption, analysis);
    if (!session.vehicle) {
      const observations = analysis.observations.join("; ");
      const reply = `Photo received${observations ? `. Visible details: ${observations}` : ""}. Before I diagnose it, what is the vehicle year and make/model?`;
      sessionStore.setPendingDiagnosticMessage(session, evidence);
      return res.json({
        sessionId: session.id,
        reply,
        status: "needs_vehicle_info",
        mechanics: null,
        photoAnalysis: analysis,
      });
    }

    const decision = await groqService.getMechanicReply(session, evidence);
    sessionStore.addMessage(session, "user", evidence);
    sessionStore.addMessage(session, "assistant", decision.reply);

    if (decision.needsMechanic) {
      sessionStore.setPendingMechanicReferral(session, true);
      return res.json({
        ...needsLocationResponse(session, decision.reply, decision),
        photoAnalysis: analysis,
      });
    }

    return res.json({
      sessionId: session.id,
      reply: decision.reply,
      status: "active",
      mechanics: null,
      severity: decision.severity,
      action: decision.action,
      photoAnalysis: analysis,
    });
  } catch (error) {
    console.error(error);
    if (error.message === "GROQ_API_KEY is not configured") {
      return res.status(500).json({ error: "Groq API key is missing on the server" });
    }
    if (error.status === 429) {
      return res.status(503).json({ error: "The image-analysis service is busy. Try again shortly." });
    }
    return res.status(502).json({ error: "The vehicle photo could not be analyzed right now" });
  } finally {
    sessionStore.setBusy(session, false);
  }
});

router.post("/vehicle", async (req, res) => {
  const session = getSessionFromRequest(req, res);
  if (!session) return undefined;
  if (session.busy) return busyResponse(res);
  if (!session.pendingDiagnosticMessage) {
    return res.status(409).json({ error: "No diagnostic message is waiting for vehicle details" });
  }

  const vehicleResult = validateVehicle(req.body?.vehicle);
  if (vehicleResult.error) return res.status(400).json({ error: vehicleResult.error });

  const diagnosticMessage = session.pendingDiagnosticMessage;
  sessionStore.setVehicle(session, vehicleResult.value);
  sessionStore.setBusy(session, true);

  try {
    const decision = await groqService.getMechanicReply(session, diagnosticMessage);
    sessionStore.addMessage(session, "user", diagnosticMessage);
    sessionStore.addMessage(session, "assistant", decision.reply);
    sessionStore.setPendingDiagnosticMessage(session, null);

    if (decision.needsMechanic) {
      sessionStore.setPendingMechanicReferral(session, true);
      return res.json(needsLocationResponse(session, decision.reply, decision));
    }

    return res.json({
      sessionId: session.id,
      reply: decision.reply,
      status: "active",
      mechanics: null,
      vehicle: session.vehicle,
      severity: decision.severity,
      action: decision.action,
    });
  } catch (error) {
    console.error(error);
    if (error.message === "GROQ_API_KEY is not configured") {
      return res.status(500).json({ error: "Groq API key is missing on the server" });
    }
    if (error.status === 429) {
      return res.status(503).json({ error: "The AI service is busy. Please try again shortly." });
    }
    return res.status(502).json({ error: "The mechanic assistant is temporarily unavailable" });
  } finally {
    sessionStore.setBusy(session, false);
  }
});

router.post("/refer", async (req, res) => {
  const session = getSessionFromRequest(req, res);
  if (!session) return undefined;
  if (!session.pendingMechanicReferral) {
    return res.status(409).json({ error: "No mechanic referral is waiting for location" });
  }
  if (session.busy) return busyResponse(res);

  const locationResult = validateLocation(req.body?.location);
  if (locationResult.error) return res.status(400).json({ error: locationResult.error });

  sessionStore.setBusy(session, true);
  try {
    const mechanics = await mechanicService.findNearestMechanics(
      locationResult.value.lat,
      locationResult.value.lng
    );
    const reply = mechanicService.buildReferralMessage(mechanics);
    sessionStore.addMessage(session, "assistant", reply);
    sessionStore.markReferred(session);

    return res.json({
      sessionId: session.id,
      reply,
      status: "referral",
      mechanics,
    });
  } catch (error) {
    console.error(error);
    return res.status(502).json({ error: "Nearby mechanic search is temporarily unavailable" });
  } finally {
    sessionStore.setBusy(session, false);
  }
});

router.post("/continue", (req, res) => {
  const session = getSessionFromRequest(req, res);
  if (!session) return undefined;
  if (!session.pendingMechanicReferral) {
    return res.status(409).json({ error: "No location request is pending" });
  }

  const reply =
    "Location was not shared. You can continue asking questions, but do not drive if the issue affects brakes, steering, overheating, fuel, fire, or smoke.";
  sessionStore.setPendingMechanicReferral(session, false);
  sessionStore.addMessage(session, "assistant", reply);
  return res.json({ sessionId: session.id, reply, status: "active", mechanics: null });
});

router.post("/new", (_req, res) => {
  const session = sessionStore.createSession();
  res.status(201).json({
    sessionId: session.id,
    greeting:
      "Hi, I am your AI mechanic assistant. First, describe what the vehicle is doing, including warning lights, smells, smoke, noises, or loss of control. I will check for immediate danger before asking for vehicle details or suggesting anything.",
  });
});

module.exports = router;
