const express = require("express");
const sessionStore = require("../services/sessionStore");
const groqService = require("../services/groqService");
const mechanicService = require("../services/mechanicService");
const safetyService = require("../services/safetyService");
const conversationService = require("../services/conversationService");
const { validateAudioDataUrl } = require("../services/audioValidation");
const { validateImageDataUrl } = require("../services/imageValidation");
const { chooseLanguage, detectLanguage } = require("../services/languageService");
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
  let responseLanguage = detectLanguage(message);

  sessionStore.setBusy(session, true);

  try {
    let immediateDanger = safetyService.assessImmediateDanger(message);
    let messageClassification = null;

    if (!immediateDanger) {
      const policyReason = conversationService.assessPolicyBoundary(message);
      if (policyReason) {
        sessionStore.setLanguage(session, responseLanguage);
        const reply = conversationService.getPolicyReply(policyReason, responseLanguage);
        return res.json({
          sessionId: session.id,
          reply,
          status: "active",
          mechanics: null,
        });
      }
    }

    if (!immediateDanger) {
      messageClassification = await groqService.classifyMessage(message);
      responseLanguage = messageClassification.responseLanguage;
      sessionStore.setLanguage(session, responseLanguage);
      immediateDanger = safetyService.buildDangerResponse(
        messageClassification.safetyCategory,
        responseLanguage
      );
    }

    if (immediateDanger) {
      sessionStore.setLanguage(session, responseLanguage);
      sessionStore.addMessage(session, "user", message);
      sessionStore.addMessage(session, "assistant", immediateDanger.message);
      sessionStore.setPendingMechanicReferral(session, true);
      return res.json(needsLocationResponse(session, immediateDanger.message, immediateDanger));
    }

    if (messageClassification.policyAction !== "allow") {
      const reply = conversationService.getPolicyReply(
        messageClassification.policyReason,
        responseLanguage
      );
      sessionStore.addMessage(session, "user", message);
      sessionStore.addMessage(session, "assistant", reply);
      return res.json({
        sessionId: session.id,
        reply,
        status: "active",
        mechanics: null,
      });
    }

    if (messageClassification.category === "out_of_scope") {
      const responseStyle = "reminder";
      const generatedReply = await groqService.getGeneralInformationReply(
        message,
        responseStyle,
        responseLanguage
      );
      const reply = conversationService.formatOffPurposeReply(
        generatedReply,
        responseStyle,
        responseLanguage
      );
      sessionStore.addMessage(session, "user", message);
      sessionStore.addMessage(session, "assistant", reply);
      return res.json({
        sessionId: session.id,
        reply,
        status: "active",
        mechanics: null,
      });
    }

    if (messageClassification.category === "supported_conversation") {
      const reply = await groqService.getSupportedConversationReply(
        message,
        messageClassification,
        "brief"
      );
      sessionStore.addMessage(session, "user", message);
      sessionStore.addMessage(session, "assistant", reply);
      return res.json({
        sessionId: session.id,
        reply,
        status: "active",
        mechanics: null,
      });
    }

    if (
      [
        "maintenance",
        "vehicle_comparison",
        "buying_advice",
        "specifications",
        "other_automotive",
      ].includes(messageClassification.intent)
    ) {
      const responseStyle = sessionStore.getAdditionalAutomotiveResponseStyle(session);
      const generatedReply = await groqService.getAutomotiveInformationReply(
        message,
        messageClassification,
        responseStyle
      );
      const reply = conversationService.formatOffPurposeReply(
        generatedReply,
        responseStyle,
        responseLanguage
      );
      sessionStore.recordAdditionalAutomotiveResponse(session, responseStyle);
      sessionStore.addMessage(session, "user", message);
      sessionStore.addMessage(session, "assistant", reply);
      return res.json({
        sessionId: session.id,
        reply,
        status: "active",
        mechanics: null,
      });
    }

    if (!session.vehicle) {
      const reply = chooseLanguage(
        responseLanguage,
        "Before I diagnose the problem or suggest checks, what is the vehicle year and make/model?",
        "قبل أن أشخّص المشكلة أو أقترح فحوصات، ما سنة السيارة وما الشركة المصنّعة والطراز؟"
      );
      sessionStore.setPendingDiagnosticMessage(session, message);
      return res.json({
        sessionId: session.id,
        reply,
        status: "needs_vehicle_info",
        mechanics: null,
      });
    }

    const decision = await groqService.getMechanicReply(
      session,
      message,
      responseLanguage
    );
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
    if (error.message === "GROQ_API_KEY is not configured") {
      return res.status(500).json({ error: "Groq API key is missing on the server" });
    }
    if (error.status === 429) {
      return res.status(503).json({ error: "The AI service is busy. Please try again shortly." });
    }
    if (error.status === 401 || error.status === 403) {
      return res.status(502).json({
        error: "Groq rejected the server credentials. Check GROQ_API_KEY in backend/.env.",
      });
    }
    if (error.name === "APIConnectionError" || error.name === "APIConnectionTimeoutError") {
      return res.status(504).json({
        error: "The backend could not reach Groq. Check the internet connection and try again.",
      });
    }
    console.error(error);
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

router.post("/transcribe", async (req, res) => {
  const session = getSessionFromRequest(req, res);
  if (!session) return undefined;
  if (session.busy) return busyResponse(res);
  if (session.pendingMechanicReferral || session.pendingDiagnosticMessage) {
    return res.status(409).json({
      error: "Complete the current location or vehicle-information step before recording",
    });
  }

  const audioResult = validateAudioDataUrl(req.body?.audioDataUrl);
  if (audioResult.error) return res.status(400).json({ error: audioResult.error });

  sessionStore.setBusy(session, true);
  try {
    const transcription = await groqService.transcribeAudio(audioResult.value, session.language);
    const messageResult = validateMessage(transcription.text);
    if (messageResult.error) return res.status(400).json({ error: messageResult.error });
    sessionStore.setLanguage(session, transcription.language);
    return res.json({
      sessionId: session.id,
      transcript: messageResult.value,
      language: transcription.language,
    });
  } catch (error) {
    if (error.message === "GROQ_API_KEY is not configured") {
      return res.status(500).json({ error: "Groq API key is missing on the server" });
    }
    if (error.status === 429) {
      return res.status(503).json({ error: "Voice transcription is busy. Try again shortly." });
    }
    if (error.status === 413) {
      return res.status(413).json({ error: "The voice recording is too large. Please record a shorter message." });
    }
    if (error.status === 400 || error.status === 422) {
      return res.status(422).json({
        error: "The recording was too short, unclear, or in an unsupported browser format. Please record for at least one second and try again.",
      });
    }
    if (error.name === "APIConnectionError" || error.name === "APIConnectionTimeoutError") {
      return res.status(504).json({
        error: "The transcription service could not be reached. Check your connection and try again.",
      });
    }
    if (/did not detect speech/i.test(error.message)) {
      return res.status(422).json({ error: "No clear speech was detected. Please try again." });
    }
    console.error(error);
    return res.status(502).json({ error: "The voice recording could not be transcribed" });
  } finally {
    sessionStore.setBusy(session, false);
  }
});

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

  const responseLanguage = caption ? detectLanguage(caption) : session.language;
  sessionStore.setLanguage(session, responseLanguage);

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

    const analysis = await groqService.analyzeVehiclePhoto(
      imageResult.value.dataUrl,
      caption,
      responseLanguage
    );
    immediateDanger = safetyService.buildDangerResponse(
      analysis.safetyCategory,
      responseLanguage
    );
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
      const reply = chooseLanguage(
        responseLanguage,
        "I could not identify useful vehicle-related evidence in that photo. Upload a clear image of the dashboard, warning light, leak, tire, damage, or relevant component, and include a short description.",
        "لم أتمكن من تحديد دليل مفيد متعلق بالسيارة في هذه الصورة. ارفع صورة واضحة للوحة العدادات أو لمبة التحذير أو التسريب أو الإطار أو التلف أو الجزء المعني، وأضف وصفًا قصيرًا."
      );
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
      const reply = chooseLanguage(
        responseLanguage,
        `Photo received${observations ? `. Visible details: ${observations}` : ""}. Before I diagnose it, what is the vehicle year and make/model?`,
        `تم استلام الصورة${observations ? `. التفاصيل الظاهرة: ${observations}` : ""}. قبل التشخيص، ما سنة السيارة وما الشركة المصنّعة والطراز؟`
      );
      sessionStore.setPendingDiagnosticMessage(session, evidence);
      return res.json({
        sessionId: session.id,
        reply,
        status: "needs_vehicle_info",
        mechanics: null,
        photoAnalysis: analysis,
      });
    }

    const decision = await groqService.getMechanicReply(
      session,
      evidence,
      responseLanguage
    );
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
    const decision = await groqService.getMechanicReply(
      session,
      diagnosticMessage,
      session.language
    );
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
    const reply = mechanicService.buildReferralMessage(mechanics, session.language);
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

  const reply = chooseLanguage(
    session.language,
    "Location was not shared. You can continue asking questions, but do not drive if the issue affects brakes, steering, overheating, fuel, fire, or smoke.",
    "لم تتم مشاركة الموقع. يمكنك متابعة طرح الأسئلة، لكن لا تقُد السيارة إذا كانت المشكلة تؤثر في الفرامل أو التوجيه أو الحرارة أو الوقود أو يوجد حريق أو دخان."
  );
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
