function numberFromEnv(name, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

module.exports = {
  port: numberFromEnv("PORT", 5000, { max: 65535 }),
  groqTriageModel:
    process.env.GROQ_TRIAGE_MODEL || process.env.GROQ_MODEL || "openai/gpt-oss-20b",
  groqDiagnosisModel:
    process.env.GROQ_DIAGNOSIS_MODEL || process.env.GROQ_MODEL || "openai/gpt-oss-120b",
  groqVisionModel: process.env.GROQ_VISION_MODEL || "qwen/qwen3.6-27b",
  groqMaxTokens: numberFromEnv("GROQ_MAX_TOKENS", 700, { max: 4000 }),
  maxImageBytes: numberFromEnv("MAX_IMAGE_BYTES", 4194304, { max: 10485760 }),
  maxTurns: numberFromEnv("MAX_TURNS", 5, { max: 20 }),
  maxSessionTurns: numberFromEnv("MAX_SESSION_TURNS", 20, { max: 100 }),
  maxMessageChars: numberFromEnv("MAX_MESSAGE_CHARS", 2000, { max: 10000 }),
  sessionTtlMs: numberFromEnv("SESSION_TTL_MS", 3600000),
  maxSessions: numberFromEnv("MAX_SESSIONS", 1000, { max: 100000 }),
  mechanicSearchRadiusMeters: numberFromEnv("MECHANIC_RADIUS_M", 15000, {
    max: 50000,
  }),
  mechanicResultsLimit: numberFromEnv("MECHANIC_LIMIT", 3, { max: 10 }),
  externalTimeoutMs: numberFromEnv("EXTERNAL_TIMEOUT_MS", 10000, { max: 30000 }),
  externalMaxRetries: numberFromEnv("EXTERNAL_MAX_RETRIES", 2, { min: 0, max: 5 }),
  mechanicCacheTtlMs: numberFromEnv("MECHANIC_CACHE_TTL_MS", 300000),
  rateLimitWindowMs: numberFromEnv("RATE_LIMIT_WINDOW_MS", 60000),
  rateLimitMaxRequests: numberFromEnv("RATE_LIMIT_MAX_REQUESTS", 30, { max: 1000 }),
  allowedOrigins: (process.env.ALLOWED_ORIGINS || "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  osmContactEmail: process.env.OSM_CONTACT_EMAIL || "",
};
