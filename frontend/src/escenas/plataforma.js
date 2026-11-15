// Plataforma de lanzamiento (escala en metros): pantalla previa al lanzamiento, cuenta regresiva,
// ignición, despegue y ascenso siguiendo al cohete.
//   · Luna:  Saturn V en la 39A, perfil real de Apollo 11 (NASA SP-4029), Sol real (SPICE).
//   · Marte: Delta II en el complejo 17 de Cabo Cañaveral, perfil de ascenso modelado.
// La iluminación sigue la hora real de cada lanzamiento: Apollo 11 despegó de día; Pathfinder,
// Opportunity y Phoenix de noche (focos, balizas y estrellas).
import * as THREE from 'three';
import { Orbita } from '../core/orbita.js';
import { Particulas, crearEstrellas, crearMarcador } from '../modelos/efectos.js';
import { smooth } from '../mision/vec.js';

const DEG = Math.PI / 180;

const VERT_CIELO = /* glsl */`
varying vec3 vDir;
void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`;
const FRAG_CIELO = /* glsl */`
uniform vec3 uSol; uniform float uAlt; uniform float uNoche; varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  vec3 zen = mix(vec3(0.16,0.34,0.72), vec3(0.0,0.0,0.02), smoothstep(4000.0, 40000.0, uAlt));
  vec3 hor = mix(vec3(0.70,0.80,0.90), vec3(0.10,0.16,0.30), smoothstep(6000.0, 60000.0, uAlt));
  vec3 c = mix(hor, zen, pow(h, 0.45));
  float s = max(dot(d, normalize(uSol)), 0.0);
  c += vec3(1.0,0.92,0.75) * pow(s, 900.0) * 6.0 + vec3(1.0,0.85,0.6) * pow(s, 10.0) * 0.18;
  vec3 noche = mix(vec3(0.07,0.09,0.15), vec3(0.01,0.015,0.035), pow(h, 0.5));
  gl_FragColor = vec4(mix(c, noche, uNoche), 1.0);
}`;

function texturaLienzo(w, h, dibujar, rep = [1, 1]) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    dibujar(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...rep);
    t.anisotropy = 8;
    return t;
}

