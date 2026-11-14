// Cronología de la misión: fases, eventos, encendidos de motor y perfil de aceleración temporal.
import { getASegundos } from './tiempo.js';

export class Cronologia {
    constructor(datos) {
        this.datos = datos;
        this.eventos = datos.eventos.map((e) => ({ ...e, t: getASegundos(e.get) })).sort((a, b) => a.t - b.t);
        this.fases = datos.fases.map((f) => ({ ...f, t: getASegundos(f.inicio) }));
        this.warp = datos.warp.map(([g, w]) => [getASegundos(g), w]);
        this.encendidos = datos.encendidos.map(([motor, a, b]) => ({ motor, t0: getASegundos(a), t1: getASegundos(b) }));
        this.ev = Object.fromEntries(this.eventos.map((e) => [e.id, e.t]));
        this.inicio = this.eventos[0].t;
    }

    fase(t) {
        let f = this.fases[0];
        for (const x of this.fases) if (x.t <= t) f = x;
        return f;
    }

    indiceFase(t) { return this.fases.indexOf(this.fase(t)); }

    warpHistoria(t) {
        let w = this.warp[0][1];
        for (const [t0, v] of this.warp) if (t0 <= t) w = v;
        return w;
    }

    // Motor encendido en t (o null) y fracción del encendido
    encendido(t) {
        for (const e of this.encendidos) if (t >= e.t0 && t <= e.t1) return { ...e, f: (t - e.t0) / (e.t1 - e.t0) };
        return null;
    }

    siguiente(t) { return this.eventos.find((e) => e.t > t + 0.05) ?? null; }

    // Eventos cruzados entre t0 (excluido) y t1 (incluido)
    entre(t0, t1) { return this.eventos.filter((e) => e.t > t0 && e.t <= t1); }
}
