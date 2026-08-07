const test = require("node:test");
const assert = require("node:assert/strict");
const config = require("../config");
const store = require("../services/sessionStore");

test.beforeEach(() => store.resetForTests());

test("keeps bounded recent history and creates a rolling summary", () => {
  const session = store.createSession();
  for (let index = 0; index < config.maxTurns + 1; index += 1) {
    store.addMessage(session, "user", `question ${index}`);
    store.addMessage(session, "assistant", `answer ${index}`);
  }
  assert.equal(session.messages.length, config.maxTurns * 2);
  assert.match(session.summary, /question 0/);
  assert.equal(session.turnCount, config.maxTurns + 1);
});

test("expires inactive sessions", () => {
  const session = store.createSession();
  store.cleanupExpiredSessions(session.lastActiveAt + config.sessionTtlMs + 1);
  assert.equal(store.getSession(session.id), null);
});
