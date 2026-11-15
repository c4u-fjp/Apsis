// Mar de la Tranquilidad (escala en metros): aproximación final (P64), control semimanual de Armstrong
// (P66), alunizaje y epílogo: la etapa de ascenso se va y la de descenso se queda para siempre.
//
// Física: simulation/descent.js (2D). El LM vuela hacia el oeste (−X en la escena); x de la simulación
// es la distancia recorrida hacia el oeste y 0 es Base Tranquilidad (0,674°N 23,473°E).
import * as THREE from 'three';
import { Orbita } from '../core/orbita.js';
import { crearLM } from '../modelos/cargador.js';
import { crearEstrellas, crearLlama, animarLlama, Particulas } from '../modelos/efectos.js';
import { createLM, step, guiadoAuto, guiadoP66, segundosCombustible, SONDA_CONTACTO } from '../simulation/descent.js';
import { createMachine } from '../simulation/stateMachine.js';
import { getSky, getSite } from '../api/client.js';
import { isoUTC, formatearMET } from '../mision/tiempo.js';
import { sonido } from '../core/audio.js';
import { t as tr } from '../i18n/index.js';

const LM_M = 1.38;
const PIES = 3.28084;
const MODOS = ['AUTO', 'P66', 'DIRECTO'];

// Cráteres (coordenadas de la escena: X este, Z sur). El cráter West está ~400 m al este del sitio.
function crearCrateres() {
    const lista = [
        { x: 400, z: 20, r: 90, d: 18, nombre: 'West' },
        { x: 60, z: 12, r: 15, d: 3, nombre: 'Little West' },
        { x: -260, z: -140, r: 45, d: 7 }, { x: 900, z: 250, r: 60, d: 9 }, { x: 1500, z: -300, r: 120, d: 16 },
    ];
    let a = 1969;
    const rnd = () => { a = (a * 1664525 + 1013904223) % 4294967296; return a / 4294967296; };
    for (let i = 0; i < 520; i++) {
        const lejos = i > 300;   // los del corredor de aproximación son más grandes (se ven desde arriba)
        const x = lejos ? 1000 + rnd() * 9000 : (rnd() - 0.4) * 3000, z = lejos ? (rnd() - 0.5) * 7000 : (rnd() - 0.5) * 1600;
        const r = lejos ? 25 + Math.pow(rnd(), 2) * 260 : 3 + Math.pow(rnd(), 3) * 70;
        if (Math.hypot(x, z) < 40 + r) continue;
        lista.push({ x, z, r, d: r * (0.12 + rnd() * 0.08) });
    }
    return lista;
}

export class EscenaSuperficie {
    constructor(ctx) {
        this.ctx = ctx;
        this.id = 'superficie';
        const { renderer } = ctx;
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000000);
        this.camera = new THREE.PerspectiveCamera(55, 1, 0.3, 400000);
        this.rig = new THREE.Group();
        this.rig.add(this.camera);
        this.scene.add(this.rig);
        this.controls = new Orbita(renderer.domElement);
        this.controls.minR = 6; this.controls.maxR = 3000; this.controls.minEl = -0.05;
        this.estrellas = crearEstrellas(3000, 200000);
        this.scene.add(this.estrellas);

