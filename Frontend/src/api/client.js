// Ruta relativa: Vite hace de proxy hacia FastAPI (ver vite.config.js).
const BASE = import.meta.env.VITE_API_URL ?? "/api";
const cache = new Map();

async function get(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const key = `${BASE}${path}${qs ? "?" + qs : ""}`;
  if (cache.has(key)) return cache.get(key);
  const res = await fetch(key);
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  cache.set(key, data);
  return data;
}

export const getSites = () => get("/sites");
export const getSite = (id) => get(`/sites/${id}`);
export const getSunDirection = (lat, lon, utc) => get("/sun-direction", { lat, lon, utc });
export const getEphemeris = (target, utc, observer = "EARTH") => get("/ephemeris", { target, observer, utc });
export const getMoonOrientation = (utc) => get("/moon-orientation", { utc });
