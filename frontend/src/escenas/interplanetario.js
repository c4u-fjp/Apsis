// Viaje a Marte (vista heliocéntrica). Posiciones reales de la Tierra y Marte (SPICE, DE440, marco
// eclíptico); el arco de transferencia resuelve el problema de Lambert entre la Tierra en el lanzamiento
// y Marte en la llegada, y la nave se propaga con Kepler alrededor del Sol.
// Unidades: 1 = 1 millón de km. Los planetas se dibujan muy agrandados (si no, serían invisibles).
import * as THREE from 'three';
import { Orbita } from '../core/orbita.js';
import { crearEstrellas, crearMarcador, crearEtiqueta, texturaMarte } from '../modelos/efectos.js';
import { lambert, kepler } from '../mision/trayectoria.js';
import { sub, len, mul } from '../mision/vec.js';
import { t as tr } from '../i18n/index.js';

export const MU_SOL = 1.32712440018e11;   // km³/s²
const U = 1e6;                            // km por unidad de escena
const T3 = (v, out = new THREE.Vector3()) => out.set(v[0] / U, v[2] / U, -v[1] / U);

export class EscenaInterplanetaria {
    constructor(ctx) {
        this.ctx = ctx;
        this.id = 'interplanetario';
        const { renderer } = ctx;
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000000);
        this.camera = new THREE.PerspectiveCamera(50, 1, 0.01, 50000);
        this.rig = new THREE.Group();
        this.rig.add(this.camera);
        this.scene.add(this.rig);
        this.controls = new Orbita(renderer.domElement);
        this.controls.minR = 2; this.controls.maxR = 3000;
        this.scene.add(crearEstrellas(5000, 20000));
        this.scene.add(new THREE.AmbientLight(0x404050, 0.6));
        this.scene.add(new THREE.PointLight(0xffffff, 3, 0, 0));

        // Sol
        const sol = new THREE.Mesh(new THREE.SphereGeometry(4, 32, 16), new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
        const halo = crearMarcador(0xffd27a);
        halo.scale.setScalar(40);
        this.scene.add(sol, halo, this._et(tr('SOL'), [0, 7, 0]));

        const tl = new THREE.TextureLoader();
        const tTierra = tl.load('/texturas/earth_atmos_2048.jpg'); tTierra.colorSpace = THREE.SRGBColorSpace;
        this.tierra = new THREE.Mesh(new THREE.SphereGeometry(2.2, 48, 24), new THREE.MeshStandardMaterial({ map: tTierra, roughness: 0.8 }));
        this.marte = new THREE.Mesh(new THREE.SphereGeometry(1.6, 48, 24), new THREE.MeshStandardMaterial({ map: texturaMarte(), roughness: 0.95 }));
        this.brilloTierra = crearMarcador(0x6fa8ff); this.brilloTierra.scale.setScalar(14);
        this.brilloMarte = crearMarcador(0xff7a50); this.brilloMarte.scale.setScalar(12);
        this.etTierra = crearEtiqueta(tr('TIERRA')); this.etMarte = crearEtiqueta(tr('MARTE'), { color: '#ff8a5c' });
        this.scene.add(this.tierra, this.marte, this.brilloTierra, this.brilloMarte, this.etTierra, this.etMarte);

        this.nave = crearMarcador(0xffffff);
        this.nave.scale.setScalar(6);
        this.etNave = crearEtiqueta(tr('NAVE'), { color: '#ffb020' });
        this.scene.add(this.nave, this.etNave);
        this.lineas = new THREE.Group();
        this.scene.add(this.lineas);
        this.modo = 'auto';
    }

    _et(txt, pos) { const e = crearEtiqueta(txt, { color: '#ffd27a' }); e.position.set(...pos); return e; }

