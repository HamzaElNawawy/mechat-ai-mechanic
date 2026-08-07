const config = require("../config");

const resultCache = new Map();
const inFlightSearches = new Map();
let lastNominatimRequestAt = 0;
let nominatimQueue = Promise.resolve();

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, options = {}) {
  let lastError;

  for (let attempt = 0; attempt <= config.externalMaxRetries; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(config.externalTimeoutMs),
      });

      if (response.ok || (response.status < 500 && response.status !== 429)) {
        return response;
      }

      if (attempt === config.externalMaxRetries) return response;
      const retryAfter = Number(response.headers.get("retry-after"));
      await response.body?.cancel();
      await delay(Number.isFinite(retryAfter) ? Math.min(retryAfter * 1000, 5000) : 300 * 2 ** attempt);
    } catch (error) {
      lastError = error;
      if (attempt === config.externalMaxRetries) throw error;
      await delay(300 * 2 ** attempt);
    }
  }

  throw lastError || new Error("External request failed");
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function distanceInKm(lat1, lon1, lat2, lon2) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return earthRadiusKm * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function buildMechanicMapsUrl(lat, lon) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lon}`)}`;
}

function buildNearbySearchUrl(lat, lon) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `car repair near ${lat},${lon}`
  )}`;
}

function buildViewbox(lat, lng, radiusKm) {
  const latDelta = radiusKm / 111;
  const safeCosine = Math.max(Math.abs(Math.cos(toRadians(lat))), 0.01);
  const lonDelta = radiusKm / (111 * safeCosine);
  return `${lng - lonDelta},${lat + latDelta},${lng + lonDelta},${lat - latDelta}`;
}

function osmUserAgent() {
  return config.osmContactEmail
    ? `MeChat/1.0 (contact: ${config.osmContactEmail})`
    : "MeChat/1.0 (local development)";
}

function normalizeMechanic({ name, address, phone, lat, lng, originLat, originLng }) {
  return {
    resultType: "mechanic",
    name: name || "Auto Repair Shop",
    address: address || "Address unavailable",
    phone: phone || null,
    lat,
    lng,
    distanceKm: Number(distanceInKm(originLat, originLng, lat, lng).toFixed(1)),
    mapsUrl: buildMechanicMapsUrl(lat, lng),
    dataSource: "OpenStreetMap contributors",
  };
}

async function searchWithOverpass(lat, lng) {
  const query = `
    [out:json][timeout:25];
    (
      node["shop"="car_repair"](around:${config.mechanicSearchRadiusMeters},${lat},${lng});
      way["shop"="car_repair"](around:${config.mechanicSearchRadiusMeters},${lat},${lng});
    );
    out center;
  `;
  const response = await fetchWithRetry("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": osmUserAgent(),
    },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!response.ok) throw new Error(`Overpass request failed with status ${response.status}`);
  const data = await response.json();

  return (Array.isArray(data.elements) ? data.elements : [])
    .map((element) => {
      const pointLat = element.lat ?? element.center?.lat;
      const pointLon = element.lon ?? element.center?.lon;
      if (!Number.isFinite(pointLat) || !Number.isFinite(pointLon)) return null;

      const tags = element.tags || {};
      const street = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ");
      const city = tags["addr:city"] || tags["addr:town"] || tags["addr:village"];
      return normalizeMechanic({
        name: tags.name,
        address: [street, city].filter(Boolean).join(", "),
        phone: tags.phone || tags["contact:phone"],
        lat: pointLat,
        lng: pointLon,
        originLat: lat,
        originLng: lng,
      });
    })
    .filter(Boolean);
}

function scheduleNominatim(task) {
  const run = nominatimQueue.then(async () => {
    const waitMs = Math.max(0, 1000 - (Date.now() - lastNominatimRequestAt));
    if (waitMs) await delay(waitMs);
    lastNominatimRequestAt = Date.now();
    return task();
  });
  nominatimQueue = run.catch(() => {});
  return run;
}

async function searchWithNominatim(lat, lng) {
  if (!config.osmContactEmail) {
    throw new Error("OSM_CONTACT_EMAIL is required before using public Nominatim");
  }

  return scheduleNominatim(async () => {
    const radiusKm = config.mechanicSearchRadiusMeters / 1000;
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", "car repair");
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", String(config.mechanicResultsLimit * 3));
    url.searchParams.set("viewbox", buildViewbox(lat, lng, radiusKm));
    url.searchParams.set("bounded", "1");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("email", config.osmContactEmail);

    const response = await fetchWithRetry(url, {
      headers: { "User-Agent": osmUserAgent(), Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`Nominatim request failed with status ${response.status}`);

    const results = await response.json();
    return results
      .filter((place) => place.class === "shop" || place.type === "car_repair")
      .map((place) => {
        const pointLat = Number(place.lat);
        const pointLon = Number(place.lon);
        if (!Number.isFinite(pointLat) || !Number.isFinite(pointLon)) return null;
        return normalizeMechanic({
          name: place.name || place.display_name?.split(",")[0],
          address: place.display_name,
          phone: null,
          lat: pointLat,
          lng: pointLon,
          originLat: lat,
          originLng: lng,
        });
      })
      .filter(Boolean);
  });
}

function buildFallbackSearch(lat, lng) {
  return [
    {
      resultType: "map_search",
      name: "Search maps for nearby repair shops",
      address: "No verified OpenStreetMap listings were available. Review businesses in Maps.",
      phone: null,
      lat,
      lng,
      distanceKm: null,
      mapsUrl: buildNearbySearchUrl(lat, lng),
      dataSource: "Google Maps search",
    },
  ];
}

async function performSearch(lat, lng) {
  let mechanics = [];
  try {
    mechanics = await searchWithOverpass(lat, lng);
  } catch (error) {
    console.warn("Overpass lookup failed; trying Nominatim:", error.message);
  }

  if (mechanics.length === 0) {
    try {
      mechanics = await searchWithNominatim(lat, lng);
    } catch (error) {
      console.warn("Nominatim lookup unavailable:", error.message);
    }
  }

  const unique = [...new Map(mechanics.map((item) => [`${item.lat}:${item.lng}:${item.name}`, item])).values()]
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, config.mechanicResultsLimit);
  return unique.length ? unique : buildFallbackSearch(lat, lng);
}

async function findNearestMechanics(lat, lng) {
  const key = `${lat.toFixed(3)}:${lng.toFixed(3)}:${config.mechanicSearchRadiusMeters}`;
  const cached = resultCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (inFlightSearches.has(key)) return inFlightSearches.get(key);

  const search = performSearch(lat, lng).then((value) => {
    resultCache.set(key, { value, expiresAt: Date.now() + config.mechanicCacheTtlMs });
    return value;
  });
  inFlightSearches.set(key, search);

  try {
    return await search;
  } finally {
    inFlightSearches.delete(key);
  }
}

function buildReferralMessage(mechanics) {
  if (mechanics.every((item) => item.resultType === "map_search")) {
    return "I could not verify nearby repair-shop listings right now. Use the map search below to review available businesses. Check ratings, services, and availability before visiting.";
  }

  return "These are nearby repair-shop listings from OpenStreetMap. Confirm services and availability before visiting. If the issue affects braking, steering, overheating, fuel, fire, or smoke, do not drive; call roadside assistance.";
}

module.exports = {
  findNearestMechanics,
  buildReferralMessage,
  buildFallbackSearch,
};
