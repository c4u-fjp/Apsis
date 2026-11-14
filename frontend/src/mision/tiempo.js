// Utilidades de tiempo de misión. GET = Ground Elapsed Time (segundos desde el despegue).
export const LANZAMIENTO_MS = Date.UTC(1969, 6, 16, 13, 32, 0);

export function getASegundos(get) {
    const neg = get.trim().startsWith('-');
    const [h, m, s] = get.replace('-', '').split(':');
    const v = Number(h) * 3600 + Number(m) * 60 + Number(s);
    return neg ? -v : v;
}

const p2 = (n, l = 2) => String(Math.floor(n)).padStart(l, '0');

export function formatearMET(seg) {
    const signo = seg < 0 ? 'T-' : 'T+';
    const s = Math.abs(seg);
    return `${signo}${p2(s / 3600, 3)}:${p2((s % 3600) / 60)}:${p2(s % 60)}`;
}

export function fechaUTC(seg) {
    return new Date(LANZAMIENTO_MS + seg * 1000);
}

// "1969-07-20T20:17:40" (sin zona; formato que aceptan los endpoints SPICE)
export function isoUTC(seg) {
    return fechaUTC(seg).toISOString().split('.')[0];
}

export function relojGMT(seg) {
    const d = fechaUTC(seg);
    const dia = d.getUTCDate();
    return `${p2(dia)} JUL ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}`;
}

// Tiempo sidéreo medio de Greenwich (rad). Suficiente para orientar la Tierra en la escena.
export function gmst(seg) { return gmstMs(LANZAMIENTO_MS + seg * 1000); }

export function gmstMs(ms) {
    const jd = ms / 86400000 + 2440587.5;
    const grados = 280.46061837 + 360.98564736629 * (jd - 2451545.0);
    return ((grados % 360) + 360) % 360 * Math.PI / 180;
}
