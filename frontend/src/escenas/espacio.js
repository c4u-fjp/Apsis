// Escena del espacio (escala real en km): Tierra, Luna (SPICE), la pila Apollo con sus separaciones,
// la trayectoria completa y las cámaras de persecución y de mapa.
//
// Origen flotante: el grupo "mundo" se desplaza para que el vehículo quede siempre en el origen;
// así no se pierde precisión de coma flotante a 400 000 km de la Tierra.
import * as THREE from 'three';
import { Orbita } from '../core/orbita.js';
import { R_TIERRA, R_LUNA } from '../mision/trayectoria.js';
import { gmst } from '../mision/tiempo.js';
import { add, sub, mul, norm, len, dot, cross, lerp, smooth, rotar, clamp } from '../mision/vec.js';
import { crearTierra, LUNA_RADIO_MODELO, SATURNO_M_POR_UNIDAD, LM_M_POR_UNIDAD } from '../modelos/cargador.js';
import { crearEstrellas, crearMarcador, crearEtiqueta, Particulas, animarLlama } from '../modelos/efectos.js';
import { NaveApollo } from '../modelos/nave.js';

export const T3 = (v, out = new THREE.Vector3()) => out.set(v[0], v[2], -v[1]);   // J2000 -> Three.js
const ESC_PILA = SATURNO_M_POR_UNIDAD / 1000;   // km por unidad del Saturn V
const ESC_LM = LM_M_POR_UNIDAD / 1000;          // km por unidad del LM
const MU_T = 398600.4418;

const _m = new THREE.Matrix4();
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3();

function quatDesdeEjes(yJ, zRefJ, out = new THREE.Quaternion()) {
    const y = norm(yJ);
    let z = sub(zRefJ, mul(y, dot(y, zRefJ)));
    if (len(z) < 1e-6) z = sub([0, 0, 1], mul(y, y[2]));
    z = norm(z);
    const x = cross(y, z);
    _m.makeBasis(T3(x, _v), T3(y, _w), T3(z, _u));
    return out.setFromRotationMatrix(_m);
}

export class EscenaEspacio {
    constructor(ctx) {
        this.ctx = ctx;
        const { renderer } = ctx;
        this.id = 'espacio';
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000000);
        this.scene.fog = new THREE.FogExp2(0xa8c8ea, 0);   // bruma de la atmósfera durante el ascenso
        this.camera = new THREE.PerspectiveCamera(55, 1, 1e-5, 4e6);
        this.rig = new THREE.Group();
        this.rig.add(this.camera);
        this.scene.add(this.rig);

        this.estrellas = crearEstrellas(6000, 3e6);
        this.scene.add(this.estrellas);
        this.mundo = new THREE.Group();
        this.scene.add(this.mundo);

        this.sol = new THREE.DirectionalLight(0xffffff, 3.2);
        this.scene.add(this.sol, this.sol.target, new THREE.AmbientLight(0x29313d, 0.5));

        this.tierra = crearTierra(R_TIERRA, renderer.capabilities.getMaxAnisotropy());
        this.mundo.add(this.tierra.grupo);
        this.lunaGrupo = new THREE.Group();
        this.mundo.add(this.lunaGrupo);

        // Trayectoria y marcadores (vista de mapa)
        this.lineas = new THREE.Group();
        this.mundo.add(this.lineas);
        this.marcador = crearMarcador(0xffe08a);
        this.mundo.add(this.marcador);
        this.etTierra = crearEtiqueta('TIERRA');
        this.etLuna = crearEtiqueta('LUNA');
        this.etNave = crearEtiqueta('APOLLO 11', { color: '#ffb020' });
        this.mundo.add(this.etTierra, this.etLuna, this.etNave);
        this.brilloTierra = crearMarcador(0x6fa8ff);
        this.brilloLuna = crearMarcador(0xd8d8d0);
        this.mundo.add(this.brilloTierra, this.brilloLuna);

        // Humo del ascenso (posiciones absolutas en km)
        this.humo = new Particulas({ n: 2500, tam: 0.05, color: 0xd8d8d8, vida: 45 });
        this.humo.puntos.material.opacity = 0.55;
        this.mundo.add(this.humo.puntos);

