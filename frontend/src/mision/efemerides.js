// Efemérides de la misión (SPICE, DE440): posición de la Luna y del Sol vistas desde la Tierra
// y orientación del marco lunar MOON_ME. Primero se piden al backend; si no responde se usa la
// copia precalculada (src/data/efemerides_apollo11.json, generada con el mismo backend).
import respaldo from '../data/efemerides_apollo11.json';
import { getMissionTrack } from '../api/client.js';
import { norm } from './vec.js';

export class Efemerides {
    constructor(datos) { this.usar(datos, 'respaldo local'); }

    usar(datos, origen) {
        this.t0 = datos.t0_get_s ?? -3600;
        this.paso = datos.step_s;
        this.m = datos.samples;
        this.origen = origen;
    }

    _i(t) {
        const x = (t - this.t0) / this.paso;
        const i = Math.max(0, Math.min(this.m.length - 2, Math.floor(x)));
        return [i, Math.max(0, Math.min(1, x - i))];
    }

    // Luna (km, J2000, centrada en la Tierra): Hermite con velocidades por diferencias
    luna(t) {
        const [i, f] = this._i(t);
        const P = (k) => this.m[Math.max(0, Math.min(this.m.length - 1, k))].moon;
        const p0 = P(i), p1 = P(i + 1), pm = P(i - 1), pp = P(i + 2);
        const f2 = f * f, f3 = f2 * f;
        const h00 = 2 * f3 - 3 * f2 + 1, h10 = f3 - 2 * f2 + f, h01 = -2 * f3 + 3 * f2, h11 = f3 - f2;
        return [0, 1, 2].map((k) => h00 * p0[k] + h10 * (p1[k] - pm[k]) / 2 + h01 * p1[k] + h11 * (pp[k] - p0[k]) / 2);
    }

    // Dirección unitaria al Sol desde la Tierra
    sol(t) {
        const [i, f] = this._i(t);
        const a = this.m[i].sun, b = this.m[i + 1].sun;
        return norm([0, 1, 2].map((k) => a[k] + (b[k] - a[k]) * f));
    }

    // Matriz 3x3 J2000 -> marco lunar (fila a fila). La rotación lunar es lenta: lineal + ortonormalizar
    rotLuna(t) {
        const [i, f] = this._i(t);
        const a = this.m[i].rot, b = this.m[i + 1].rot;
        const r = a.map((v, k) => v + (b[k] - v) * f);
        const x = norm(r.slice(0, 3));
        let y = r.slice(3, 6);
        const d = x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
        y = norm([y[0] - d * x[0], y[1] - d * x[1], y[2] - d * x[2]]);
        const z = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
        return [...x, ...y, ...z];
    }
}

export async function cargarEfemerides() {
    const e = new Efemerides(respaldo);
    try {
        e.usar(await getMissionTrack(), 'SPICE en vivo (backend)');
    } catch (err) {
        console.warn('Backend SPICE no disponible, efemérides precalculadas:', err.message);
    }
    return e;
}
