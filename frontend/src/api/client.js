// Ruta relativa: Vite hace de proxy hacia FastAPI (ver vite.config.js).
const BASE = import.meta.env.VITE_API_URL ?? "/api";
const cache = new Map();

async function get(path, params = {}, timeoutMs = 4000) {
  const qs = new URLSearchParams(params).toString();
  const key = `${BASE}${path}${qs ? "?" + qs : ""}`;
  if (cache.has(key)) return cache.get(key);
  const ctrl = new AbortController();
  const limite = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(key, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("json")) throw new Error("respuesta no JSON (¿backend apagado?)");
    const data = await res.json();
    cache.set(key, data);
    return data;
  } finally {
    clearTimeout(limite);
  }
}

export const getSites = () => get("/sites");
export const getSite = (id) => get(`/sites/${id}`);
export const getSunDirection = (lat, lon, utc) => get("/sun-direction", { lat, lon, utc });
export const getEphemeris = (target, utc, observer = "EARTH") => get("/ephemeris", { target, observer, utc });
export const getMoonOrientation = (utc) => get("/moon-orientation", { utc });
// --- Misión Apollo 11 (routers/mission.py) ---
export const getMission = () => get("/mission/apollo11");
export const getMissionTrack = (step_s = 1800) => get("/mission/apollo11/track", { step_s }, 8000);
export const getSky = (utc) => get("/mission/apollo11/sky", { utc });
export const getMarsTrack = (id) => get(`/mission/marte/${id}/track`, {}, 8000);
