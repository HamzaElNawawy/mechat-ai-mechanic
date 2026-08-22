const express = require("express");
const cors = require("cors");
const config = require("./config");
const chatRoutes = require("./routes/chat");

const app = express();
const requestBuckets = new Map();

app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || config.allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Origin is not allowed"));
    },
  })
);
app.use(
  "/api/chat/photo",
  express.json({ limit: Math.ceil((config.maxImageBytes * 4) / 3) + 200000 })
);
app.use(
  "/api/chat/transcribe",
  express.json({ limit: Math.ceil((config.maxAudioBytes * 4) / 3) + 200000 })
);
app.use(express.json({ limit: "16kb" }));

app.use("/api", (req, res, next) => {
  const now = Date.now();
  if (requestBuckets.size > config.maxSessions) {
    for (const [bucketKey, bucket] of requestBuckets) {
      if (bucket.resetAt <= now) requestBuckets.delete(bucketKey);
    }
  }
  const key = req.ip || req.socket.remoteAddress || "unknown";
  const current = requestBuckets.get(key);

  if (!current || current.resetAt <= now) {
    requestBuckets.set(key, { count: 1, resetAt: now + config.rateLimitWindowMs });
    return next();
  }

  current.count += 1;
  if (current.count > config.rateLimitMaxRequests) {
    res.setHeader("Retry-After", Math.ceil((current.resetAt - now) / 1000));
    return res.status(429).json({ error: "Too many requests. Please try again shortly." });
  }

  return next();
});

app.get("/", (_req, res) => {
  res.json({ status: "ok", message: "Mechanic chatbot API is running" });
});

app.use("/api/chat", chatRoutes);

app.use((error, _req, res, _next) => {
  if (error?.type === "entity.too.large") {
    return res.status(413).json({ error: "Request body is too large" });
  }
  if (error?.message === "Origin is not allowed") {
    return res.status(403).json({ error: error.message });
  }
  console.error(error);
  return res.status(500).json({ error: "Internal server error" });
});

module.exports = app;
