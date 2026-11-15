// Zylo, el alienígena del easter egg (public/models/personaje.glb).
// El modelo trae una sola animación ("Caminar"); el saludo se hace moviendo los huesos del brazo derecho.
// Mira hacia +Z. Se maneja con un guion de pasos: ir a un punto, mirar a algo, saludar, esperar, desaparecer.
import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { cargarGLB } from './cargador.js';

const ALTO_MODELO = 1.26;
const sm = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };

export class Personaje {
    static async crear(alto = ALTO_MODELO) {
        const gltf = await cargarGLB('/models/personaje.glb');
        return new Personaje(gltf, alto);
    }

    constructor(gltf, alto) {
        this.raiz = new THREE.Group();
        this.raiz.name = 'Zylo';
        this.cuerpo = new THREE.Group();   // se escala al desaparecer
        this.modelo = clone(gltf.scene);
        this.modelo.scale.setScalar(alto / ALTO_MODELO);
        this.modelo.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
        this.cuerpo.add(this.modelo);
        this.raiz.add(this.cuerpo);
        this.alto = alto;
        this.mezcla = new THREE.AnimationMixer(this.modelo);
        const clip = gltf.animations.find((a) => a.name === 'Caminar') ?? gltf.animations[0];
        this.caminar = clip ? this.mezcla.clipAction(clip) : null;
        this.brazo = this.modelo.getObjectByName('brazoR');
        this.antebrazo = this.modelo.getObjectByName('antebrazoR');
        this.qBrazo = this.brazo?.quaternion.clone();
        this.qAnte = this.antebrazo?.quaternion.clone();
        // cápsula invisible para poder hacerle clic
        this.proxy = new THREE.Mesh(new THREE.CylinderGeometry(alto * 0.32, alto * 0.32, alto, 10),
            new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
        this.proxy.position.y = alto / 2;
        this.raiz.add(this.proxy);
        this.raiz.visible = false;
        this.pasos = [];
        this.paso = null;
        this.saludo = 0;           // 0..1 cuánto está levantado el brazo
        this.velocidad = 0.5 * alto / ALTO_MODELO;   // m/s, acorde al ciclo de la animación
        this.alto = alto;
        this.t = 0;
    }

    get activo() { return this.raiz.visible; }

    // Arranca un guion. pasos: [{ir:[x,z]}, {mirar:[x,z]}, {saludar:s}, {esperar:s}, {desaparecer:true}, {repetir:true}]
    // suelo(x, z) -> y del terreno (opcional)
    iniciar(pos, pasos, { suelo = null, rumbo = 0 } = {}) {
        this.suelo = suelo;
        this.raiz.position.set(pos[0], suelo ? suelo(pos[0], pos[1]) : 0, pos[1]);
        this.raiz.rotation.y = rumbo;
        this.cuerpo.scale.setScalar(1);
        this.cuerpo.rotation.set(0, 0, 0);
        this.raiz.visible = true;
        this.guion = pasos;
        this.pasos = [...pasos];
        this.paso = null;
        this.saludo = 0;
    }

    // Desaparece al instante (con un giro y encogiéndose en un cuarto de segundo), sin dejar rastro
    desaparecer() {
        if (!this.raiz.visible || this.paso?.desaparecer) return;
        this.pasos = [];
        this.paso = { desaparecer: true, t: 0 };
        this.caminar?.stop();
    }

    _rumbo(x, z) { return Math.atan2(x - this.raiz.position.x, z - this.raiz.position.z); }

    _girarHacia(objetivo, dt, vel = 6) {
        let d = objetivo - this.raiz.rotation.y;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        this.raiz.rotation.y += d * Math.min(1, dt * vel);
        return Math.abs(d) < 0.05;
    }

    actualizar(dt, mirarA = null) {
        if (!this.raiz.visible) return;
        this.t += dt;
        if (!this.paso) {
            if (!this.pasos.length) { this.raiz.visible = false; return; }
            this.paso = { ...this.pasos.shift(), t: 0 };
            if (this.paso.repetir) { this.pasos = [...this.guion]; this.paso = null; return; }
        }
        const p = this.paso;
        p.t += dt;
        let listo = false;
        if (p.ir) {
            const [x, z] = p.ir;
            const dx = x - this.raiz.position.x, dz = z - this.raiz.position.z, d = Math.hypot(dx, dz);
            if (!this.caminar?.isRunning()) this.caminar?.reset().play();
            this._girarHacia(Math.atan2(dx, dz), dt);
            const paso = Math.min(d, this.velocidad * dt);
            if (d > 1e-3) { this.raiz.position.x += (dx / d) * paso; this.raiz.position.z += (dz / d) * paso; }
            if (this.suelo) this.raiz.position.y = this.suelo(this.raiz.position.x, this.raiz.position.z);
            listo = d < 0.02;
            if (listo) this.caminar?.stop();
        } else if (p.mirar || p.mirarCamara) {
            const obj = p.mirar ?? (mirarA ? [mirarA.x, mirarA.z] : null);
            listo = !obj || this._girarHacia(this._rumbo(obj[0], obj[1]), dt) || p.t > 1.5;
        } else if (p.saludar) {
            if (mirarA) this._girarHacia(this._rumbo(mirarA.x, mirarA.z), dt, 3);
            const dur = p.saludar;
            this.saludo = sm(p.t / 0.35) * (1 - sm((p.t - dur + 0.35) / 0.35));
            listo = p.t >= dur;
        } else if (p.esperar) {
            listo = p.t >= p.esperar;
        } else if (p.desaparecer) {
            const k = sm(p.t / 0.25);
            this.cuerpo.scale.set(1 - k, 1 + k * 0.6, 1 - k);
            this.cuerpo.rotation.y = k * 4;
            if (k >= 1) { this.raiz.visible = false; this.paso = null; this.pasos = []; return; }
        } else listo = true;

        this.mezcla.update(dt);
        // saludo: el brazo derecho arriba y el antebrazo de lado a lado
        if (this.brazo && this.antebrazo) {
            const w = this.saludo;
            if (w > 0.001 || !this.caminar?.isRunning()) {
                this.brazo.quaternion.copy(this.qBrazo).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -2.3 * w));
                this.antebrazo.quaternion.copy(this.qAnte).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.sin(this.t * 10) * 0.5 * w));
            }
        }
        if (listo) this.paso = null;
    }

    impacta(ray) { return this.raiz.visible && ray.intersectObject(this.proxy, false).length > 0; }
}
