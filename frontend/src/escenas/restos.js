// "Lo que quedó allí": explorador de restos en la Luna o en Marte.
//
//  Nivel ÓRBITA: el planeta (radio R) con las naves abandonadas (y las activas, como referencia) en sus
//  órbitas reales —altitud comprimida en escala logarítmica, orientación ilustrativa— y los sitios de
//  aterrizaje en su latitud/longitud. Rueda/pellizco para acercarse; al bajar cerca de un sitio marcado,
//  se pasa al nivel SUPERFICIE.
//  Nivel SUPERFICIE: un plano del terreno (en metros) con los objetos que se quedaron allí. Alejándose
//  del todo se vuelve a la órbita.
//
// Convención de coordenadas (igual que las texturas de la Luna en Three.js): longitud 0 en +X,
// el este hacia -Z, el norte +Y. En la superficie: X este, Z sur, Y arriba.
import * as THREE from 'three';
import { Orbita } from '../core/orbita.js';
import { crearEstrellas, crearEtiqueta, crearMarcador, texturaMarte } from '../modelos/efectos.js';
import { crearModelo, crearModeloReal, precargarReales } from '../modelos/restos.js';
import DATOS from '../data/restos.json';

const R = 10;
const RAD = Math.PI / 180;
const COLOR = { abandonada: 0xffa23a, incierta: 0xff5c8a, activa: 0x58c46a, sitio: 0x4af626, mision: 0xffd23a, info: 0xb8c4c8 };
const CSS = (c) => `#${c.toString(16).padStart(6, '0')}`;
const sm = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };

export function dirLatLon(lat, lon, out = new THREE.Vector3()) {
    const la = lat * RAD, lo = lon * RAD;
    return out.set(Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo));
}
// altitud real (km) -> radio en la escena (comprimido: 100 km ≈ 1,1 R; 77 000 km ≈ 1,7 R)
export const radioVisual = (altKm) => R * (1 + 0.22 * Math.log10(1 + Math.max(0, altKm) / 40));

