const API_BASE = import.meta.env.VITE_API_URL || "";

async function request(path, { timeoutMs = 20000, ...options } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: options.body ? { "Content-Type": "application/json", ...options.headers } : options.headers,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || "Request failed");
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

export function startSession() {
  return request("/api/chat/new", { method: "POST" });
}

export function sendMessage({ sessionId, message }) {
  return request("/api/chat", {
    method: "POST",
    body: JSON.stringify({ sessionId, message }),
  });
}

export function sendPhotoMessage({ sessionId, message, imageDataUrl }) {
  return request("/api/chat/photo", {
    method: "POST",
    timeoutMs: 45000,
    body: JSON.stringify({ sessionId, message, imageDataUrl }),
  });
}

export function submitVehicleInfo({ sessionId, year, makeModel }) {
  return request("/api/chat/vehicle", {
    method: "POST",
    body: JSON.stringify({
      sessionId,
      vehicle: { year: Number(year), makeModel },
    }),
  });
}

export function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported by this browser"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      reject,
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  });
}

export function referToMechanic({ sessionId, location }) {
  return request("/api/chat/refer", {
    method: "POST",
    body: JSON.stringify({ sessionId, location }),
  });
}

export function continueWithoutLocation(sessionId) {
  return request("/api/chat/continue", {
    method: "POST",
    body: JSON.stringify({ sessionId }),
  });
}
