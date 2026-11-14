// Trayectoria de Apollo 11 desde la plataforma hasta la aproximación final.
//
// Datos reales:  perfil de ascenso (altitud/rango, NASA SP-4029), órbita de aparcamiento de 88,18 min,
//                instantes de TLI, LOI, DOI y PDI, posición real de la Luna y del Sol (SPICE / DE440).
// Modelado:      el arco translunar resuelve el problema de Lambert (2 cuerpos) entre el fin de la TLI
//                y la Luna en el instante de LOI; la aproximación final se construye en el marco lunar
//                para llegar por detrás de la Luna en órbita retrógrada, como en la misión.
//
// Unidades: km y segundos (GET). Marco: J2000 centrado en la Tierra.
import { add, sub, mul, dot, cross, len, norm, lerp, smooth, clamp, mv, mtv, rotar, monotona } from './vec.js';
import { getASegundos, gmst } from './tiempo.js';

export const R_TIERRA = 6378.137;
export const R_LUNA = 1737.4;
const MU_LUNA = 4902.8;
const DEG = Math.PI / 180;
const DIA_SIDEREO_LUNAR = 27.321661 * 86400;

// Esfera -> vector (lat/lon en grados, radio en km)
const esfera = (r, latDeg, lonDeg) => {
    const la = latDeg * DEG, lo = lonDeg * DEG;
    return [r * Math.cos(la) * Math.cos(lo), r * Math.cos(la) * Math.sin(lo), r * Math.sin(la)];
};
const rotZ = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a), v[2]];


// ── Mecánica orbital de dos cuerpos (variables universales; Curtis, "Orbital Mechanics", alg. 3.4 y 5.2) ──
const MU_TIERRA = 398600.4418;
function stumpffC(z) { return z > 1e-8 ? (1 - Math.cos(Math.sqrt(z))) / z : z < -1e-8 ? (Math.cosh(Math.sqrt(-z)) - 1) / -z : 0.5; }
function stumpffS(z) {
    if (z > 1e-8) { const s = Math.sqrt(z); return (s - Math.sin(s)) / (s * s * s); }
    if (z < -1e-8) { const s = Math.sqrt(-z); return (Math.sinh(s) - s) / (s * s * s); }
    return 1 / 6;
}
// Propaga (r0, v0) un tiempo dt (s) alrededor de un cuerpo de parámetro mu
export function kepler(r0v, v0v, dt, mu = MU_TIERRA) {
    const r0 = len(r0v), v0 = len(v0v), vr0 = dot(r0v, v0v) / r0, alfa = 2 / r0 - (v0 * v0) / mu, sm = Math.sqrt(mu);
    let x = sm * Math.abs(alfa) * dt;
    if (!Number.isFinite(x) || x === 0) x = sm * dt / r0;
    for (let i = 0; i < 60; i++) {
        const z = alfa * x * x, C = stumpffC(z), S = stumpffS(z);
        const F = (r0 * vr0 / sm) * x * x * C + (1 - alfa * r0) * x * x * x * S + r0 * x - sm * dt;
        const dF = (r0 * vr0 / sm) * x * (1 - alfa * x * x * S) + (1 - alfa * r0) * x * x * C + r0;
        const paso = F / dF;
        x -= paso;
        if (Math.abs(paso) < 1e-9) break;
    }
    const z = alfa * x * x;
    const f = 1 - (x * x / r0) * stumpffC(z), g = dt - (x * x * x / sm) * stumpffS(z);
    return add(mul(r0v, f), mul(v0v, g));
}
// Problema de Lambert: velocidad inicial para ir de r1 a r2 en dt (sentido según la normal n)
export function lambert(r1v, r2v, dt, n, mu = MU_TIERRA) {
    const r1 = len(r1v), r2 = len(r2v);
    let th = Math.acos(clamp(dot(r1v, r2v) / (r1 * r2), -1, 1));
    if (dot(cross(r1v, r2v), n) < 0) th = 2 * Math.PI - th;
    const A = Math.sin(th) * Math.sqrt((r1 * r2) / (1 - Math.cos(th)));
    const y = (z) => r1 + r2 + A * (z * stumpffS(z) - 1) / Math.sqrt(stumpffC(z));
    const F = (z) => { const yy = y(z); return Math.pow(yy / stumpffC(z), 1.5) * stumpffS(z) + A * Math.sqrt(yy) - Math.sqrt(mu) * dt; };
    let lo = -4 * Math.PI * Math.PI, hi = 4 * Math.PI * Math.PI - 1e-6;
    while (y(lo) < 0) lo += 0.1;
    for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (F(m) > 0) hi = m; else lo = m; }
    const yy = y((lo + hi) / 2);
    const f = 1 - yy / r1, g = A * Math.sqrt(yy / mu);
    return mul(sub(r2v, mul(r1v, f)), 1 / g);
}