    // datos: { t0_utc, step_s, samples:[{t, tierra, marte}] }, mision: { lanzamiento_utc, llegada_utc, rover }
    configurarMision(datos, mision) {
        this.lineas.clear();
        this.d = datos;
        this.m = mision;
        const t0ms = Date.parse(datos.t0_utc + 'Z');
        this.lanzMs = Date.parse(mision.lanzamiento_utc);
        this.llegMs = Date.parse(mision.llegada_utc);
        this.desfase = (this.lanzMs - t0ms) / 1000;          // segundos de la primera muestra al lanzamiento
        this.duracion = (this.llegMs - this.lanzMs) / 1000;
        // arco de Lambert (eclíptica: el sentido progrado es +Z)
        const r1 = this.pos('tierra', 0), r2 = this.pos('marte', this.duracion);
        this.r1 = r1;
        this.v1 = lambert(r1, r2, this.duracion, [0, 0, 1], MU_SOL);
        const linea = (pts, color, opac = 1) => {
            const g = new THREE.BufferGeometry().setFromPoints(pts.map((p) => T3(p)));
            const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: opac < 1, opacity: opac }));
            l.frustumCulled = false;
            this.lineas.add(l);
            return l;
        };
        const S = datos.samples;
        linea(S.slice(0, 367).map((s) => s.tierra), 0x3d6fb8, 0.7);
        linea(S.slice(0, 690).map((s) => s.marte), 0xb8573d, 0.7);
        const N = 300, arco = [];
        for (let i = 0; i <= N; i++) arco.push(this.posNave((this.duracion * i) / N));
        this.futura = linea(arco, 0x3f9d52, 0.55);
        this.pasada = linea(arco, 0x7dff5c);
        this.nArco = N;
        this.etNave.material.map.dispose();
        this.scene.remove(this.etNave);
        this.etNave = crearEtiqueta(mision.rover.toUpperCase(), { color: '#ffb020' });
        this.scene.add(this.etNave);
        this.controls.fijar(new THREE.Vector3(0, 330, 240));
    }

    // Posición (km, eclíptica, heliocéntrica) de un planeta; t = segundos desde el lanzamiento
    pos(cual, t) {
        const S = this.d.samples, x = (t + this.desfase) / this.d.step_s;
        const i = Math.max(0, Math.min(S.length - 2, Math.floor(x))), f = Math.max(0, Math.min(1, x - i));
        const a = S[i][cual], b = S[i + 1][cual];
        return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
    }

    posNave(t) { return t <= 0 ? this.r1 : t >= this.duracion ? this.pos('marte', this.duracion) : kepler(this.r1, this.v1, t, MU_SOL); }

    telemetria(t) {
        const p = this.posNave(t), v = mul(sub(this.posNave(t + 60), this.posNave(t - 60)), 1 / 120);
        return { distSol: len(p), distTierra: len(sub(p, this.pos('tierra', t))), distMarte: len(sub(p, this.pos('marte', t))), vel: len(v) };
    }

    entrar() {}
    salir() {}
    cambiarCamara() { this.modo = this.modo === 'auto' ? 'libre' : 'auto'; return this.modo; }

    actualizar(t, dtReal, dtSim, tiempoReal) {
        const pt = this.pos('tierra', t), pm = this.pos('marte', t), pn = this.posNave(t);
        T3(pt, this.tierra.position); T3(pm, this.marte.position); T3(pn, this.nave.position);
        this.tierra.rotation.y += dtSim * 7.29e-5;
        this.marte.rotation.y += dtSim * 7.09e-5;
        this.brilloTierra.position.copy(this.tierra.position);
        this.brilloMarte.position.copy(this.marte.position);
        this.etTierra.position.copy(this.tierra.position).y += 6;
        this.etMarte.position.copy(this.marte.position).y += 6;
        this.etNave.position.copy(this.nave.position).y += 9;
        const k = Math.round(Math.max(0, Math.min(1, t / this.duracion)) * this.nArco) + 1;
        this.pasada.geometry.setDrawRange(0, k);
        this.nave.visible = this.etNave.visible = t < this.duracion;
        this._camara(t);
    }

    _camara(t) {
        const { renderer } = this.ctx;
        let objetivo = new THREE.Vector3();
        const f = Math.max(0, Math.min(1, t / this.duracion));
        // al acercarse la llegada, la cámara se va a Marte
        const cerca = Math.max(0, Math.min(1, (f - 0.9) / 0.1));
        if (this.modo === 'auto') {
            objetivo.lerpVectors(this.nave.position.clone().multiplyScalar(0.5), this.marte.position, cerca);
            if (!this.controls.interactuo) this.controls.r = 420 - 395 * cerca;
        }
        const pos = this.controls.leer().add(objetivo);
        if (renderer.xr.isPresenting) {
            this.rig.position.copy(pos);
            this.rig.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(pos, objetivo, new THREE.Vector3(0, 1, 0)));
            return;
        }
        this.camera.position.copy(pos);
        this.camera.lookAt(objetivo);
    }

    antesDeRender() {}
}
