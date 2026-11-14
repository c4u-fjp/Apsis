// Posición aproximada del Sol (algoritmo de baja precisión del Astronomical Almanac, ~0,01°)
// y conversión de direcciones ecuatoriales a coordenadas locales Este-Arriba-Sur (convención Three.js).
import { gmstMs } from './tiempo.js';

const DEG = Math.PI / 180;
export const OBLICUIDAD = 23.4393 * DEG;

// Vector unitario al Sol, ecuatorial J2000 (x al punto vernal, z al polo norte)
export function solEcuatorial(ms) {
    const n = ms / 86400000 + 2440587.5 - 2451545.0;
    const L = (280.460 + 0.9856474 * n) * DEG, g = (357.528 + 0.9856003 * n) * DEG;
    const lam = L + (1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * DEG;
    return [Math.cos(lam), Math.cos(OBLICUIDAD) * Math.sin(lam), Math.sin(OBLICUIDAD) * Math.sin(lam)];
}

export function eclipticaAEcuatorial(v) {
    const c = Math.cos(OBLICUIDAD), s = Math.sin(OBLICUIDAD);
    return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c];
}

// Dirección ecuatorial -> [este, arriba, -norte] en un lugar de la Tierra a una hora dada
export function ecuatorialALocal(v, ms, latDeg, lonDeg) {
    const la = latDeg * DEG, lo = lonDeg * DEG, g = gmstMs(ms);
    const rot = (u) => [u[0] * Math.cos(g) - u[1] * Math.sin(g), u[0] * Math.sin(g) + u[1] * Math.cos(g), u[2]];
    const up = rot([Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)]);
    const este = rot([-Math.sin(lo), Math.cos(lo), 0]);
    const norte = rot([-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)]);
    const d = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    return [d(v, este), d(v, up), -d(v, norte)];
}