export class Trayectoria {
    constructor(datos, efem) {
        this.d = datos;
        this.efem = efem;
        const ev = {};
        for (const e of datos.eventos) ev[e.id] = getASegundos(e.get);
        this.ev = ev;

        // ── Ascenso: tablas de altitud y rango sobre la superficie ──
        const A = datos.ascenso;
        const xs = A.map((r) => r[0]);
        this.altAsc = monotona(xs, A.map((r) => r[1]));
        this.rngAsc = monotona(xs, A.map((r) => r[2]));
        this.pad = datos.pad;

        // ── Órbita de aparcamiento: arranca exactamente donde termina el ascenso ──
        const tIns = ev.orbita;
        const p0 = this._ascenso(tIns);
        const v0 = mul(sub(this._ascenso(tIns), this._ascenso(tIns - 2)), 0.5);
        this.park = { t0: tIns, p0, n: norm(cross(p0, v0)), w: (2 * Math.PI) / (88.18 * 60) };

        // ── TLI: encendido de la S-IVB integrado (empuje progrado, aceleración creciente 0,7 g -> 1,45 g)
        //    y arco translunar resuelto con Lambert entre el fin del encendido y la Luna en la LOI ──
        this.tTLI = ev.tli;
        this.tTLIfin = ev.tliFin;
        this.tLOI = ev.loi1;
        const lunaLOI = efem.luna(this.tLOI);
        let k = 1, quema = null;
        for (let it = 0; it < 4; it++) {
            quema = this._integrarTLI(k);
            const fin = quema[quema.length - 1];
            const vObj = len(lambert(fin.p, lunaLOI, this.tLOI - this.tTLIfin, this.park.n));
            const dvHecho = len(fin.v) - 7.8, dvObj = vObj - 7.8;
            k *= dvObj / dvHecho;
        }
        this.quema = quema;
        this.r1 = quema[quema.length - 1].p;
        this.v1 = lambert(this.r1, lunaLOI, this.tLOI - this.tTLIfin, this.park.n);

        // ── Fase lunar (marco lunar MOON_ME: lon 0 mira a la Tierra, lon + hacia el este) ──
        const s = datos.sitio;
        this.sitio = s;
        this.tPDI = ev.pdi;
        this.tP64 = ev.p64;
        this.rangoPDI = 468; // km recorridos por Eagle desde la PDI hasta Base Tranquilidad (~7,6 km tras la P64)
        this.lonPDI = s.lon + (this.rangoPDI / R_LUNA) / DEG;
        // ── Aproximación: se enlaza el arco translunar con una curva en el marco lunar 10 h antes de LOI ──
        this.tAprox = this.tLOI - 10 * 3600;
        const sB = this._enMarcoLunar(this._translunar(this.tAprox), this.tAprox);
        const rB = len(sB);
        this.aprox = { rB, latB: Math.asin(sB[2] / rB) / DEG, lonB: Math.atan2(sB[1], sB[0]) / DEG, rL: R_LUNA + 160, dl: 115 };
        // ritmo angular con conservación del momento angular: dθ ∝ dt / r²
        const M = 2000, ac = new Float64Array(M + 1);
        for (let i = 1; i <= M; i++) { const ra = this._rAprox((i - 0.5) / M); ac[i] = ac[i - 1] + 1 / (ra * ra); }
        this.aprox.ac = ac;

        // Órbita lunar retrógrada (de este a oeste sobre la cara visible, como Apollo 11): la longitud baja.
        // El ritmo se ajusta (±2 %) para que la LOI ocurra tras barrer ~115° desde la llegada y que,
        // ~13 vueltas después, la PDI quede 468 km al este de Base Tranquilidad.
        const rOrb = R_LUNA + 111;
        const wNom = 360 / (2 * Math.PI * Math.sqrt(rOrb ** 3 / MU_LUNA)) + 360 / DIA_SIDEREO_LUNAR;
        const dT = this.tPDI - this.tLOI;
        const objetivo = this.aprox.lonB - this.aprox.dl;              // longitud deseada en la LOI
        const vueltas = Math.round((wNom * dT - (objetivo - this.lonPDI)) / 360);
        this.wLon = (objetivo - this.lonPDI + 360 * vueltas) / dT;     // grados por segundo
        this.lonLOI = this._lon(this.tLOI);
        this.tLOIfin = ev.loi1Fin;
        this.tLOI2 = ev.loi2;
        this.tDesacople = ev.desacople;
        this.tDOI = ev.doi;
        this.lonPeri = this._lon(this.tLOIfin);
    }