function kepler(M, e) {
    let E = e < 0.8 ? M : Math.PI;
    for (let i = 0; i < 12; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    return E;
}

export class EscenaRestos {
    // ctx: { renderer, hud, cuerpo: 'luna'|'marte', sitio: id del sitio de la misión, lunaModelo?, lmDescenso? }
    constructor(ctx) {
        this.ctx = ctx;
        this.id = 'restos';
        this.cuerpo = ctx.cuerpo;
        this.d = DATOS[ctx.cuerpo];
        const { renderer } = ctx;
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(50, 1, 0.05, 20000);
        this.rig = new THREE.Group();
        this.rig.add(this.camera);
        this.scene.add(this.rig);
        this.controls = new Orbita(renderer.domElement);
        this.nivel = 'orbita';
        this.sitioActual = null;
        this.foco = new THREE.Vector3();
        this.focoObjetivo = new THREE.Vector3();
        this.seleccion = null;
        this.tAnim = 0;
        this.enTransicion = false;
        this.alCambiar = null;   // callback (nivel, sitio) -> el panel lo usa
        this.alSeleccionar = null;

        this.gOrbita = new THREE.Group();
        this.gSuperficie = new THREE.Group();
        this.scene.add(this.gOrbita, this.gSuperficie);
        this._construirOrbita();
        this._clics(renderer.domElement);
    }

    // ───────────────────────── nivel órbita ─────────────────────────
    _construirOrbita() {
        const g = this.gOrbita;
        this.estrellasOrb = crearEstrellas(5000, 8000);
        g.add(this.estrellasOrb);
        g.add(new THREE.AmbientLight(0x505868, this.cuerpo === 'luna' ? 0.35 : 0.6));
        // el Sol ilumina el sitio de la misión (desde un lado, para que se vea el relieve)
        const sm0 = this.d.sitios.find((x) => x.id === this.ctx.sitio) ?? this.d.sitios[0];
        const sol = new THREE.DirectionalLight(0xffffff, 3.2);
        sol.position.copy(dirLatLon(sm0.lat, sm0.lon)).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.9).setY(0.3).normalize().multiplyScalar(80);
        g.add(sol);

        // planeta
        if (this.cuerpo === 'luna' && this.ctx.lunaModelo) {
            const l = this.ctx.lunaModelo.clone(true);
            l.position.set(0, 0, 0); l.rotation.set(0, 0, 0); l.scale.set(1, 1, 1);
            const caja = new THREE.Box3().setFromObject(l);
            l.scale.setScalar(R / (caja.getSize(new THREE.Vector3()).x / 2));
            this.planeta = l;
        } else {
            let mapa;
            if (this.cuerpo === 'luna') {
                mapa = new THREE.TextureLoader().load('/texturas/moon_1024.jpg');
                mapa.colorSpace = THREE.SRGBColorSpace;
            } else mapa = texturaMarte();
            this.planeta = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 48), new THREE.MeshStandardMaterial({ map: mapa, roughness: 1 }));
        }
        g.add(this.planeta);
        if (this.cuerpo === 'marte') {   // atmósfera tenue
            const atm = new THREE.Mesh(new THREE.SphereGeometry(R * 1.015, 64, 32), new THREE.MeshBasicMaterial({ color: 0xff9a6a, transparent: true, opacity: 0.08, depthWrite: false }));
            g.add(atm);
        }

        // objetos en órbita
        this.objetosOrb = [];
        this.pick = [];
        const Rkm = this.d.radio_km, mu = this.d.mu;
        for (const o of this.d.orbita) {
            const a = Rkm + (o.peri_km + o.apo_km) / 2, e = (o.apo_km - o.peri_km) / (o.apo_km + o.peri_km + 2 * Rkm);
            const m = new THREE.Matrix4().makeRotationY(o.raan * RAD).multiply(new THREE.Matrix4().makeRotationX(o.inc * RAD));
            const arg = (o.raan * 1.7) * RAD;   // argumento del periapsis (ilustrativo)
            const posEn = (E, out) => {
                const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
                const rkm = a * (1 - e * Math.cos(E));
                const rv = radioVisual(rkm - Rkm);
                return out.set(rv * Math.cos(nu + arg), 0, -rv * Math.sin(nu + arg)).applyMatrix4(m);
            };
            const pts = [];
            for (let i = 0; i <= 256; i++) pts.push(posEn((i / 256) * Math.PI * 2, new THREE.Vector3()));
            const geo = new THREE.BufferGeometry().setFromPoints(pts);
            const color = COLOR[o.estado];
            const linea = o.estado === 'incierta'
                ? new THREE.Line(geo, new THREE.LineDashedMaterial({ color, dashSize: 0.35, gapSize: 0.25, transparent: true, opacity: 0.8 }))
                : new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: o.estado === 'activa' ? 0.35 : 0.8 }));
            if (o.estado === 'incierta') linea.computeLineDistances();
            g.add(linea);
            const nave = new THREE.Group();
            const modelo = crearModelo(o.modelo);
            const t = new THREE.Box3().setFromObject(modelo).getSize(new THREE.Vector3()).length();
            modelo.scale.setScalar(0.32 / t);   // tamaño visible (muy exagerado)
            const brillo = crearMarcador(color); brillo.scale.setScalar(o.estado === 'activa' ? 0.5 : 0.9);
            const et = crearEtiqueta(o.nombre.split(' (')[0], { color: CSS(color), tam: 26 });
            et.position.y = 0.4;
            et.scale.multiplyScalar(0.48);
            const proxy = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
            proxy.userData.info = { ...o, clase: 'orbita' };
            nave.add(modelo, brillo, et, proxy);
            g.add(nave);
            this.pick.push(proxy);
            // período real -> animación (1 s en pantalla = 10 min)
            const n = Math.sqrt(mu / (a * a * a));
            this.objetosOrb.push({ o, nave, modelo, brillo, et, linea, posEn, n, M0: (o.raan * 3.1) % (Math.PI * 2) });
        }

        // sitios en la superficie
        this.marcas = [];
        for (const s of this.d.sitios) {
            const dir = dirLatLon(s.lat, s.lon);
            const esMision = s.id === this.ctx.sitio;
            const color = esMision ? COLOR.mision : s.superficie ? COLOR.sitio : s.activo ? COLOR.activa : COLOR.info;
            const marca = new THREE.Group();
            const alto = s.superficie ? 0.55 : 0.3;
            const pin = new THREE.Mesh(new THREE.ConeGeometry(0.06, alto, 8), new THREE.MeshBasicMaterial({ color }));
            pin.position.y = alto / 2;
            pin.rotation.x = Math.PI;
            pin.position.y = alto / 2;
            const anillo = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.16, 20), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }));
            anillo.rotation.x = -Math.PI / 2; anillo.position.y = 0.01;
            const et = crearEtiqueta(s.nombre.split(' · ').pop(), { color: CSS(color), tam: s.superficie ? 26 : 22 });
            et.position.y = alto + 0.2;
            et.scale.multiplyScalar(s.superficie ? 0.5 : 0.42);
            const proxy = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
            proxy.position.y = alto / 2;
            proxy.userData.info = { ...s, clase: 'sitio' };
            marca.add(pin, anillo, et, proxy);
            marca.position.copy(dir).multiplyScalar(R * 1.002);
            marca.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
            g.add(marca);
            this.pick.push(proxy);
            this.marcas.push({ s, marca, dir, et, pin });
        }

        // Llegada (Marte): la cápsula baja al sitio y la etapa de crucero se separa y se desintegra
        this.llegada = null;
        const sMision = this.d.sitios.find((s) => s.id === this.ctx.sitio);
        if (this.cuerpo === 'marte' && sMision) {
            const fin = dirLatLon(sMision.lat, sMision.lon).multiplyScalar(R);
            const tang = new THREE.Vector3(0, 1, 0).cross(fin).normalize();
            const ini = fin.clone().multiplyScalar(5).addScaledVector(tang, 30);
            const ctrl = fin.clone().multiplyScalar(1.6).addScaledVector(tang, 6);
            const curva = new THREE.QuadraticBezierCurve3(ini, ctrl, fin.clone().multiplyScalar(1.004));
            const desvio = fin.clone().normalize().cross(tang).multiplyScalar(0.9);
            const curvaCrucero = new THREE.QuadraticBezierCurve3(curva.getPoint(0.82), ctrl.clone().add(desvio).lerp(fin, 0.6), fin.clone().multiplyScalar(1.012).add(desvio.clone().multiplyScalar(0.7)));
            const lin = (c, color, op) => {
                const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(c.getPoints(120)), new THREE.LineDashedMaterial({ color, dashSize: 0.3, gapSize: 0.2, transparent: true, opacity: op }));
                l.computeLineDistances(); g.add(l); return l;
            };
            const capsula = crearMarcador(0xffffff); capsula.scale.setScalar(0.7);
            const crucero = crearMarcador(0xff6a2a); crucero.scale.setScalar(0.6);
            const etC = crearEtiqueta('ETAPA DE CRUCERO', { color: '#ff8a5c', tam: 22 });
            etC.scale.multiplyScalar(0.42);
            const proxyC = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
            proxyC.userData.info = { clase: 'transporte', nombre: 'Etapa de crucero', estado: 'destruida', texto: this.d.transporte.crucero };
            proxyC.position.copy(curvaCrucero.getPoint(1));
            etC.position.copy(curvaCrucero.getPoint(1)).multiplyScalar(1.07);
            g.add(capsula, crucero, etC, proxyC);
            this.pick.push(proxyC);
            this.llegada = { curva, curvaCrucero, capsula, crucero, etC, lCap: lin(curva, 0xffffff, 0.35), lCru: lin(curvaCrucero, 0xff6a2a, 0.55) };
        }
    }

    // ───────────────────────── nivel superficie ─────────────────────────
    altura(x, z) {
        let h = 0;
        for (const c of this.crateres) {
            const dx = x - c.x, dz = z - c.z;
            if (Math.abs(dx) > c.r * 1.8 || Math.abs(dz) > c.r * 1.8) continue;
            const p = Math.hypot(dx, dz) / c.r;
            if (p < 1) h -= c.d * (1 - p * p);
            h += c.d * 0.22 * Math.exp(-(((p - 1) / 0.28) ** 2));
        }
        const k = this.cuerpo === 'marte' ? 1.6 : 0.6;
        return h + k * Math.sin(x * 0.011 + Math.sin(z * 0.007) * 2) * Math.sin(z * 0.013 + Math.sin(x * 0.009) * 2)
            + 0.15 * Math.sin(x * 0.07 + z * 0.05) * Math.cos(z * 0.09);
    }

    async _construirSuperficie(sitio) {
        const g = this.gSuperficie;
        g.traverse((o) => { if (o.isMesh) { o.geometry.dispose?.(); } });
        g.clear();
        const marte = this.cuerpo === 'marte';
        // cráteres: los del sitio + otros al azar (semilla por sitio)
        let a = [...sitio.id].reduce((s, c) => s * 31 + c.charCodeAt(0), 7) % 2147483647 || 7;
        const rnd = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
        this.crateres = [];
        for (const o of sitio.objetos) if (o.crater) this.crateres.push({ x: o.x, z: o.z, ...o.crater });
        for (let i = 0; i < (marte ? 60 : 220); i++) {
            const x = (rnd() - 0.5) * 1800, z = (rnd() - 0.5) * 1800, r = 3 + Math.pow(rnd(), 3) * (marte ? 60 : 90);
            if (sitio.objetos.some((o) => Math.hypot(x - o.x, z - o.z) < r + 12)) continue;
            this.crateres.push({ x, z, r, d: r * (0.12 + rnd() * 0.08) });
        }
        // textura del suelo
        const c = document.createElement('canvas'); c.width = c.height = 512;
        const x2 = c.getContext('2d');
        const base = marte ? [178, 112, 72] : [134, 131, 125];
        x2.fillStyle = `rgb(${base})`; x2.fillRect(0, 0, 512, 512);
        for (let i = 0; i < 9000; i++) {
            const v = (rnd() - 0.5) * 50;
            x2.fillStyle = `rgb(${base[0] + v},${base[1] + v * 0.8},${base[2] + v * 0.6})`;
            x2.fillRect(rnd() * 512, rnd() * 512, 1 + rnd() * 3, 1 + rnd() * 3);
        }
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.anisotropy = this.ctx.renderer.capabilities.getMaxAnisotropy();
        // malla con más detalle cerca del centro
        const coords = (min, max) => { const v = [min]; while (v[v.length - 1] < max) { const x = v[v.length - 1]; v.push(x + (Math.abs(x) < 70 ? 1.5 : Math.abs(x) < 400 ? 6 : 25)); } return v; };
        const xs = coords(-1500, 1500), zs = xs;
        const nx = xs.length, nz = zs.length;
        const pos = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2), idx = [];
        for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
            const k = j * nx + i, x = xs[i], z = zs[j];
            pos.set([x, this.altura(x, z), z], k * 3); uv.set([x / 30, z / 30], k * 2);
            if (i < nx - 1 && j < nz - 1) idx.push(k, k + nx, k + 1, k + 1, k + nx, k + nx + 1);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        geo.setIndex(idx); geo.computeVertexNormals();
        const suelo = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
        suelo.receiveShadow = true;
        g.add(suelo);
        // rocas
        const n = marte ? 1400 : 600;
        const inst = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: marte ? 0x6e4a36 : 0x6e6b66, roughness: 1, flatShading: true }), n);
        inst.castShadow = inst.receiveShadow = true;
        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
        for (let i = 0; i < n; i++) {
            const r = Math.pow(rnd(), 1.6) * 600, ang = rnd() * Math.PI * 2;
            const x = Math.cos(ang) * r + 6, z = Math.sin(ang) * r + 6;
            const tam = 0.05 + Math.pow(rnd(), 5) * (marte ? 0.7 : 0.6) * (r < 40 ? 0.5 : 1);
            if (sitio.objetos.some((o) => Math.hypot(x - o.x, z - o.z) < 4)) { inst.setMatrixAt(i, m.makeScale(0, 0, 0)); continue; }
            q.setFromEuler(new THREE.Euler(rnd() * 3, rnd() * 3, rnd() * 3));
            s.set(tam, tam * (0.5 + rnd() * 0.4), tam * (0.7 + rnd() * 0.5));
            p.set(x, this.altura(x, z) + tam * 0.2, z);
            inst.setMatrixAt(i, m.compose(p, q, s));
        }
        g.add(inst);

        // cielo y luz
        const latR = sitio.lat * RAD, lonR = sitio.lon * RAD;
        if (marte) {
            const cielo = new THREE.Mesh(new THREE.SphereGeometry(6000, 32, 16), new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true, fog: false, depthWrite: false }));
            const cp = cielo.geometry.attributes.position, col = new Float32Array(cp.count * 3);
            const hz = new THREE.Color(0xd9b08a), ze = new THREE.Color(0x7a5a4a), tmp = new THREE.Color();
            for (let i = 0; i < cp.count; i++) { tmp.copy(hz).lerp(ze, Math.max(0, cp.getY(i) / 6000) ** 0.6); col.set([tmp.r, tmp.g, tmp.b], i * 3); }
            cielo.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
            cielo.renderOrder = -20;
            g.add(cielo);
            this.scene.fog = new THREE.Fog(0xc9a07c, 250, 2200);
            this.scene.background = new THREE.Color(0xc9a07c);
        } else {
            this.scene.fog = null;
            this.scene.background = new THREE.Color(0x000000);
            const est = crearEstrellas(3000, 8000, true);
            g.add(est);
            this.estrellasSup = est;
            // la Tierra está fija en el cielo lunar: dirección local hacia el punto subterrestre (0°, 0°)
            const E = -Math.sin(lonR), N = -Math.sin(latR) * Math.cos(lonR), U = Math.cos(latR) * Math.cos(lonR);
            if (U > -0.02) {
                const t = new THREE.TextureLoader().load('/texturas/earth_atmos_2048.jpg'); t.colorSpace = THREE.SRGBColorSpace;
                const tierra = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 }));
                const dTierra = new THREE.Vector3(E, U, -N).normalize();
                tierra.position.copy(dTierra).multiplyScalar(7000);
                tierra.scale.setScalar(7000 * Math.tan(0.95 * RAD));
                g.add(tierra);
            }
        }
        const sol = new THREE.DirectionalLight(marte ? 0xfff1e0 : 0xffffff, marte ? 2.6 : 3.4);
        sol.castShadow = true;
        sol.shadow.mapSize.set(2048, 2048);
        Object.assign(sol.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 800 });
        sol.shadow.bias = -0.0004;
        this.dirSol = new THREE.Vector3(0.75, marte ? 0.55 : 0.32, 0.35).normalize();
        g.add(sol, sol.target, new THREE.AmbientLight(marte ? 0x8a6450 : 0x404650, marte ? 0.9 : 0.35));
        if (marte) g.add(new THREE.HemisphereLight(0xd9b08a, 0x5a3a2a, 0.6));
        this.sol = sol;

        // objetos
        this.objetosSup = [];
        this.pickSup = [];
        if (this.cuerpo === 'luna' && this.ctx.lmDescenso === undefined && this.ctx.cargarLM) {
            try { this.ctx.lmDescenso = await this.ctx.cargarLM(); } catch { this.ctx.lmDescenso = null; }
        }
        const etiquetas = [];
        await precargarReales(sitio.objetos.map((o) => o.tipo));
        for (const o of sitio.objetos) {
            let modelo;
            if (o.tipo === 'lm_descenso' && this.ctx.lmDescenso) modelo = this.ctx.lmDescenso.clone(true);
            else modelo = await crearModeloReal(o.tipo, o.opciones);
            const grupo = new THREE.Group();
            grupo.add(modelo);
            grupo.position.set(o.x, this.altura(o.x, o.z), o.z);
            grupo.rotation.y = o.rot ?? 0;
            const caja = new THREE.Box3().setFromObject(grupo);
            const alto = Math.max(1.2, caja.max.y - grupo.position.y);
            const txt = o.distancia ? `${o.nombre} · ${o.distancia}` : o.nombre;
            // escalonar las etiquetas de objetos cercanos para que no se pisen
            let extra = 0;
            for (const e of etiquetas) if (Math.hypot(e.x - o.x, e.z - o.z) < 8 && Math.abs(e.y - (grupo.position.y + alto + extra)) < 0.9) extra = e.y - grupo.position.y - alto + 0.9;
            etiquetas.push({ x: o.x, z: o.z, y: grupo.position.y + alto + extra });
            const et = crearEtiqueta(txt, { color: o.distancia ? '#ffd23a' : '#ffffff', tam: 24 });
            et.position.set(o.x, grupo.position.y + alto + extra + 1.2, o.z);
            et.scale.multiplyScalar(0.62);
            const poste = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(o.x, grupo.position.y + alto + 0.1, o.z), new THREE.Vector3(o.x, grupo.position.y + alto + extra + 1.0, o.z)]), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }));
            const tam = Math.max(0.6, caja.getSize(new THREE.Vector3()).length());
            const proxy = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.8, tam * 0.6), 8, 6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
            proxy.position.copy(caja.getCenter(new THREE.Vector3()));
            proxy.userData.info = { ...o, clase: 'objeto', tam, centro: proxy.position.clone() };
            g.add(grupo, et, poste, proxy);
            this.pickSup.push(proxy);
            this.objetosSup.push({ o, grupo, et, tam });
        }
    }

    // ───────────────────────── ciclo de vida ─────────────────────────
    entrar() {
        this.activo = true;
        this.nivel = 'orbita';
        this.gOrbita.visible = true;
        this.gSuperficie.visible = false;
        this.scene.fog = null;
        this.scene.background = new THREE.Color(0x000000);
        this.controls.minR = R * 1.12; this.controls.maxR = R * 14;
        this.controls.minEl = -1.45;
        // intro: desde lejos hasta la órbita, girando hacia el sitio de la misión
        const s = this.d.sitios.find((x) => x.id === this.ctx.sitio) ?? this.d.sitios[0];
        const d = dirLatLon(s.lat, s.lon);
        this.intro = { t: 0, dur: this.llegada ? 9 : 6, az0: Math.atan2(d.x, d.z) + 1.4, az1: Math.atan2(d.x, d.z) + 0.25, el0: 0.6, el1: Math.asin(d.y) + 0.2, r0: R * 12, r1: R * 4.2 };
        this.controls.r = this.intro.r0; this.controls.az = this.intro.az0; this.controls.el = this.intro.el0;
        this.controls.interactuo = false;
        this.foco.set(0, 0, 0); this.focoObjetivo.set(0, 0, 0);
        this.alCambiar?.('orbita', null);
    }

    salir() { this.activo = false; }

    // Baja a la superficie de un sitio (con acercamiento y fundido)
    bajar(sitio) {
        if (!sitio?.superficie || this.enTransicion) return;
        const d = dirLatLon(sitio.lat, sitio.lon);
        this.enTransicion = true;
        this.zoomA = { t: 0, dur: 1.4, az0: this.controls.az, el0: this.controls.el, r0: this.controls.r, az1: Math.atan2(d.x, d.z), el1: Math.asin(d.y), r1: R * 1.13, al: async () => {
            await this._fundido(async () => {
                await this._construirSuperficie(sitio);
                this.sitioActual = sitio;
                this.nivel = 'superficie';
                this.gOrbita.visible = false;
                this.gSuperficie.visible = true;
                this.controls.minR = 3; this.controls.maxR = 900; this.controls.minEl = 0.03;
                this.controls.r = 26; this.controls.el = 0.32; this.controls.az = 0.9; this.controls.interactuo = false;
                const p = sitio.objetos[0];
                const tam = this.objetosSup[0]?.tam ?? 8;   // el encuadre inicial depende del tamaño del objeto principal
                this.controls.r = Math.min(26, Math.max(4, tam * 3.2));
                this.foco.set(p.x, this.altura(p.x, p.z) + Math.min(2, tam * 0.25), p.z); this.focoObjetivo.copy(this.foco);
                this.seleccion = null;
                this.alCambiar?.('superficie', sitio);
            });
            this.enTransicion = false;
        } };
        let ang = this.zoomA.az1 - this.zoomA.az0;
        ang = Math.atan2(Math.sin(ang), Math.cos(ang));
        this.zoomA.az1 = this.zoomA.az0 + ang;
    }

    async subir() {
        if (this.nivel !== 'superficie' || this.enTransicion) return;
        this.enTransicion = true;
        const sitio = this.sitioActual;
        await this._fundido(() => {
            this.nivel = 'orbita';
            this.gSuperficie.visible = false;
            this.gOrbita.visible = true;
            this.scene.fog = null;
            this.scene.background = new THREE.Color(0x000000);
            this.controls.minR = R * 1.12; this.controls.maxR = R * 14; this.controls.minEl = -1.45;
            const d = dirLatLon(sitio.lat, sitio.lon);
            this.controls.az = Math.atan2(d.x, d.z); this.controls.el = Math.asin(d.y); this.controls.r = R * 2.2;
            this.controls.interactuo = false;
            this.foco.set(0, 0, 0); this.focoObjetivo.set(0, 0, 0);
            this.seleccion = null;
            this.alCambiar?.('orbita', null);
        });
        this.enTransicion = false;
    }

    async _fundido(f) {
        const el = document.getElementById('fundido');
        el?.classList.add('negro');
        await new Promise((r) => setTimeout(r, 450));
        await f();
        el?.classList.remove('negro');
    }

    seleccionar(info) {
        this.seleccion = info;
        if (info?.clase === 'objeto') {
            this.focoObjetivo.copy(info.centro);
            if (!this.controls.interactuo || this.controls.r > info.tam * 12) this.controls.r = Math.max(6, info.tam * 4);
        }
        this.alSeleccionar?.(info);
    }

    // siguiente objeto de la superficie / siguiente sitio (teclado y mandos VR)
    ciclar(paso = 1) {
        if (this.nivel === 'superficie') {
            const lista = this.objetosSup.map((x) => this.pickSup.find((p) => p.userData.info.nombre === x.o.nombre).userData.info);
            const i = lista.findIndex((x) => x.nombre === this.seleccion?.nombre);
            this.seleccionar(lista[(i + paso + lista.length) % lista.length]);
        } else {
            const lista = this.d.sitios.filter((s) => s.superficie);
            const i = lista.findIndex((x) => x.id === this.seleccion?.id);
            const s = lista[(i + paso + lista.length) % lista.length];
            const d = dirLatLon(s.lat, s.lon);
            this.zoomA = { t: 0, dur: 1.2, az0: this.controls.az, el0: this.controls.el, r0: this.controls.r, az1: Math.atan2(d.x, d.z), el1: Math.asin(d.y), r1: Math.min(this.controls.r, R * 2.4) };
            let ang = this.zoomA.az1 - this.zoomA.az0; ang = Math.atan2(Math.sin(ang), Math.cos(ang)); this.zoomA.az1 = this.zoomA.az0 + ang;
            this.seleccionar({ ...s, clase: 'sitio' });
        }
    }

    _clics(dom) {
        const ray = new THREE.Raycaster();
        let ini = null;
        dom.addEventListener('pointerdown', (e) => { if (this.activo) ini = { x: e.clientX, y: e.clientY }; });
        dom.addEventListener('pointerup', (e) => {
            if (!this.activo || !ini || !this.controls.enabled) return;
            const mov = Math.hypot(e.clientX - ini.x, e.clientY - ini.y);
            ini = null;
            if (mov > 6) return;
            const r = dom.getBoundingClientRect();
            ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
            const lista = this.nivel === 'orbita' ? [this.planeta, ...this.pick] : this.pickSup;
            const hit = ray.intersectObjects(lista, true).find((h) => h.object.parent?.visible !== false && h.object.visible !== false);
            this.seleccionar(hit?.object.userData.info ?? null);
        });
    }

    cambiarCamara() { this.controls.interactuo = false; return this.nivel === 'orbita' ? 'órbita' : 'superficie'; }

    // ───────────────────────── cuadro a cuadro ─────────────────────────
    actualizar(t, dt, dtSim, tReal) {
        if (!this.activo) return;
        const C = this.controls;
        if (this.intro) {
            const k = sm((this.intro.t += dt) / this.intro.dur);
            if (C.interactuo) this.intro = null;
            else {
                C.r = this.intro.r0 + (this.intro.r1 - this.intro.r0) * k;
                C.az = this.intro.az0 + (this.intro.az1 - this.intro.az0) * k;
                C.el = this.intro.el0 + (this.intro.el1 - this.intro.el0) * k;
                C.interactuo = false;
                if (k >= 1) this.intro = null;
            }
        }
        if (this.zoomA) {
            const z = this.zoomA, k = sm((z.t += dt) / z.dur);
            C.r = z.r0 + (z.r1 - z.r0) * k; C.az = z.az0 + (z.az1 - z.az0) * k; C.el = z.el0 + (z.el1 - z.el0) * k;
            if (k >= 1) { this.zoomA = null; z.al?.(); }
        }

        if (this.nivel === 'orbita') {
            for (const x of this.objetosOrb) {
                const M = (x.M0 + x.n * tReal * 600) % (Math.PI * 2);
                x.posEn(kepler(M, (x.o.apo_km - x.o.peri_km) / (x.o.apo_km + x.o.peri_km + 2 * this.d.radio_km)), x.nave.position);
                x.modelo.rotation.y += dt * 0.3;
                const sel = this.seleccion?.id === x.o.id;
                x.brillo.scale.setScalar((x.o.estado === 'activa' ? 0.5 : 0.9) * (sel ? 1.8 + 0.3 * Math.sin(tReal * 6) : 1));
                x.et.visible = x.o.estado !== 'activa' || sel;   // las activas solo se rotulan al seleccionarlas
            }
            for (const m of this.marcas) {
                const sel = this.seleccion?.id === m.s.id;
                m.pin.scale.setScalar(sel ? 1.6 + 0.2 * Math.sin(tReal * 6) : 1);
                // las etiquetas de la cara oculta no se dibujan
                const cam = this.camera.getWorldPosition(new THREE.Vector3()).normalize();
                m.marca.visible = m.dir.dot(cam) > -0.05;
                m.et.visible = sel || m.s.superficie || m.s.id === this.ctx.sitio || this.controls.r < R * 1.8;
            }
            if (this.llegada) {
                const L = this.llegada, k = this.intro ? Math.min(1, this.intro.t / (this.intro.dur * 0.85)) : 1;
                L.capsula.position.copy(L.curva.getPoint(Math.min(1, k)));
                L.capsula.visible = k < 1;
                const kc = (k - 0.82) / 0.18;
                L.crucero.visible = kc < 1;
                L.crucero.position.copy(kc < 0 ? L.curva.getPoint(k) : L.curvaCrucero.getPoint(kc));
                L.crucero.scale.setScalar(kc > 0.6 ? 0.6 + 2.5 * (kc - 0.6) * (1 + 0.4 * Math.sin(tReal * 40)) : 0.6);   // se desintegra
                L.etC.visible = k >= 1;
            }
            // al acercarse a la superficie se baja al sitio más cercano
            if (C.interactuo && !this.zoomA && !this.enTransicion && C.r < R * 1.22) {
                const cam = this.camera.getWorldPosition(new THREE.Vector3()).normalize();
                const cand = this.marcas.filter((m) => m.s.superficie).map((m) => ({ m, c: m.dir.dot(cam) })).sort((a, b) => b.c - a.c)[0];
                if (cand && cand.c > Math.cos(28 * RAD)) this.bajar(cand.m.s);
                else if (!this.avisoMostrado) { this.avisoMostrado = true; this.ctx.hud.aviso('Acércate a un sitio marcado con ▲ (verde) para bajar a la superficie'); setTimeout(() => this.ctx.hud.aviso(null), 4000); }
                if (cand && cand.c <= Math.cos(28 * RAD)) C.r = R * 1.22;
            }
        } else {
            this.foco.lerp(this.focoObjetivo, Math.min(1, dt * 3));
            if (C.interactuo && !this.enTransicion && C.r > 820) this.subir();
        }
        this._camara();
    }

    _camara() {
        const { renderer } = this.ctx;
        const pos = this.controls.leer().add(this.foco);
        if (this.nivel === 'superficie') {
            const hs = this.altura(pos.x, pos.z) + 1.6;
            if (pos.y < hs) pos.y = hs;
            this.camera.near = 0.05; this.camera.far = 20000;
            if (this.sol) { this.sol.position.copy(this.foco).addScaledVector(this.dirSol, 300); this.sol.target.position.copy(this.foco); }
            this.estrellasSup?.position.copy(pos);
        } else {
            this.camera.near = 0.02; this.camera.far = 20000;
            this.estrellasOrb.position.copy(pos);
        }
        // el panel de la derecha tapa parte de la vista: se desplaza el centro óptico hacia la izquierda
        const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
        const panel = document.getElementById('restos');
        const visible = !renderer.xr.isPresenting && panel && !panel.classList.contains('oculto');
        const movil = panel && panel.offsetWidth >= w * 0.9;   // hoja inferior (teléfono) o panel lateral
        // escritorio: el panel está a la derecha; teléfono: abajo (se sube el centro de la vista)
        const dx = visible && !movil ? (panel.offsetWidth + 14) / 2 : 0;
        const dy = visible && movil ? panel.offsetHeight / 2 : 0;
        if (dx || dy) this.camera.setViewOffset(w, h, dx, dy, w, h); else this.camera.clearViewOffset();
        this.camera.updateProjectionMatrix();
        if (renderer.xr.isPresenting) {
            this.rig.position.copy(pos);
            this.rig.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(pos, this.foco, new THREE.Vector3(0, 1, 0)));
            return;
        }
        this.rig.position.set(0, 0, 0); this.rig.quaternion.identity();
        this.camera.position.copy(pos);
        this.camera.up.set(0, 1, 0);
        this.camera.lookAt(this.foco);
    }

    // Datos para el HUD: altitud de la cámara sobre el terreno
    altitudCamara() {
        if (this.nivel === 'orbita') {
            const r = this.camera.getWorldPosition(new THREE.Vector3()).length();
            return { km: ((r - R) / R) * this.d.radio_km, unidad: 'km' };   // escala lineal: es la distancia de la vista, no de los objetos
        }
        const p = this.camera.getWorldPosition(new THREE.Vector3());
        return { m: p.y - this.altura(p.x, p.z), unidad: 'm' };
    }

    antesDeRender() {}
}