export class EscenaPlataforma {
    constructor(ctx) {
        this.ctx = ctx;
        this.id = 'plataforma';
        const { renderer } = ctx;
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.Fog(0xb4c8dc, 3000, 60000);
        this.camera = new THREE.PerspectiveCamera(45, 1, 0.5, 200000);
        this.rig = new THREE.Group();
        this.rig.add(this.camera);
        this.scene.add(this.rig);
        this.controls = new Orbita(renderer.domElement);
        this.controls.minR = 60; this.controls.maxR = 20000;
        this.controls.minEl = -0.2;

        this.cielo = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), new THREE.ShaderMaterial({
            vertexShader: VERT_CIELO, fragmentShader: FRAG_CIELO, side: THREE.BackSide, depthWrite: false, depthTest: false,
            uniforms: { uSol: { value: new THREE.Vector3(0.6, 0.6, 0) }, uAlt: { value: 0 }, uNoche: { value: 0 } },
        }));
        this.cielo.renderOrder = -100;
        this.cielo.frustumCulled = false;
        this.scene.add(this.cielo);
        this.estrellas = crearEstrellas(4000, 150000, true);   // solo sobre el horizonte y más lejos que el suelo
        this.estrellas.material.transparent = true;
        this.scene.add(this.estrellas);

        this.sol = new THREE.DirectionalLight(0xfff4e0, 3.0);
        this.sol.castShadow = true;
        this.sol.shadow.mapSize.set(2048, 2048);
        Object.assign(this.sol.shadow.camera, { left: -160, right: 160, top: 160, bottom: -160, near: 10, far: 2000 });
        this.sol.shadow.bias = -0.0005;
        this.hemi = new THREE.HemisphereLight(0xbcd4ff, 0x5a5a40, 1.1);
        this.scene.add(this.sol, this.sol.target, this.hemi);

        this.estructura = new THREE.Group();   // montículo, plataforma móvil, torre: se escalan con el cohete
        this.scene.add(this.estructura);
        this._construirEntorno();
        this._construirNoche();
        this.humoSuelo = new Particulas({ n: 1800, tam: 38, color: 0xe6e2dc, vida: 22 });
        this.humoSuelo.puntos.material.opacity = 0.75;
        this.vapor = new Particulas({ n: 500, tam: 16, color: 0xd9d6d0, vida: 14 });
        this.vapor.puntos.material.opacity = 0.35;
        this.estela = new Particulas({ n: 3000, tam: 30, color: 0xf2efe8, vida: 70 });
        this.estela.puntos.material.opacity = 0.6;
        this.scene.add(this.humoSuelo.puntos, this.vapor.puntos, this.estela.puntos);
        this.luzMotor = new THREE.PointLight(0xffa040, 0, 700, 2);
        this.scene.add(this.luzMotor);
        this.astro = crearMarcador(0xff7a50);    // Marte en el cielo, hacia donde vamos
        this.astro.material.depthTest = true;
        this.astro.visible = false;
        this.scene.add(this.astro);
        this.modoCam = 'auto';
        this.preparacion = false;
    }

    _construirEntorno() {
        const s = this.scene, e = this.estructura;
        this.matSuelo = new THREE.MeshLambertMaterial({
            map: texturaLienzo(256, 256, (g, w, h) => {
                g.fillStyle = '#6f7a4e'; g.fillRect(0, 0, w, h);
                for (let i = 0; i < 2600; i++) {
                    g.fillStyle = ['#5d6a40', '#7e8758', '#8f8a62', '#4f5b37'][i % 4];
                    g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 5, 2 + Math.random() * 5);
                }
            }, [900, 900]),
        });
        const suelo = new THREE.Mesh(new THREE.PlaneGeometry(240000, 240000), this.matSuelo);
        suelo.rotation.x = -Math.PI / 2;
        suelo.receiveShadow = true;
        s.add(suelo);
        const mar = new THREE.Mesh(new THREE.PlaneGeometry(120000, 240000), new THREE.MeshPhongMaterial({ color: 0x1d4f73, shininess: 80, specular: 0x88aacc }));
        mar.rotation.x = -Math.PI / 2;
        mar.position.set(1900 + 60000, 0.3, 0);
        s.add(mar);
        const playa = new THREE.Mesh(new THREE.PlaneGeometry(90, 240000), new THREE.MeshLambertMaterial({ color: 0xd8cfae }));
        playa.rotation.x = -Math.PI / 2;
        playa.position.set(1880, 0.35, 0);
        s.add(playa);
        const camino = new THREE.Mesh(new THREE.PlaneGeometry(5000, 40), new THREE.MeshLambertMaterial({ color: 0xbdb5a0 }));
        camino.rotation.x = -Math.PI / 2;
        camino.position.set(-2600, 0.2, 0);
        s.add(camino);

        const hormigon = new THREE.MeshStandardMaterial({ color: 0x9c9a94, roughness: 0.95 });
        const gris = new THREE.MeshStandardMaterial({ color: 0x7c7f82, roughness: 0.8, metalness: 0.1 });
        // (medidas de la 39A; se escalan para el Delta II)
        const monticulo = new THREE.Mesh(new THREE.CylinderGeometry(150, 200, 14, 8), hormigon);
        monticulo.position.y = 7;
        monticulo.rotation.y = Math.PI / 8;
        monticulo.receiveShadow = true;
        e.add(monticulo);
        const foso = new THREE.Mesh(new THREE.BoxGeometry(18, 2, 140), new THREE.MeshStandardMaterial({ color: 0x2a2724 }));
        foso.position.set(0, 13.6, 0);
        e.add(foso);
        const mlp = new THREE.Mesh(new THREE.BoxGeometry(49, 7.6, 41), gris);
        mlp.position.set(0, 27.6 - 3.8, -6);
        mlp.castShadow = mlp.receiveShadow = true;
        e.add(mlp);
        for (const [x, z] of [[-18, -20], [18, -20], [-18, 8], [18, 8]]) {
            const p = new THREE.Mesh(new THREE.BoxGeometry(4, 6, 4), gris);
            p.position.set(x, 17, z);
            e.add(p);
        }
        const celosia = texturaLienzo(64, 64, (g, w, h) => {
            g.clearRect(0, 0, w, h);
            g.strokeStyle = '#b8401f'; g.lineWidth = 5;
            g.strokeRect(0, 0, w, h);
            g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h); g.moveTo(w, 0); g.lineTo(0, h); g.stroke();
        }, [3, 30]);
        const matTorre = new THREE.MeshStandardMaterial({ map: celosia, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.7 });
        this.matTorre = matTorre;
        const torre = new THREE.Mesh(new THREE.BoxGeometry(12, 122, 12), matTorre);
        torre.position.set(0, 27.6 + 61, -21);
        torre.castShadow = true;
        e.add(torre);
        const grua = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 30), new THREE.MeshStandardMaterial({ color: 0xb8401f }));
        grua.position.set(0, 27.6 + 124, -16);
        e.add(grua);
        this.brazos = [];
        const matBrazo = new THREE.MeshStandardMaterial({ color: 0xa63c1e, roughness: 0.7 });
        for (const h of [20, 38, 52, 66, 77, 87, 94, 99]) {
            const pivote = new THREE.Group();
            pivote.position.set(-4, 27.6 + h, -15);
            const b = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 11), matBrazo);
            b.position.z = 5.5;
            b.castShadow = true;
            pivote.add(b);
            e.add(pivote);
            this.brazos.push(pivote);
        }
    }

    // Focos, postes de luz y balizas rojas de la torre (como en las fotos de lanzamientos nocturnos)
    _construirNoche() {
        this.noche = new THREE.Group();
        this.focos = [];
        const poste = new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.8 });
        for (const [x, z] of [[-140, 120], [150, 110], [-120, -150], [160, -130]]) {
            const p = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 34), poste);
            p.position.set(x, 17, z);
            const cabeza = crearMarcador(0xfff6dd);
            cabeza.scale.setScalar(14);
            cabeza.position.set(x, 35, z);
            const foco = new THREE.SpotLight(0xfff1d6, 0, 900, 0.32, 0.6, 2);
            foco.position.set(x, 35, z);
            this.noche.add(p, cabeza, foco, foco.target);
            this.focos.push(foco);
        }
        this.balizas = [];
        for (const h of [40, 80, 122, 150]) {
            const b = crearMarcador(0xff2a12);
            b.material.depthTest = true;
            b.scale.setScalar(5);
            b.position.set(6.5, h, -21);
            this.estructura.add(b);
            this.balizas.push(b);
        }
        this.scene.add(this.noche);
    }

    // perfil: { vehiculo, ignicion, altKm(t), rangoKm(t), azimut, solLocal(t)->[e,u,-n], astroLocal?(t), nombre }
    async cargar(perfil) { this.configurarMision(perfil); }

    configurarMision(perfil) {
        if (this.v) this.scene.remove(this.v.raiz);
        this.perfil = perfil;
        this.v = perfil.vehiculo;
        this.k = this.v.alto / 110.6;                     // escala de la plataforma respecto a la 39A
        this.controls.minR = this.v.alto * 0.9;          // nunca dentro del cohete
        this.estructura.scale.setScalar(Math.max(0.42, this.k));
        this.yBase = 27.6 * Math.max(0.42, this.k);
        this.scene.add(this.v.raiz);
    }

    entrar() {
        this.scene.add(this.v.raiz);
        this.humoSuelo.vaciar();
        this.estela.vaciar();
        this.modoCam = 'auto';
        this.controls.interactuo = false;
    }

    salir() {}

    cambiarCamara() {
        this.modoCam = this.modoCam === 'auto' ? 'persecucion' : 'auto';
        if (this.modoCam === 'persecucion') this.controls.fijar(new THREE.Vector3(-1.45, 0.36, 2) .multiplyScalar(this.v.alto));
        return this.modoCam;
    }

    // Pose del cohete (base de los motores) en metros, función pura de t
    pose(t) {
        const p = this.perfil;
        const posEn = (tt) => {
            const alt = Math.max(0, p.altKm(Math.max(0, tt))) * 1000;
            const rng = Math.max(0, p.rangoKm(Math.max(0, tt))) * 1000;
            const az = p.azimut * DEG;
            const desvio = 1.25 * DEG * smooth((tt - 1.7) / 8) * alt;   // guiñada para alejarse de la torre
            return new THREE.Vector3(Math.sin(az) * rng, this.yBase + alt, -Math.cos(az) * rng + desvio);
        };
        const pos = posEn(t);
        const dir = posEn(t + 0.5).sub(posEn(t - 0.5));
        const arriba = new THREE.Vector3(0, 1, 0);
        const eje = dir.lengthSq() > 1e-4 ? dir.normalize().lerp(arriba, 1 - smooth((t - 10) / 20)).normalize() : arriba.clone();
        const alabeo = (p.alabeoDeg ?? -18) * DEG * smooth((t - 13.2) / 18);
        const quat = new THREE.Quaternion().setFromUnitVectors(arriba, eje).multiply(new THREE.Quaternion().setFromAxisAngle(arriba, alabeo));
        return { pos, quat, eje, alt: pos.y - this.yBase };
    }

    actualizar(t, dtReal, dtSim, tiempoReal) {
        const H = this.v.alto;
        const { pos, quat, eje, alt } = this.pose(t);
        this.v.raiz.position.copy(pos);
        this.v.raiz.quaternion.copy(quat);
        const arranque = this.v.configurar(t, tiempoReal, alt, (tt) => this.pose(tt));
        const ign = arranque > 0;
        this.luzMotor.intensity = ign ? 2.5e4 * arranque * this.k : 0;
        this.luzMotor.position.copy(pos).y -= 20 * this.k;

        const giro = (Math.PI / 2.2) * smooth(t / 5);
        this.brazos.forEach((b, i) => { b.rotation.y = -giro * (0.8 + 0.05 * i); });

        // vapor que sale de la plataforma antes del lanzamiento (los tanques criogénicos ventean)
        if (t < 2 && dtReal > 0 && Math.random() < 0.8) {
            const a = Math.random() * Math.PI * 2, r = (6 + Math.random() * 10) * this.k;
            this.vapor.emitir(Math.cos(a) * r, this.yBase + Math.random() * H * 0.5, Math.sin(a) * r,
                Math.cos(a) * 1.5 + 1.2, 1 + Math.random() * 2, Math.sin(a) * 1.5);
        }
        this.vapor.actualizar(dtReal, { arrastre: 0.1, gravedad: -0.2 });

        if (dtSim > 0 && ign) {
            const fuerza = arranque * (1 - smooth((alt - 300) / 1500));
            const n = Math.round(30 * fuerza * Math.min(3, dtSim * 60));
            for (let i = 0; i < n; i++) {
                const lado = Math.random() < 0.5 ? 1 : -1;
                this.humoSuelo.emitir((Math.random() - 0.5) * 20 * this.k, 16 * this.k, lado * 70 * this.k,
                    (Math.random() - 0.5) * 25, 6 + Math.random() * 14, lado * (35 + Math.random() * 40));
            }
            if (t > 0.6) {
                const m = Math.min(14, Math.ceil(dtSim * 50));
                for (let i = 0; i < m; i++) {
                    this.estela.emitir(pos.x - eje.x * i + (Math.random() - 0.5) * 8 * this.k, pos.y - 25 * this.k - Math.random() * 30 * (1 + alt / 3000),
                        pos.z + (Math.random() - 0.5) * 8 * this.k, (Math.random() - 0.5) * 3, -2, (Math.random() - 0.5) * 3);
                }
            }
        }
        this.humoSuelo.actualizar(Math.max(0, dtSim), { arrastre: 0.35, gravedad: -1.5 });
        this.estela.actualizar(Math.max(0, dtSim), { arrastre: 0.2 });

        // Sol real a la hora del lanzamiento; de noche: focos, balizas y estrellas
        const sol = this.perfil.nocheCine ? new THREE.Vector3(0.3, -0.35, -0.9).normalize() : new THREE.Vector3(...this.perfil.solLocal(t)).normalize();
        const noche = 1 - smooth((sol.y + 0.05) / 0.12);
        this.sol.position.copy(pos).addScaledVector(sol, 800);
        this.sol.target.position.copy(pos);
        this.sol.intensity = 3.0 * (1 - noche) + 0.25 * noche;
        this.sol.color.setHex(noche > 0.5 ? 0x9fb4ff : 0xfff4e0);
        if (noche > 0.5) this.sol.position.copy(pos).add(new THREE.Vector3(-300, 500, 200));
        this.hemi.intensity = 1.1 * (1 - noche) + 0.12 * noche;
        this.cielo.material.uniforms.uSol.value.copy(sol);
        this.cielo.material.uniforms.uNoche.value = noche;
        this.estrellas.material.opacity = noche;
        this.estrellas.visible = noche > 0.05;
        this.noche.visible = noche > 0.3;
        for (const f of this.focos) { f.intensity = 3.2e4 * noche; f.target.position.set(pos.x, this.yBase + H * 0.45, pos.z); }
        this.balizas.forEach((b, i) => { b.visible = noche > 0.3 && Math.sin(tiempoReal * 3 + i) > -0.2; });
        this.scene.fog.color.setRGB(0.70 * (1 - noche) + 0.04 * noche, 0.78 * (1 - noche) + 0.05 * noche, 0.86 * (1 - noche) + 0.09 * noche);
        const astro = this.perfil.astroLocal?.(t);
        this.astro.visible = !!astro && astro[1] > 0 && noche > 0.3;
        if (astro) { this.astro.position.copy(new THREE.Vector3(...astro).normalize().multiplyScalar(60000)); this.astro.scale.setScalar(900); }

        this._camara(t, pos, eje, tiempoReal);
        const altCam = this.camera.getWorldPosition(new THREE.Vector3()).y;
        this.cielo.material.uniforms.uAlt.value = altCam;
        this.cielo.position.copy(this.camera.getWorldPosition(new THREE.Vector3()));
        this.estrellas.position.copy(this.cielo.position);
        this.scene.fog.far = (noche > 0.5 ? 25000 : 60000) + altCam * 4;
    }

    _camara(t, pos, eje, tiempoReal) {
        const { renderer } = this.ctx;
        const H = this.v.alto;
        const centro = pos.clone().addScaledVector(eje, H * 0.45);
        let cam, mira = centro, fov = 45;
        if (this.controls.interactuo && this.modoCam === 'auto' && !this.preparacion) this.modoCam = 'persecucion';
        if (this.preparacion) this.controls.interactuo = false;
        if (this.preparacion) {
            // pantalla de lanzamiento: plano bajo con el cohete a la derecha y un lento travelling
            const a = Math.sin(tiempoReal * 0.06) * 0.08;
            cam = new THREE.Vector3(-1.05 * H + Math.sin(a) * H * 0.3, 7 * this.k + 2, 1.55 * H);
            mira = new THREE.Vector3(-0.42 * H, this.yBase + 0.52 * H, 0);
            fov = 50;
        } else if (this.modoCam === 'persecucion') {
            cam = this.controls.leer().add(centro);
        } else if (t < -2) {
            cam = new THREE.Vector3(-3.9 * H, 16, 3.3 * H);
            mira = new THREE.Vector3(0, this.yBase + H * 0.45, 0);
        } else if (t < 9) {
            cam = new THREE.Vector3(0.5 * H, 22 * this.k, 0.62 * H);
            mira = pos.clone().add(new THREE.Vector3(0, 0.5 * H, 0));
            fov = 60;
        } else if (t < 38) {
            cam = new THREE.Vector3(-2600, 12, 1500);
            fov = THREE.MathUtils.clamp(28 - (t - 9) * 0.55, 9 * this.k + 2, 28);
        } else {
            cam = centro.clone().add(new THREE.Vector3(-1.0 * H, -0.5 * H, 1.36 * H));
        }
        if (this.modoCam !== 'persecucion') this.controls.sincronizar(cam.clone().sub(centro));
        if (this.camera.fov !== fov) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
        if (renderer.xr.isPresenting) {
            const ojo = t < 38 ? new THREE.Vector3(-3.5 * H, 2, 2.9 * H) : cam;
            this.rig.position.copy(ojo);
            const m = new THREE.Matrix4().lookAt(ojo, mira, new THREE.Vector3(0, 1, 0));
            const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromRotationMatrix(m), 'YXZ');
            this.rig.rotation.set(0, e.y, 0);
            return;
        }
        this.rig.position.set(0, 0, 0);
        this.rig.rotation.set(0, 0, 0);
        this.camera.position.copy(cam);
        this.camera.up.set(0, 1, 0);
        this.camera.lookAt(mira);
    }

    antesDeRender() {
        this.scene.updateMatrixWorld();
        this.v.actualizarRecortes();
    }
}