        // Luz: Sol bajo por el este (10,7° de elevación, SPICE); se refina con el backend
        this.dirSol = new THREE.Vector3(0.982, 0.186, -0.020).normalize();
        this.dirTierra = new THREE.Vector3(-0.511, 0.859, -0.020).normalize();
        this.sol = new THREE.DirectionalLight(0xffffff, 3.6);
        this.sol.castShadow = true;
        this.sol.shadow.mapSize.set(2048, 2048);
        Object.assign(this.sol.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 1200 });
        this.sol.shadow.bias = -0.0004;
        this.scene.add(this.sol, this.sol.target, new THREE.AmbientLight(0x404650, 0.35));

        this.crateres = crearCrateres();
        this._construirTerreno();
        this._construirTierra();
        this.polvo = new Particulas({ n: 2600, tam: 1.6, color: 0xa9a59c, vida: 2.2 });
        this.polvo.puntos.material.opacity = 0.5;
        this.scene.add(this.polvo.puntos);

        this.modo = 'AUTO';
        this.vyCmd = -1;
        this.cam = 'auto';    // auto | cabina | suelo
        this.maquina = createMachine((f) => this.ctx.hud.registrar(`[SYS] ${tr('Estado del LM')}: ${f}`));
    }

    // ───────── terreno ─────────
    altura(x, z) {
        let h = 0;
        for (const c of this.crateres) {
            const dx = x - c.x, dz = z - c.z;
            if (Math.abs(dx) > c.r * 1.8 || Math.abs(dz) > c.r * 1.8) continue;
            const p = Math.hypot(dx, dz) / c.r;
            if (p < 1) h -= c.d * (1 - p * p);
            h += c.d * 0.22 * Math.exp(-(((p - 1) / 0.28) ** 2));
        }
        return h + 0.25 * Math.sin(x * 0.031 + Math.sin(z * 0.017) * 2) * Math.sin(z * 0.027 + Math.sin(x * 0.013) * 2);
    }

    suelo = (xs) => this.altura(-xs, 0);   // para la simulación 2D

    peligro = (xs) => {
        const x = -xs;
        if (Math.hypot(x - 400, 20) < 165) return tr('Eagle se posó en el campo de rocas del cráter West');
        const pend = Math.abs(this.altura(x + 1.5, 0) - this.altura(x - 1.5, 0)) / 3;
        if (pend > 0.21) return tr('pendiente de {g}° en el borde de un cráter', { g: (Math.atan(pend) * 180 / Math.PI).toFixed(0) });
        return null;
    };

    _construirTerreno() {
        const lienzo = document.createElement('canvas');
        lienzo.width = lienzo.height = 512;
        const g = lienzo.getContext('2d');
        g.fillStyle = '#86837d'; g.fillRect(0, 0, 512, 512);
        for (let i = 0; i < 9000; i++) {
            const v = 100 + Math.floor(Math.random() * 70);
            g.fillStyle = `rgb(${v},${v - 2},${v - 6})`;
            g.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 3, 1 + Math.random() * 3);
        }
        for (let i = 0; i < 120; i++) {   // pequeños cráteres pintados
            const x = Math.random() * 512, y = Math.random() * 512, r = 2 + Math.random() * 10;
            g.strokeStyle = 'rgba(190,188,182,0.5)'; g.lineWidth = 1.2; g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke();
            g.fillStyle = 'rgba(70,68,64,0.35)'; g.beginPath(); g.arc(x + r * 0.2, y + r * 0.2, r * 0.8, 0, 7); g.fill();
        }
        const tex = new THREE.CanvasTexture(lienzo);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.anisotropy = this.ctx.renderer.capabilities.getMaxAnisotropy();
        const matCerca = new THREE.MeshStandardMaterial({ map: tex, roughness: 1 });
        matCerca.map.repeat.set(1, 1);
        // Terreno con relieve: malla no uniforme (8 m cerca de Base Tranquilidad, 60 m en el corredor de aproximación)
        const coords = (min, max, d0, d1, paso0, paso1) => {
            const v = [min];
            while (v[v.length - 1] < max) { const x = v[v.length - 1]; v.push(x + (x > d0 && x < d1 ? paso0 : paso1)); }
            return v;
        };
        const xs = coords(-2600, 10500, -700, 1100, 8, 60), zs = coords(-4200, 4200, -520, 560, 8, 60);
        const nx = xs.length, nz = zs.length;
        const posArr = new Float32Array(nx * nz * 3), uvArr = new Float32Array(nx * nz * 2), idx = [];
        for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
            const k = j * nx + i, x = xs[i], z = zs[j];
            posArr.set([x, this.altura(x, z), z], k * 3);
            uvArr.set([x / 40, z / 40], k * 2);
            if (i < nx - 1 && j < nz - 1) idx.push(k, k + nx, k + 1, k + 1, k + nx, k + nx + 1);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
        geo.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
        geo.setIndex(idx);
        geo.computeVertexNormals();
        const cerca = new THREE.Mesh(geo, matCerca);
        cerca.receiveShadow = true;
        this.scene.add(cerca);
        // Llanura lejana
        const texLejos = tex.clone();
        texLejos.repeat.set(600, 600);
        texLejos.needsUpdate = true;
        const lejos = new THREE.Mesh(new THREE.PlaneGeometry(80000, 80000), new THREE.MeshStandardMaterial({ map: texLejos, roughness: 1 }));
        lejos.rotation.x = -Math.PI / 2;
        lejos.position.set(0, -2.5, 0);
        this.scene.add(lejos);
        let a = 7;
        const rnd = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
        // Rocas: campo de bloques del cráter West y piedras dispersas
        const roca = new THREE.DodecahedronGeometry(1, 0);
        const matRoca = new THREE.MeshStandardMaterial({ color: 0x6e6b66, roughness: 1, flatShading: true });
        const n = 900;
        const inst = new THREE.InstancedMesh(roca, matRoca, n);
        inst.castShadow = inst.receiveShadow = true;
        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
        for (let i = 0; i < n; i++) {
            let x, z, tam;
            if (i < 520) {   // bloques del cráter West (algunos de varios metros)
                const ang = rnd() * Math.PI * 2, rr = 30 + rnd() * 140;
                x = 400 + Math.cos(ang) * rr; z = 20 + Math.sin(ang) * rr; tam = 0.4 + Math.pow(rnd(), 2.5) * 3.2;
            } else {
                x = (rnd() - 0.4) * 2600; z = (rnd() - 0.5) * 2000; tam = 0.15 + Math.pow(rnd(), 3) * 1.2;
                if (Math.hypot(x, z) < 12) { x += 30; }
            }
            q.setFromEuler(new THREE.Euler(rnd() * 3, rnd() * 3, rnd() * 3));
            s.set(tam, tam * (0.5 + rnd() * 0.4), tam * (0.7 + rnd() * 0.5));
            p.set(x, this.altura(x, z) + tam * 0.25, z);
            inst.setMatrixAt(i, m.compose(p, q, s));
        }
        this.scene.add(inst);
    }

    _construirTierra() {
        const t = new THREE.TextureLoader().load('/texturas/earth_atmos_2048.jpg');
        t.colorSpace = THREE.SRGBColorSpace;
        this.tierra = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.MeshStandardMaterial({ map: t, roughness: 0.8, fog: false }));
        this.scene.add(this.tierra);
        this._colocarTierra();
    }

    _colocarTierra() {
        const d = 150000;
        this.tierra.position.copy(this.dirTierra).multiplyScalar(d);
        this.tierra.scale.setScalar(d * Math.tan((1.9 / 2) * Math.PI / 180));
    }

    async cargar() {
        const lm = await crearLM();
        this.lmObj = lm;
        this.lm3d = lm.grupo;
        this.lm3d.scale.setScalar(LM_M);
        this.scene.add(this.lm3d);
        this.llamaDPS = crearLlama({ radio: 0.45, largo: 3.0, colorA: 0xfff3d6, colorB: 0xff9a4a, intensidad: 0.35 });
        this.llamaDPS.position.y = 0.55;
        lm.descenso.add(this.llamaDPS);
        this.llamaAPS = crearLlama({ radio: 0.3, largo: 2.2, colorA: 0xfff3d6, colorB: 0xff9a4a, intensidad: 0.5 });
        this.llamaAPS.position.y = 2.35;
        lm.ascenso.add(this.llamaAPS);
        this._construirEquipo();
        // Dirección real del Sol y de la Tierra en el alunizaje (SPICE)
        try {
            const sky = await getSky('1969-07-20T20:17:40');
            this.dirSol.fromArray(sky.sun.three).normalize();
            this.dirTierra.fromArray(sky.earth.three).normalize();
            this._colocarTierra();
            this.skySpice = true;
        } catch { this.skySpice = false; }
        try { this.sitio = await getSite('apollo11'); } catch { this.sitio = null; }
    }

    // Bandera, sismómetro pasivo (EASEP) y retrorreflector (LRRR), en la posición aproximada respecto al LM
    _construirEquipo() {
        const eq = new THREE.Group();
        const blanco = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.6 });
        const oro = new THREE.MeshStandardMaterial({ color: 0xc8a84a, metalness: 0.6, roughness: 0.35 });
        const panel = new THREE.MeshStandardMaterial({ color: 0x1b2440, metalness: 0.4, roughness: 0.4 });
        // Bandera
        const c = document.createElement('canvas'); c.width = 190; c.height = 100;
        const g = c.getContext('2d');
        for (let i = 0; i < 13; i++) { g.fillStyle = i % 2 ? '#fff' : '#b22234'; g.fillRect(0, (i * 100) / 13, 190, 100 / 13 + 0.5); }
        g.fillStyle = '#3c3b6e'; g.fillRect(0, 0, 76, 54);
        g.fillStyle = '#fff'; for (let i = 0; i < 30; i++) g.fillRect(5 + (i % 6) * 12, 4 + Math.floor(i / 6) * 10, 3, 3);
        const tb = new THREE.CanvasTexture(c); tb.colorSpace = THREE.SRGBColorSpace;
        this.bandera = new THREE.Group();
        const asta = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.4), blanco);
        asta.position.y = 1.2;
        const tela = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.8), new THREE.MeshStandardMaterial({ map: tb, side: THREE.DoubleSide }));
        tela.position.set(0.75, 1.95, 0);
        this.bandera.add(asta, tela);
        this.bandera.position.set(-6, 0, -8);
        // EASEP: caja con dos paneles solares
        const easep = new THREE.Group();
        const caja = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.45, 0.5), oro);
        caja.position.y = 0.25;
        for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.03, 0.6), panel); p.position.set(s * 0.8, 0.35, 0); easep.add(p); }
        easep.add(caja);
        easep.position.set(-16, 0, 9);
        // LRRR: panel inclinado de retrorreflectores
        const lrrr = new THREE.Group();
        const placa = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.05, 0.46), new THREE.MeshStandardMaterial({ color: 0x8899aa, metalness: 0.9, roughness: 0.15 }));
        placa.rotation.z = 0.35; placa.position.y = 0.45;
        const pata = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.45), blanco); pata.position.y = 0.22;
        lrrr.add(placa, pata);
        lrrr.position.set(-15, 0, 4);
        for (const o of [this.bandera, easep, lrrr]) { o.traverse((m) => { if (m.isMesh) m.castShadow = true; }); o.position.y = this.altura(o.position.x, o.position.z); }
        eq.add(this.bandera, easep, lrrr);
        eq.visible = false;
        this.equipo = eq;
        this.scene.add(eq);
    }

    // ───────── ciclo de vida ─────────
    entrar(t) {
        const ev = this.ctx.crono.ev;
        this.polvo.vaciar();
        this.epilogoMostrado = false;
        this.cam = 'auto';
        this.controls.interactuo = false;
        if (t >= ev.alunizaje - 0.5) this._estadoHistorico();
        else this.iniciar('P64');
    }

    salir() { this.ctx.hud.aviso(null); this._tactil(false); this.ctx.hud.el.lm.classList.add('oculto'); }

    _tactil(v) { this.ctx.input.mostrarTactil(v); }

    iniciar(desde = 'P64') {
        const { tray, datos, crono } = this.ctx;
        const p = tray.estadoP64();
        const m = datos.lm_p64;
        this.lm = createLM({ x: -p.rangoM, y: p.altM, vx: p.vx, vy: p.vy, angle: -0.6, dryMass: m.dryMass, fuel: m.fuel });
        this.tSim = 0;
        this.t0 = crono.ev.p64;
        this.modo = 'AUTO';
        this.objetivo = { x: 0, h: 30 };
        this.avisos = new Set();
        this.alarmaHasta = 0;
        this.contacto = false;
        this.maquina.reset();
        this.resultado = null;
        this.tAlunizaje = null;
        this.ctx.hud.el.epilogo.classList.add('oculto');
        if (desde === 'P66') {
            const meta = crono.ev.p66 - crono.ev.p64;
            while (this.tSim < meta && this.lm.status === 'descending') this._paso(1 / 30, { rod: 0, tilt: 0, throttle: 0, rotate: 0 }, true);
            this.cambiarModo('P66');
        }
        this.ctx.hud.el.lm.classList.remove('oculto');
        this._tactil(true);
        this.ctx.hud.registrar(`[${formatearMET(this.t0 + this.tSim)}] ${tr('Eagle a {h} m de altura y {d} m de Base Tranquilidad.', { h: (this.lm.y).toFixed(0), d: Math.abs(this.lm.x).toFixed(0) })}`, 'importante');
    }

    _estadoHistorico() {
        this.lm = createLM({ x: 0, y: this.suelo(0), vx: 0, vy: 0, angle: 0, dryMass: 6850, fuel: 350 });
        this.lm.status = 'landed';
        this.resultado = { ok: true, historico: true, dist: 0, comb: 45 };
        this.tAlunizaje = this.ctx.crono.ev.alunizaje;
        this.maquina.reset(); this.maquina.advance();
        this.ctx.hud.el.lm.classList.add('oculto');
        this._tactil(false);
    }

    // ¿La escena manda sobre el reloj? (mientras se pilota o tras un accidente)
    get relojPropio() { return !!this.lm && (this.lm.status === 'descending' || this.lm.status === 'crashed'); }

    cambiarModo(forzado) {
        if (!this.lm || this.lm.status !== 'descending') return this.modo;
        const nuevo = forzado ?? MODOS[(MODOS.indexOf(this.modo) + 1) % MODOS.length];
        if (nuevo === 'P66') this.vyCmd = Math.max(-5, Math.min(0.5, Math.round(this.lm.vy / 0.3) * 0.3));
        this.modo = nuevo;
        this.ctx.hud.aviso(null);
        this.ctx.hud.registrar(`[${formatearMET(this.t0 + this.tSim)}] ${tr('Modo de pilotaje')}: ${tr(nuevo === 'AUTO' ? 'automático (P64/P65)' : nuevo === 'P66' ? 'semimanual P66 (velocidad de descenso)' : 'directo (empuje y actitud)')}`);
        return nuevo;
    }

    cambiarCamara() {
        this.cam = { auto: 'cabina', cabina: 'suelo', suelo: 'auto' }[this.cam];
        this.controls.interactuo = false;
        return this.cam;
    }

    // Avanza la simulación; devuelve el tiempo de misión
    avanzarReloj(dtReal, reloj) {
        if (this.lm.status !== 'descending' || reloj.pausado) return this.t0 + this.tSim;
        const entrada = { ...(this.ctx.entrada ?? { rod: 0, tilt: 0, throttle: 0, rotate: 0 }) };
        let resto = Math.min(dtReal, 0.1);
        while (resto > 1e-6) { const h = Math.min(resto, 1 / 60); this._paso(h, entrada); entrada.rod = 0; resto -= h; }
        return this.t0 + this.tSim;
    }

    // Termina el descenso en automático (botón "siguiente evento")
    saltarAlAlunizaje() {
        if (!this.lm || this.lm.status !== 'descending') return;
        this.modo = 'AUTO';
        let n = 0;
        while (this.lm.status === 'descending' && n++ < 60 * 400) this._paso(1 / 60, { rod: 0, tilt: 0, throttle: 0, rotate: 0 }, true);
    }

    _paso(dt, e, silencioso = false) {
        const lm = this.lm, ev = this.ctx.crono.ev;
        let mando;
        if (this.modo === 'AUTO') mando = guiadoAuto(lm, this.objetivo, this.suelo);
        else if (this.modo === 'P66') {
            this.vyCmd = Math.max(-6, Math.min(1, this.vyCmd + 0.3 * e.rod));
            mando = guiadoP66(lm, this.vyCmd, e.tilt * 0.35, this.suelo);   // D: inclinar hacia delante
        } else mando = { throttle: e.throttle, rotate: e.rotate };
        step(lm, mando, dt, { easy: true, suelo: this.suelo, peligro: this.peligro });
        this.tSim += dt;
        if (!silencioso) this._eventosVuelo();
        if (lm.status !== 'descending') this._finDescenso();
    }

    _eventosVuelo() {
        const lm = this.lm, hud = this.ctx.hud, t = this.t0 + this.tSim, ev = this.ctx.crono.ev;
        const radar = lm.y - this.suelo(lm.x);
        const una = (id, f) => { if (!this.avisos.has(id)) { this.avisos.add(id); f(); } };
        for (const id of ['a1201', 'a1202c', 'a1202d']) if (t >= ev[id]) una(id, () => { this.alarmaHasta = this.tSim + 4; hud.banner(`${tr('ALARMA')} ${id === 'a1201' ? '1201' : '1202'}`, tr('Houston: "We\'re go on that alarm" — el computador descarta tareas y sigue guiando'), 3000); });
        if (t >= ev.p66 && this.modo === 'AUTO') una('p66', () => hud.aviso(tr('P66 · Pulsa M (botón A en Quest) para tomar el control como Armstrong y pasar de largo el campo de rocas')));
        if (t >= ev.p66 + 18) una('p66fin', () => hud.aviso(null));
        // cantos de altitud de Aldrin (en pies, como en la grabación original)
        const pies = radar * PIES;
        for (const h of [750, 600, 400, 300, 200, 100, 75, 40, 20]) {
            if (pies <= h) una(`alt${h}`, () => {
                const txt = `Aldrin: "${tr('{h} pies, bajando a {v}', { h, v: Math.abs(lm.vy * PIES).toFixed(0) })}${Math.abs(lm.vx) > 0.5 ? `, ${tr('{v} adelante', { v: Math.abs(lm.vx * PIES).toFixed(0) })}` : ''}"`;
                hud.registrar(`[${formatearMET(t)}] ${txt}`);
                hud.banner(txt, '', 2200);
            });
        }
        const s = segundosCombustible(lm);
        if (lm.fuel < 460) una('low', () => hud.registrar(`[${formatearMET(t)}] ${tr('Luz de combustible bajo (5,6 %)')}`, 'importante'));
        if (s < 80) una('60s', () => hud.banner(tr('"60 SEGUNDOS"'), tr('Charlie Duke (CAPCOM): quedan 60 s para el límite "bingo"'), 2500));
        if (s < 50) una('30s', () => hud.banner(tr('"30 SEGUNDOS"'), '', 2500));
        if (radar < SONDA_CONTACTO + 0.1) una('contacto', () => { this.contacto = true; hud.registrar(`[${formatearMET(t)}] Aldrin: "Contact light"`, 'importante'); });
    }

    _finDescenso() {
        const { hud, crono, reloj } = this.ctx;
        const lm = this.lm;
        const t = this.t0 + this.tSim;
        this.tAlunizaje = t;
        this.ctx.hud.aviso(null);
        if (lm.status === 'landed') {
            const dist = Math.abs(lm.x);
            const comb = segundosCombustible(lm);
            this.resultado = { ok: true, dist, comb, t };
            this.maquina.advance();
            sonido.reproducir('aterrizaje');
            sonido.reproducir('eagle', { retraso: 3.5 });   // "Houston, Tranquility Base here. The Eagle has landed."
            hud.banner('THE EAGLE HAS LANDED', `"Houston, Tranquility Base here." · ${tr('a {d} m de Base Tranquilidad · combustible: {c} s', { d: dist.toFixed(0), c: comb.toFixed(0) })}`, 9000);
            hud.registrar(`[${formatearMET(t)}] ${tr('ALUNIZAJE en {t} (histórico: {h}). Distancia a Base Tranquilidad: {d} m.', { t: formatearMET(t), h: formatearMET(crono.ev.alunizaje), d: dist.toFixed(0) })}`, 'importante');
            this._tactil(false);
            hud.el.lm.classList.add('oculto');
            // el reloj sigue el horario real a partir del alunizaje histórico
            reloj.saltarA(Math.max(t, crono.ev.alunizaje));
        } else {
            this.resultado = { ok: false, motivo: lm.motivo, t };
            hud.banner(tr('PÉRDIDA DEL VEHÍCULO'), lm.motivo, 8000);
            hud.registrar(`[${formatearMET(t)}] ${tr('Contacto fuera de límites')}: ${lm.motivo}`, 'abandonado');
            this._panelReintento();
        }
    }

    _panelReintento() {
        const el = this.ctx.hud.el.epilogo;
        el.innerHTML = '';
        const h = document.createElement('h2'); h.textContent = tr('Eagle no sobrevivió al contacto');
        const p = document.createElement('p'); p.textContent = `${tr('Motivo')}: ${this.lm.motivo}. ${tr('Límites del tren de aterrizaje: 3 m/s vertical, 1,2 m/s horizontal, 12° de inclinación.')}`;
        const b = document.createElement('div'); b.className = 'botones';
        const boton = (txt, f) => { const x = document.createElement('button'); x.textContent = txt; x.onclick = () => { el.classList.add('oculto'); f(); }; b.append(x); };
        boton(tr('Reintentar desde la P64'), () => this.iniciar('P64'));
        boton(tr('Reintentar desde la P66'), () => this.iniciar('P66'));
        boton(tr('Ver el alunizaje automático'), () => { this.iniciar('P64'); this.saltarAlAlunizaje(); });
        el.append(h, p, b);
        el.classList.remove('oculto');
    }

    _mostrarEpilogo() {
        const { datos } = this.ctx;
        const el = this.ctx.hud.el.epilogo;
        el.innerHTML = '';
        const add = (tag, txt, cls) => { const e = document.createElement(tag); e.textContent = txt; if (cls) e.className = cls; el.append(e); return e; };
        add('h2', tr('ABANDONADO, PERO NO OLVIDADO'));
        add('p', tr('21 de julio de 1969, 17:54 UTC: la etapa de ascenso de Eagle despega para reunirse con Columbia. La etapa de descenso sirvió de plataforma de lanzamiento y se queda en Base Tranquilidad.'));
        if (this.sitio?.story) add('p', `"${this.sitio.story}"`, 'historia');
        add('h4', tr('LO QUE SIGUE EN BASE TRANQUILIDAD'));
        const ul = add('ul', '');
        for (const h of this.sitio?.hardware ?? ['Etapa de descenso del LM', 'EASEP: sismómetro pasivo', 'Retrorreflector láser (LRRR)', 'Bandera y placa conmemorativa'].map((x) => tr(x))) {
            const li = document.createElement('li'); li.textContent = h; ul.append(li);
        }
        add('h4', tr('EL DESTINO DE CADA PIEZA'));
        const ul2 = add('ul', '');
        for (const a of datos.abandonados) { const li = document.createElement('li'); li.textContent = `${a.objeto}: ${a.destino}`; ul2.append(li); }
        if (this.resultado && !this.resultado.historico) {
            add('h4', tr('TU ALUNIZAJE'));
            add('p', this.resultado.ok ? tr('A {d} m de Base Tranquilidad con {c} s de combustible (Armstrong: ~45 s).', { d: this.resultado.dist.toFixed(0), c: this.resultado.comb.toFixed(0) }) : '—');
        }
        add('p', tr('Hoy ({anio}), {n} años después, la etapa de descenso sigue allí y el retrorreflector todavía devuelve los pulsos láser que se disparan desde la Tierra.', { anio: new Date().getFullYear(), n: new Date().getFullYear() - 1969 }));
        const b = add('div', ''); b.className = 'botones';
        const boton = (txt, f) => { const x = document.createElement('button'); x.textContent = txt; x.onclick = () => { el.classList.add('oculto'); f(); }; b.append(x); };
        boton(tr('Repetir el alunizaje'), () => { this.ctx.reloj.saltarA(this.ctx.crono.ev.p64); this.iniciar('P64'); });
        boton(tr('Volver al inicio'), () => this.ctx.reiniciar());
        boton(tr('Seguir mirando'), () => {});
        el.classList.remove('oculto');
    }

    // ───────── cuadro a cuadro ─────────
    actualizar(t, dtReal, dtSim, tiempoReal) {
        const lm = this.lm, ev = this.ctx.crono.ev, hud = this.ctx.hud;
        if (!lm) return;
        const radar = lm.y - this.suelo(lm.x);
        const X = -lm.x;
        // Etapa de ascenso: despega en 124:22:00 (la de descenso se queda)
        const tAsc = t - ev.despegueLunar;
        const asc = this.lmObj.ascenso;
        if (lm.status === 'landed' && tAsc > 0) {
            const h = 0.5 * 2.2 * tAsc * tAsc / LM_M;
            asc.position.set(0, h, 0);
            asc.rotation.x = -Math.min(0.9, tAsc * 0.02);
            if (this.maquina.phase === 'landed') this.maquina.advance();
            if (tAsc > 25 && this.maquina.phase === 'ascent') this.maquina.advance();
            this.bandera.rotation.x = -Math.min(1.45, Math.max(0, (tAsc - 0.4) * 6));   // Aldrin vio caer la bandera
        } else { asc.position.set(0, 0, 0); asc.rotation.x = 0; this.bandera.rotation.x = 0; }
        asc.visible = !(lm.status === 'landed' && tAsc > 60);
        animarLlama(this.llamaAPS, tiempoReal, lm.status === 'landed' && tAsc > 0 && tAsc < 45);
        this.equipo.visible = lm.status === 'landed' && t > ev.paso + 1800;
        this.equipo.position.set(X, this.altura(X, 0) - this.altura(0, 0), 0);
        if (lm.status === 'landed' && tAsc > 70 && !this.epilogoMostrado) {
            this.epilogoMostrado = true;
            // al terminar: la misión pasa al explorador de restos (órbita y superficie); si no, el epílogo clásico
            if (this.ctx.alTerminar) this.ctx.alTerminar(); else this._mostrarEpilogo();
        }

        // LM
        this.lm3d.position.set(X, lm.y, 0);
        this.lm3d.rotation.set(0, -Math.PI / 2, lm.status === 'crashed' ? 0.5 : lm.angle, 'ZYX');
        const encendido = lm.status === 'descending' && lm.throttle > 0.01;
        animarLlama(this.llamaDPS, tiempoReal, encendido, 0.5 + lm.throttle);

        // Polvo levantado por el motor (sale casi rasante: en el vacío no hay nubes)
        if (encendido && radar < 45 && dtReal > 0) {
            const f = lm.throttle * (1 - radar / 45);
            const n = Math.round(60 * f);
            for (let i = 0; i < n; i++) {
                const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * (4 + radar * 0.3);
                const x = X + Math.cos(a) * r, z = Math.sin(a) * r;
                const v = 25 + Math.random() * 45;
                this.polvo.emitir(x, this.altura(x, z) + 0.3, z, Math.cos(a) * v, 0.3 + Math.random(), Math.sin(a) * v);
            }
        }
        this.polvo.actualizar(dtReal);

        // Luz y sombras siguiendo al LM
        this.sol.position.set(X, lm.y, 0).addScaledVector(this.dirSol, 500);
        this.sol.target.position.set(X, lm.y, 0);

        // HUD del LM
        if (lm.status === 'descending' || lm.status === 'crashed') {
            const $ = (id) => document.getElementById(id);
            $('lm-alt').textContent = radar.toFixed(radar < 100 ? 1 : 0);
            $('lm-vv').textContent = lm.vy.toFixed(1);
            $('lm-vh').textContent = lm.vx.toFixed(1);
            $('lm-fuel').textContent = lm.fuel.toFixed(0);
            $('lm-fuel-s').textContent = `${segundosCombustible(lm).toFixed(0)} s`;
            $('lm-dist').textContent = Math.abs(lm.x).toFixed(0);
            $('lm-modo').textContent = this.modo;
            $('lm-rod').textContent = this.modo === 'P66' ? `${this.vyCmd.toFixed(1)}` : '';
            $('luz-alarma').classList.toggle('on', this.tSim < this.alarmaHasta && Math.floor(tiempoReal * 3) % 2 === 0);
            $('luz-comb').classList.toggle('on', lm.fuel < 460);
            $('luz-contacto').classList.toggle('on', radar < SONDA_CONTACTO + 0.1);
        }
        this.infoVR = lm.status === 'descending' ? { alt: radar, vv: lm.vy, vh: lm.vx, fuelS: segundosCombustible(lm), modo: this.modo, rod: this.modo === 'P66' ? `ROD ${this.vyCmd.toFixed(1)}` : '', dist: Math.abs(lm.x) } : null;
        this._camara(t, X, lm, radar);
    }

    _camara(t, X, lm, radar) {
        const { renderer } = this.ctx;
        const lmPos = new THREE.Vector3(X, lm.y + 3.5, 0);
        const cabina = new THREE.Vector3(X - 2.4, lm.y + 5.2, 0.7);   // ventana izquierda (Armstrong)
        if (renderer.xr.isPresenting && (this.cam === 'suelo' || (this.cam === 'auto' && this.controls.interactuo))) {
            // en VR con el stick derecho: girar alrededor del LM y acercar/alejar (o la cámara fija en el suelo)
            const ojo = this.cam === 'suelo' ? new THREE.Vector3(-25, this.altura(-25, 30) + 1.7, 30) : this.controls.leer().add(lmPos);
            const hs = this.altura(ojo.x, ojo.z) + 1.5;
            if (ojo.y < hs) ojo.y = hs;
            this.rig.position.copy(ojo).y -= 1.6;
            this.rig.rotation.set(0, Math.atan2(-(lmPos.x - ojo.x), -(lmPos.z - ojo.z)), 0);
            return;
        }
        if (renderer.xr.isPresenting) {
            // en VR: en la cabina de Eagle mirando hacia delante (solo guiñada, el horizonte no se inclina)
            const enSuelo = lm.status === 'landed' && t > this.ctx.crono.ev.despegueLunar - 5;
            this.rig.position.copy(enSuelo ? new THREE.Vector3(X + 22, this.altura(X + 22, 18) + 1.7, 18) : cabina.clone().setY(cabina.y - 1.6));
            this.rig.rotation.set(0, enSuelo ? Math.atan2(22, 18) : Math.PI / 2, 0);
            return;
        }
        this.rig.position.set(0, 0, 0); this.rig.rotation.set(0, 0, 0);
        let pos, mira = lmPos;
        const tAsc = t - this.ctx.crono.ev.despegueLunar;
        if (lm.status === 'landed' && tAsc > -8 && tAsc < 40 && this.cam === 'auto' && !this.controls.interactuo) {
            // despegue de la etapa de ascenso: cámara fija en el suelo, siguiéndola
            pos = new THREE.Vector3(X + 55, this.altura(X + 55, 45) + 4, 45);
            mira = this.lmObj.ascenso.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 3, 0));
            this.camera.fov = 50;
        } else if (this.cam === 'cabina') {
            pos = cabina;
            mira = new THREE.Vector3(X - 60, lm.y - 28, 4);
            this.camera.fov = 70;
        } else if (this.cam === 'suelo') {
            pos = new THREE.Vector3(-25, this.altura(-25, 30) + 1.7, 30);
            this.camera.fov = Math.max(12, Math.min(60, 6000 / Math.max(1, lmPos.distanceTo(pos))));
        } else {
            if (!this.controls.interactuo) {
                const lejos = Math.min(1, radar / 1500);
                this.controls.fijar(new THREE.Vector3(24 + 36 * lejos, 6 + 16 * lejos, 20 + 20 * lejos));
                this.controls.interactuo = false;
            }
            pos = this.controls.leer().add(lmPos);
            const hs = this.altura(pos.x, pos.z) + 1.5;
            if (pos.y < hs) pos.y = hs;
            this.camera.fov = 55;
        }
        this.camera.updateProjectionMatrix();
        this.camera.position.copy(pos);
        this.camera.up.set(0, 1, 0);
        this.camera.lookAt(mira);
        this.estrellas.position.copy(pos);
    }

    antesDeRender() {}
}
