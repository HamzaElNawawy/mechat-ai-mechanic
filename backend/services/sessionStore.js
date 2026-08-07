const { randomUUID } = require("crypto");
const config = require("../config");

const sessions = new Map();

function cleanupExpiredSessions(now = Date.now()) {
  for (const [id, session] of sessions) {
    if (now - session.lastActiveAt >= config.sessionTtlMs) {
      sessions.delete(id);
    }
  }
}

function enforceSessionCapacity() {
  while (sessions.size >= config.maxSessions) {
    const oldestId = sessions.keys().next().value;
    if (!oldestId) break;
    sessions.delete(oldestId);
  }
}

function createSession() {
  cleanupExpiredSessions();
  enforceSessionCapacity();
  const now = Date.now();
  const session = {
    id: randomUUID(),
    messages: [],
    referred: false,
    pendingMechanicReferral: false,
    busy: false,
    turnCount: 0,
    summary: "",
    vehicle: null,
    pendingDiagnosticMessage: null,
    createdAt: now,
    lastActiveAt: now,
  };

  sessions.set(session.id, session);
  return session;
}

function getSession(sessionId) {
  cleanupExpiredSessions();
  if (!sessionId) {
    return null;
  }

  const session = sessions.get(sessionId) || null;
  if (session) session.lastActiveAt = Date.now();
  return session;
}

function addMessage(session, role, content) {
  session.messages.push({ role, content });
  session.lastActiveAt = Date.now();
  if (role === "user") session.turnCount += 1;

  const maxMessages = config.maxTurns * 2;
  while (session.messages.length > maxMessages) {
    const removed = session.messages.shift();
    const label = removed.role === "user" ? "User" : "Assistant";
    const compact = removed.content.replace(/\s+/g, " ").slice(0, 300);
    session.summary = `${session.summary}\n${label}: ${compact}`.trim().slice(-2000);
  }
}

function getContextMessages(session) {
  return [
    ...(session.summary
      ? [{ role: "system", content: `Earlier conversation summary:\n${session.summary}` }]
      : []),
    ...session.messages,
  ];
}

function hasReachedTurnLimit(session) {
  return session.turnCount >= config.maxSessionTurns;
}

function markReferred(session) {
  session.referred = true;
  session.pendingMechanicReferral = false;
}

function setPendingMechanicReferral(session, value) {
  session.pendingMechanicReferral = value;
  session.lastActiveAt = Date.now();
}

function setBusy(session, value) {
  session.busy = value;
  session.lastActiveAt = Date.now();
}

function setVehicle(session, vehicle) {
  session.vehicle = { ...vehicle };
  session.lastActiveAt = Date.now();
}

function setPendingDiagnosticMessage(session, message) {
  session.pendingDiagnosticMessage = message || null;
  session.lastActiveAt = Date.now();
}

function resetForTests() {
  sessions.clear();
}

module.exports = {
  createSession,
  getSession,
  addMessage,
  getContextMessages,
  hasReachedTurnLimit,
  markReferred,
  setPendingMechanicReferral,
  setBusy,
  setVehicle,
  setPendingDiagnosticMessage,
  cleanupExpiredSessions,
  resetForTests,
};