        this.controls = new Orbita(renderer.domElement);
        this.controls.minR = 0.004;
        this.controls.maxR = 1.5e6;
        this.modo = 'auto';          // auto | persecucion | mapa
        this.ultimaFaseCam = null;
        this.focoAbs = [0, 0, 0];
        this.qPila = new THREE.Quaternion();
        this.qLM = new THREE.Quaternion();
        this.qCSM = new THREE.Quaternion();
        this.tUltimo = null;
    }

    async cargar(nave, luna) {
        this.nave = nave;
        const s = R_LUNA / LUNA_RADIO_MODELO;
        luna.scale.setScalar(s);
        this.lunaGrupo.add(luna);
        this._construirLineas();
    }

    // ─────────── trayectoria dibujada ───────────
    _construirLineas() {
        const { tray } = this.ctx;
        const tiempos = [];
        for (let t = 0; t <= tray.park.t0; t += 8) tiempos.push(t);
        for (let t = tray.park.t0; t <= tray.tTLI; t += 60) tiempos.push(t);
        for (let i = 0; i <= 500; i++) tiempos.push(tray.tTLI + (tray.tAprox - tray.tTLI) * Math.pow(i / 500, 2.2));
        const geo = tiempos.map((t) => tray.posicion(t));
        const tSel = [];
        for (let i = 0; i <= 300; i++) tSel.push(tray.tAprox + (tray.tLOI - tray.tAprox) * Math.pow(i / 300, 0.45));
        for (let t = tray.tLOI; t <= tray.tPDI; t += 60) tSel.push(t);
        for (let i = 0; i <= 80; i++) tSel.push(tray.tPDI + (tray.tP64 - tray.tPDI) * (i / 80));
        const sel = tSel.map((t) => sub(tray.posicion(t), this.ctx.efem.luna(t)));

        const crear = (pts, colorFuerte) => {
            const arr = new Float32Array(pts.length * 3);
            pts.forEach((p, i) => { T3(p, _v); arr.set([_v.x, _v.y, _v.z], i * 3); });
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
            const g2 = new THREE.BufferGeometry();          // misma lista de puntos, rango de dibujo propio
            g2.setAttribute('position', g.getAttribute('position'));
            const futura = new THREE.Line(g2, new THREE.LineBasicMaterial({ color: 0x3f9d52, transparent: true, opacity: 0.75 }));
            const pasada = new THREE.Line(g, new THREE.LineBasicMaterial({ color: colorFuerte }));
            futura.frustumCulled = pasada.frustumCulled = false;
            const grupo = new THREE.Group();
            grupo.add(futura, pasada);
            this.lineas.add(grupo);
            return { grupo, pasada };
        };
        this.lGeo = { ...crear(geo, 0x4af626), tiempos };
        this.lSel = { ...crear(sel, 0x9dff7a), tiempos: tSel };
    }

    _rango(linea, t) {
        const ts = linea.tiempos;
        let lo = 0, hi = ts.length - 1;
        if (t <= ts[0]) return 0;
        if (t >= ts[hi]) return ts.length;
        while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ts[m] <= t) lo = m; else hi = m; }
        return lo + 1;
    }

    // ─────────── actitudes ───────────
    _velRel(t, quien = 'lm') {
        const { tray, efem } = this.ctx;
        const v = tray.velocidad(t, quien);
        if (t < tray.tAprox) return v;
        const vl = mul(sub(efem.luna(t + 30), efem.luna(t - 30)), 1 / 60);
        const w = smooth((t - tray.tAprox) / 7200);
        return sub(v, mul(vl, w));
    }

    _actitudPila(t, out) {
        const { tray } = this.ctx;
        if (t < tray.park.t0) return quatDesdeEjes(tray.direccionAscenso(t), [0, 0, 1], out);
        const radial = tray.radial(t);
        return quatDesdeEjes(norm(this._velRel(t)), mul(radial, -1), out);
    }

    _actitudLM(t, out) {
        const { tray, crono } = this.ctx;
        const up = tray.radial(t, 'lm');
        const v = norm(this._velRel(t, 'lm'));
        const fwd = norm(sub(v, mul(up, dot(v, up))));
        if (t < tray.tPDI) return quatDesdeEjes(mul(v, -1), mul(up, -1), out);
        const tau = clamp((t - tray.tPDI) / (tray.tP64 - tray.tPDI), 0, 1);
        const th = (90 - 45 * smooth(tau)) * Math.PI / 180;
        const y = add(mul(up, Math.cos(th)), mul(fwd, -Math.sin(th)));
        const frenteArriba = add(mul(up, Math.sin(th)), mul(fwd, Math.cos(th)));
        const giro = Math.PI * (1 - smooth((t - (crono.ev.caraArriba - 30)) / 30));   // giro "cara arriba"
        return quatDesdeEjes(y, rotar(frenteArriba, norm(y), giro), out);
    }

    // ─────────── ciclo ───────────
    entrar() {
        this.mundo.add(this.nave.raiz, this.nave.raizLM);
        this.humo.vaciar();
        this.tUltimo = null;
    }

    salir() {}

    etiquetaConfig(t) {
        const ev = this.ctx.crono.ev;
        if (t < ev.sepS1) return 'SATURN V COMPLETO';
        if (t < ev.sepS2) return 'S-II + S-IVB + CSM';
        if (t < ev.sepCSM) return 'S-IVB + CSM';
        if (t < ev.extraccion) return 'S-IVB + LM + CSM';
        if (t < ev.desacople) return 'COLUMBIA + EAGLE';
        return 'EAGLE (LM)';
    }

    actualizar(t, dtReal, dtSim, tiempoReal, estado) {
        const { tray, efem, crono } = this.ctx;
        const ev = crono.ev;
        const nave = this.nave;
        const desacoplado = t >= ev.desacople;

        // ── vehículos ──
        let foco;
        if (!desacoplado) {
            const p = tray.posicion(t, 'lm');
            this._actitudPila(t, this.qPila);
            const centro = nave.configurar(t, ESC_PILA, tiempoReal);
            for (const r of [nave.raiz, nave.raizLM]) { T3(p, r.position); r.quaternion.copy(this.qPila); }
            this._colocarSueltas(t);
            _v.copy(centro).multiplyScalar(ESC_PILA).applyQuaternion(this.qPila);
            foco = add(p, [_v.x, -_v.z, _v.y]);
            this.posPila = p;
        } else {
            const tU = ev.desacople;
            const w = smooth((t - tU) / 1800);
            this._actitudPila(t, this.qCSM);
            this._actitudLM(t, this.qLM);
            // Eagle gira 180° sobre su eje Z (el que apunta a la Luna) para quedar con el motor hacia delante.
            // Antes se usaba slerp entre dos actitudes casi opuestas: el camino "más corto" cambiaba de lado
            // cada cuadro y Eagle y Columbia temblaban.
            const giro = Math.PI * smooth((t - tU) / 600);
            const qL = t - tU >= 600 ? this.qLM.clone()
                : this.qCSM.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), giro));
            const baseLM = NaveApollo.baseLM * ESC_PILA, ofsCSM = (NaveApollo.baseLM + NaveApollo.offsetCSMdesdeLM) * ESC_PILA;
            const ejeY = (q) => { _v.set(0, 1, 0).applyQuaternion(q); return [_v.x, -_v.z, _v.y]; };
            const yC = ejeY(this.qCSM);
            const pL = add(tray.posicion(t, 'lm'), mul(yC, baseLM * (1 - w)));
            const pC = add(tray.posicion(t, 'csm'), mul(yC, ofsCSM * (1 - w)));
            T3(pL, nave.raizLM.position); nave.raizLM.quaternion.copy(qL);
            T3(pC, nave.raiz.position); nave.raiz.quaternion.copy(this.qCSM);
            nave.soloCSM(ESC_PILA, t, tiempoReal);
            nave.soloLM(ESC_LM);
            const enc = crono.encendido(t);
            animarLlama(nave.llamas.DPS, tiempoReal, !!enc && enc.motor === 'DPS');
            _v.set(0, 3.0 * ESC_LM * 1, 0).applyQuaternion(qL);
            foco = add(pL, [_v.x, -_v.z, _v.y]);
        }
        this.focoAbs = foco;
        T3(foco, this.mundo.position).negate();

        // ── Tierra, Luna, Sol ──
        this.tierra.grupo.rotation.y = gmst(t);
        this.tierra.nubes.rotation.y = t * 2e-6;
        const pLuna = efem.luna(t);
        T3(pLuna, this.lunaGrupo.position);
        this._orientarLuna(efem.rotLuna(t));
        const sDir = T3(efem.sol(t), new THREE.Vector3());
        this.sol.position.copy(sDir).multiplyScalar(10);
        this.sol.target.position.set(0, 0, 0);

        // ── humo del ascenso ──
        const tel = tray.telemetria(t);
        if (t < ev.oecoS1 && tel.alt < 45 && dtSim > 0) {
            const pb = sub(this.posPila, [0, 0, 0]);
            const omega = cross([0, 0, 7.2921e-5], pb);
            const n = Math.min(12, Math.ceil(dtSim * 25));
            for (let i = 0; i < n; i++) {
                T3(lerp(pb, sub(pb, mul(tray.velocidad(t), dtSim)), i / n), _v);
                const o = T3(omega, _w);
                this.humo.emitir(_v.x + (Math.random() - 0.5) * 0.02, _v.y, _v.z + (Math.random() - 0.5) * 0.02, o.x, o.y, o.z);
            }
        }
        this.humo.actualizar(Math.max(0, dtSim));
        this.humo.puntos.visible = t < ev.oecoS1 + 120;

        // nubes: a baja altura su textura (39 km/píxel) se vería como una mancha gris
        this.tierra.nubes.material.opacity = 0.85 * smooth((tel.alt - 120) / 900);
        this.tierra.nubes.visible = this.tierra.nubes.material.opacity > 0.01 || tel.cuerpo !== 'TIERRA';
        if (tel.cuerpo !== 'TIERRA') this.tierra.nubes.material.opacity = 0.85;

        // ── cielo: azul en la atmósfera baja ──
        const azul = tel.cuerpo === 'TIERRA' ? 1 - smooth((tel.alt - 8) / 55) : 0;
        this.scene.background.setRGB(0.32 * azul, 0.55 * azul, 0.9 * azul);
        this.scene.fog.density = 0.01 * azul;
        this.lunaGrupo.visible = azul < 0.25;                // la Luna creciente no se ve en el cielo diurno
        this.estrellas.material.opacity = 1 - azul;
        this.estrellas.material.transparent = true;

        // ── líneas de trayectoria ──
        this.lGeo.pasada.geometry.setDrawRange(0, this._rango(this.lGeo, t));
        this.lGeo.pasada.material.visible = true;
        T3(pLuna, this.lSel.grupo.position);
        this.lSel.pasada.geometry.setDrawRange(0, this._rango(this.lSel, t));
        // la parte pasada de la geocéntrica (rango) no usa la misma geometría que la "futura", así que se comparten

        // ── cámara ──
        this._camara(t, estado);

        // marcadores
        const dCam = this.camera.position.length();
        const mapa = dCam > 3000;
        this.marcador.visible = mapa;
        T3(foco, this.marcador.position);
        this.marcador.scale.setScalar(dCam * 0.02);
        this.lineas.visible = dCam > 0.5;
        this.brilloTierra.visible = this.brilloLuna.visible = mapa;
        T3(pLuna, this.brilloLuna.position);
        this.brilloTierra.scale.setScalar(dCam * 0.07);
        this.brilloLuna.scale.setScalar(dCam * 0.05);
        this.brilloTierra.material.opacity = this.brilloLuna.material.opacity = 0.55;
        for (const [et, p, r] of [[this.etTierra, [0, 0, 0], R_TIERRA], [this.etLuna, pLuna, R_LUNA], [this.etNave, foco, 0]]) {
            et.visible = mapa;
            T3(p, et.position);
            et.position.y += r * 1.25 + dCam * 0.02;
        }

        // atmósfera: dirección del Sol en el espacio de la vista
        this.camera.updateMatrixWorld();
        this.tierra.atm.material.uniforms.uSol.value.copy(sDir).transformDirection(this.camera.matrixWorldInverse);
        this.estrellas.position.copy(this.camera.getWorldPosition(_v));
        this.tUltimo = t;
    }

    antesDeRender() {
        this.scene.updateMatrixWorld();
        this.nave.actualizarRecortes();
    }

    // Etapas separadas: trayectoria balística desde el instante de separación
    _colocarSueltas(t) {
        const { tray } = this.ctx;
        const nave = this.nave;
        const raizP = nave.raiz.position, qInv = nave.raiz.quaternion.clone().invert();
        const hasta = { SIC: 545, INTER: 500, LES: 300, SII: 1214 - 549 };
        for (const s of nave.separaciones) {
            const pieza = nave.s.piezas[s.id] ?? nave.s.petalos.find((p) => p.id === s.id);
            if (t < s.t) continue;
            const dt = t - s.t;
            const vida = hasta[s.id] ?? 7200;
            if (dt > vida) { pieza.pivote.visible = false; continue; }
            // estado en la separación (se calcula una vez)
            let est = pieza.pivote.userData.sep;
            if (!est || est.t !== s.t) {
                const p0 = tray.posicion(s.t, 'lm');
                const q0 = this._actitudPila(s.t, new THREE.Quaternion());
                const cfgCentro = pieza.centro;                 // centro de la pieza en unidades de pila
                _v.copy(cfgCentro).multiplyScalar(ESC_PILA).applyQuaternion(q0);
                const pc = add(p0, [_v.x, -_v.z, _v.y]);
                _w.set(...s.impulso).multiplyScalar(0.001).applyQuaternion(q0);
                const v0 = add(tray.velocidad(s.t, 'lm'), [_w.x, -_w.z, _w.y]);
                est = { t: s.t, pc, v0, q0, g: mul(norm(pc), -MU_T / (len(pc) ** 2)) };
                pieza.pivote.userData.sep = est;
            }
            const pos = add(add(est.pc, mul(est.v0, dt)), mul(est.g, 0.5 * dt * dt));
            T3(pos, _v).sub(raizP).applyQuaternion(qInv);
            pieza.pivote.position.copy(_v);
            const giro = new THREE.Quaternion().setFromEuler(new THREE.Euler(s.giro[0] * dt, s.giro[1] * dt, s.giro[2] * dt));
            pieza.pivote.quaternion.copy(qInv).multiply(est.q0).multiply(giro);
            if (s.id.startsWith('SLA_')) pieza.pivote.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(pieza.eje, Math.PI / 4));
            pieza.pivote.scale.setScalar(ESC_PILA);
            pieza.pivote.visible = true;
        }
    }

    _orientarLuna(R) {
        // marco lunar (x0 Tierra, z norte) -> Three: columnas = imagen de los ejes locales del modelo
        const col = (a, b, c) => {
            const vme = [a, -c, b];                                   // inversa de T3
            const j = [R[0] * vme[0] + R[3] * vme[1] + R[6] * vme[2], R[1] * vme[0] + R[4] * vme[1] + R[7] * vme[2], R[2] * vme[0] + R[5] * vme[1] + R[8] * vme[2]];
            return T3(j, new THREE.Vector3());
        };
        _m.makeBasis(col(1, 0, 0), col(0, 1, 0), col(0, 0, 1));
        this.lunaGrupo.quaternion.setFromRotationMatrix(_m);
    }

    // ─────────── cámaras ───────────
    cambiarCamara() {
        this.modo = { auto: 'persecucion', persecucion: 'mapa', mapa: 'auto' }[this.modo];
        this.ultimaFaseCam = null;
        return this.modo;
    }

    _modoEfectivo(fase) {
        if (this.modo !== 'auto') return this.modo;
        return fase.id === 'TRANSITO_LUNAR' ? 'mapa' : 'persecucion';
    }

    _offsetAuto(fase) {
        return {
            PRIMERA_ETAPA: [0.09, 0.03, -0.22], SEGUNDA_ETAPA: [0.07, 0.025, -0.17], TERCERA_ETAPA: [0.06, 0.03, -0.14],
            ORBITA_TERRESTRE: [0.05, 0.07, -0.25], TLI: [0.12, 0.04, -0.25], TRANSPOSICION: [0.07, 0.025, 0.05],
            LOI: [0.05, 0.03, -0.12], ORBITA_LUNAR: [0.03, 0.04, -0.12], DESACOPLE: [0.03, 0.012, 0.035],
            DESCENSO_LUNAR: [0.018, 0.006, -0.028],
        }[fase.id] ?? [0.1, 0.04, -0.25];
    }

    _baseLocal(t) {
        // x lateral, y radial (arriba), z hacia delante
        const { tray } = this.ctx;
        const quien = 'lm';
        const up = tray.radial(t, quien);
        const v = norm(this._velRel(t, quien));
        const fwd = norm(sub(v, mul(up, dot(v, up))));
        const lat = cross(fwd, up);
        return new THREE.Matrix4().makeBasis(T3(lat, new THREE.Vector3()), T3(up, new THREE.Vector3()), T3(fwd, new THREE.Vector3()));
    }

    _camara(t, estado) {
        const { efem, renderer } = this.ctx;
        const fase = estado.fase;
        const modo = this._modoEfectivo(fase);
        const clave = modo + '|' + (this.modo === 'auto' ? fase.id : '');
        let B, objetivo;
        if (modo === 'mapa') {
            const pl = efem.luna(t);
            const cerca = len(sub(this.focoAbs, pl)) < 70000;
            const centro = cerca ? pl : mul(pl, 0.5);
            objetivo = T3(sub(centro, this.focoAbs), new THREE.Vector3());
            B = new THREE.Matrix4();
            if (this.ultimaFaseCam !== clave + cerca) {
                const nrm = norm(cross(pl, sub(efem.luna(t + 600), pl)));
                const d = cerca ? 26000 : 640000;
                this.controls.fijar(T3(add(mul(nrm, d * 0.8), mul(norm(pl), -d * 0.35)), new THREE.Vector3()));
                this.ultimaFaseCam = clave + cerca;
            }
        } else {
            objetivo = new THREE.Vector3();
            B = this._baseLocal(t);
            if (this.ultimaFaseCam !== clave) {
                this.controls.fijar(new THREE.Vector3(...this._offsetAuto(fase)));
                this.ultimaFaseCam = clave;
            }
        }
        // distancia mínima según el tamaño del vehículo: la cámara nunca queda dentro del cohete
        const tam = t >= this.ctx.crono.ev.desacople ? 0.012 : t < this.ctx.crono.ev.sepS2 ? 0.09 : 0.045;
        this.controls.minR = modo === 'mapa' ? 2 : tam;
        if (this.controls.r < this.controls.minR) this.controls.r = this.controls.minR;
        const rot = B.clone().setPosition(0, 0, 0);
        const pos = this.controls.leer().applyMatrix4(rot).add(objetivo);
        const up = _u.set(0, 1, 0).applyMatrix4(rot).normalize();
        if (renderer.xr.isPresenting) {
            // En VR la escena va en km: el rig se escala 1/1000 para que la cabeza y la separación de los
            // ojos midan lo que en la realidad (el Saturn V se ve de 110 m, no como una maqueta).
            this.rig.scale.setScalar(0.001);
            this.camera.near = 0.05; this.camera.far = 1e9;      // en metros del rig
            this.rig.position.copy(pos);
            _m.lookAt(pos, objetivo, up);
            this.rig.quaternion.setFromRotationMatrix(_m);
            return;
        }
        this.rig.position.set(0, 0, 0);
        this.rig.quaternion.identity();
        this.rig.scale.setScalar(1);
        this.camera.near = Math.max(1e-5, Math.min(1, pos.distanceTo(objetivo) * 0.01));
        this.camera.far = 4e6;
        this.camera.updateProjectionMatrix();
        this.camera.position.copy(pos);
        this.camera.up.copy(up);
        this.camera.lookAt(objetivo);
    }
}