    // ───────────────────────── tramos ─────────────────────────

    // Posición del ascenso en coordenadas fijas a la Tierra (km)
    _ascensoECEF(t) {
        const alt = Math.max(0, this.altAsc(Math.max(0, t)));
        const d = Math.max(0, this.rngAsc(Math.max(0, t))) / R_TIERRA;
        const la1 = this.pad.lat * DEG, lo1 = this.pad.lon * DEG, az = this.pad.azimut_vuelo_deg * DEG;
        const la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(az));
        const lo2 = lo1 + Math.atan2(Math.sin(az) * Math.sin(d) * Math.cos(la1), Math.cos(d) - Math.sin(la1) * Math.sin(la2));
        return esfera(R_TIERRA + alt, la2 / DEG, lo2 / DEG);
    }

    _ascenso(t) { return rotZ(this._ascensoECEF(t), gmst(t)); }

    _aparcamiento(t) {
        const k = this.park;
        return rotar(k.p0, k.n, k.w * (t - k.t0));
    }

    // Integra (RK4, paso 1 s) el encendido de la TLI desde la órbita de aparcamiento
    _integrarTLI(k) {
        const T = this.tTLIfin - this.tTLI, tau = 684;            // a(t) = a0 / (1 - t/tau): masa que baja
        const a0 = 0.0070 * k;                                    // km/s² (~0,7 g al inicio)
        let p = this._aparcamiento(this.tTLI);
        let v = mul(cross(this.park.n, p), this.park.w);
        const acc = (pp, vv, t) => {
            const r = len(pp);
            return add(mul(pp, -MU_TIERRA / (r * r * r)), mul(norm(vv), a0 / (1 - t / tau)));
        };
        const out = [{ p, v }];
        const n = Math.ceil(T), h = T / n;
        for (let i = 0; i < n; i++) {
            const t = i * h;
            const k1v = acc(p, v, t), k1p = v;
            const k2v = acc(add(p, mul(k1p, h / 2)), add(v, mul(k1v, h / 2)), t + h / 2), k2p = add(v, mul(k1v, h / 2));
            const k3v = acc(add(p, mul(k2p, h / 2)), add(v, mul(k2v, h / 2)), t + h / 2), k3p = add(v, mul(k2v, h / 2));
            const k4v = acc(add(p, mul(k3p, h)), add(v, mul(k3v, h)), t + h), k4p = add(v, mul(k3v, h));
            p = add(p, mul(add(add(k1p, mul(k2p, 2)), add(mul(k3p, 2), k4p)), h / 6));
            v = add(v, mul(add(add(k1v, mul(k2v, 2)), add(mul(k3v, 2), k4v)), h / 6));
            out.push({ p, v });
        }
        out.paso = h;
        return out;
    }

    // Arco translunar (2 cuerpos, Tierra); durante la TLI, el encendido integrado
    _translunar(t) {
        if (t >= this.tTLIfin) return kepler(this.r1, this.v1, t - this.tTLIfin);
        const q = this.quema, x = Math.max(0, (t - this.tTLI) / q.paso);
        const i = Math.min(q.length - 2, Math.floor(x)), f = x - i;
        return lerp(q[i].p, q[i + 1].p, f);
    }

    _enMarcoLunar(p, t) { return mv(this.efem.rotLuna(t), sub(p, this.efem.luna(t))); }
    _desdeMarcoLunar(s, t) { return add(this.efem.luna(t), mtv(this.efem.rotLuna(t), s)); }

    _lon(t) { return this.lonPDI + this.wLon * (this.tPDI - t); }

    _rAprox(tau) { const a = this.aprox; return a.rL + (a.rB - a.rL) * Math.pow(1 - tau, 1.15); }

    _aproximacion(t) {
        const a = this.aprox;
        const tau = clamp((t - this.tAprox) / (this.tLOI - this.tAprox), 0, 1);
        const i = tau * (a.ac.length - 1), i0 = Math.floor(i), f = i - i0;
        const g = (a.ac[i0] + (a.ac[Math.min(a.ac.length - 1, i0 + 1)] - a.ac[i0]) * f) / a.ac[a.ac.length - 1];
        const lon = a.lonB - a.dl * g;
        const lat = a.latB * (1 - smooth(tau));
        return this._desdeMarcoLunar(esfera(this._rAprox(tau), lat, lon), t);
    }

    // Altitud lunar de Columbia (y de Eagle mientras van juntos)
    _altCSM(t) {
        if (t < this.tLOIfin) return 160 + (111 - 160) * smooth((t - this.tLOI) / (this.tLOIfin - this.tLOI));
        const th = (this.lonPeri - this._lon(t)) * DEG;
        const eli = 212.5 - 101.5 * Math.cos(th);        // LOI-1: 111 x 314 km
        const circ = 111 + 5.5 * (1 - Math.cos(th));     // LOI-2: ~111 x 122 km
        return eli + (circ - eli) * smooth((t - this.tLOI2) / 120);
    }

    // Eagle tras la DOI: órbita de 15 x 107 km con el perilunio en la PDI
    _altLM(t) {
        const csm = this._altCSM(t);
        if (t < this.tDOI) return csm;
        const th = (this._lon(t) - this.lonPDI) * DEG;
        const doi = 61 - 46 * Math.cos(th);
        return csm + (doi - csm) * smooth((t - this.tDOI) / 30);
    }

    // Descenso propulsado: frenado de 1,70 a 0,12 km/s y de 15 a 2,3 km de altura
    _pdi(t) {
        const T = this.tP64 - this.tPDI;
        const tau = clamp((t - this.tPDI) / T, 0, 1.0);
        const v0 = 1.696, v1 = 0.12;
        const s = v0 * T * tau - 0.5 * (v0 - v1) * T * tau * tau;
        const lon = this.sitio.lon + ((this.rangoPDI - s) / R_LUNA) / DEG;
        const alt = 2.3 + 12.9 * (1 - Math.pow(tau, 1.6));
        const lat = this.sitio.lat * smooth(tau);
        return { lon, lat, alt };
    }

    _lunarME(t, quien) {
        if (quien === 'lm' && t >= this.tPDI) {
            const { lon, lat, alt } = this._pdi(t);
            return esfera(R_LUNA + alt, lat, lon);
        }
        const alt = quien === 'lm' ? this._altLM(t) : this._altCSM(t);
        let lon = this._lon(t);
        // tras la separación (100:40) Columbia se adelanta lentamente
        if (quien === 'csm' && t > this.tDesacople) lon -= 0.02 * clamp((t - this.tDesacople) / 3000, 0, 1);
        return esfera(R_LUNA + alt, 0, lon);
    }

    // ───────────────────────── API pública ─────────────────────────

    // Posición (J2000, km) del vehículo: 'pila' (antes del desacople) / 'lm' / 'csm'
    posicion(t, quien = 'lm') {
        if (t < this.park.t0) return this._ascenso(t);
        if (t < this.tTLI) return this._aparcamiento(t);
        if (t < this.tAprox) return this._translunar(t);
        if (t < this.tLOI) {
            const w = smooth((t - this.tAprox) / 7200);
            return w < 1 ? lerp(this._translunar(t), this._aproximacion(t), w) : this._aproximacion(t);
        }
        return this._desdeMarcoLunar(this._lunarME(t, quien), t);
    }

    velocidad(t, quien = 'lm', dt = 0.5) {
        return mul(sub(this.posicion(t + dt, quien), this.posicion(t - dt, quien)), 1 / (2 * dt));
    }

    // Respecto a qué cuerpo se miden altitud y velocidad (cambio en la equigravisfera, como en la misión)
    cuerpo(t) { return t < this.ev.equigravisfera ? 'TIERRA' : 'LUNA'; }

    telemetria(t, quien = 'lm') {
        const p = this.posicion(t, quien);
        const v = this.velocidad(t, quien);
        const luna = this.efem.luna(t);
        if (this.cuerpo(t) === 'TIERRA') {
            return { cuerpo: 'TIERRA', alt: len(p) - R_TIERRA, vel: len(v), distLuna: len(sub(p, luna)) - R_LUNA, distTierra: len(p) - R_TIERRA };
        }
        const vl = sub(v, this.efem.velocidadLuna ? this.efem.velocidadLuna(t) : mul(sub(this.efem.luna(t + 30), this.efem.luna(t - 30)), 1 / 60));
        return { cuerpo: 'LUNA', alt: len(sub(p, luna)) - R_LUNA, vel: len(vl), distLuna: len(sub(p, luna)) - R_LUNA, distTierra: len(p) - R_TIERRA };
    }

    // Velocidad respecto al suelo de la Tierra durante el ascenso (para orientar el cohete)
    direccionAscenso(t) {
        const a = this._ascensoECEF(t - 0.5), b = this._ascensoECEF(t + 0.5);
        const up = norm(this._ascensoECEF(t));
        const v = sub(b, a);
        const dir = len(v) < 1e-5 ? up : norm(v);
        return norm(rotZ(lerp(up, dir, smooth((t - 10) / 20)), gmst(t)));
    }

    // Vector "arriba" local (radial) respecto al cuerpo dominante
    radial(t, quien = 'lm') {
        const p = this.posicion(t, quien);
        return t < this.tAprox ? norm(p) : norm(sub(p, this.efem.luna(t)));
    }

    // Estado de Eagle al inicio de la fase de aproximación (para la simulación local en metros)
    estadoP64() {
        const T = this.tP64 - this.tPDI;
        return {
            rangoM: (this.rangoPDI - (1.696 + 0.12) / 2 * T) * 1000,  // distancia horizontal al sitio
            altM: 2300,
            vx: 120,
            vy: -12.9 * 1.6 / T * 1000,                              // derivada de la altitud al final
        };
    }

    // Puntos de la trayectoria (para dibujarla)
    muestras(t0, t1, n, quien = 'lm') {
        const out = [];
        for (let i = 0; i <= n; i++) out.push(this.posicion(t0 + ((t1 - t0) * i) / n, quien));
        return out;
    }
}
