// Carga de modelos (public/models) y construcción de piezas separables.
//  - saturnoV.glb es una sola malla: las etapas se separan con planos de recorte (clipping),
//    así se conserva la textura original y cada etapa puede desprenderse y caer por su cuenta.
//  - mod_lunar.glb (comprimido con Draco) se divide en etapa de ascenso y de descenso por altura.
//  - luna1.glb: Luna con textura de 4K (mismo mapa que luna.glb, malla más ligera).
//    OJO: tierra.glb es una copia idéntica de luna.glb (es la Luna), por eso la Tierra usa texturas propias.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const loader = new GLTFLoader();
const draco = new DRACOLoader();
draco.setDecoderPath('/draco/');
loader.setDRACOLoader(draco);

const cache = new Map();
export function cargarGLB(url) {
    if (!cache.has(url)) cache.set(url, loader.loadAsync(url));
    return cache.get(url);
}

// ───────────────────────── Saturn V ─────────────────────────
// Alturas de corte en unidades del modelo (base de los F-1 = -0,14; punta de la torre = 12,85).
export const SATURNO_M_POR_UNIDAD = 110.6 / 12.99;
export const CORTES = {
    SIC: [-1.0, 4.93], INTER: [4.93, 5.5], SII: [5.5, 8.1], SIVB: [8.1, 9.88],
    SLA: [9.88, 10.95], SM: [10.95, 11.36], CM: [11.36, 11.66], LES: [11.66, 13.5],
};
export const RADIO_SLA_BASE = 6.6 / 2 / SATURNO_M_POR_UNIDAD;

function clonarConRecorte(original, planos) {
    const c = original.clone(true);
    c.traverse((m) => {
        if (!m.isMesh) return;
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        const nuevos = mats.map((mt) => {
            const n = mt.clone();
            n.clippingPlanes = planos;
            n.side = THREE.DoubleSide;
            return n;
        });
        m.material = Array.isArray(m.material) ? nuevos : nuevos[0];
    });
    return c;
}

class PiezaRecortada {
    // planosLocales: THREE.Plane en coordenadas del modelo
    constructor(id, original, planosLocales, centro) {
        this.id = id;
        this.locales = planosLocales;
        this.planos = planosLocales.map((p) => p.clone());
        this.modelo = clonarConRecorte(original, this.planos);
        this.pivote = new THREE.Group();          // origen en el centro de la pieza (para que gire sobre sí)
        this.pivote.name = id;
        this.centro = centro.clone();
        this.modelo.position.copy(centro).negate();
        this.pivote.add(this.modelo);
    }

    actualizarRecorte() {
        this.modelo.updateWorldMatrix(true, false);
        for (let i = 0; i < this.planos.length; i++) this.planos[i].copy(this.locales[i]).applyMatrix4(this.modelo.matrixWorld);
    }
}

export async function crearSaturno() {
    const gltf = await cargarGLB('/models/saturnoV.glb');
    const original = gltf.scene;
    // el eje del cohete no está en el origen del modelo: se centra con el cuerpo principal
    let cuerpo = null, alto = 0;
    original.updateMatrixWorld(true);
    original.traverse((m) => {
        if (m.isMesh) { const b = new THREE.Box3().setFromObject(m); const h = b.max.y - b.min.y; if (h > alto) { alto = h; cuerpo = b; } }
    });
    const eje = cuerpo.getCenter(new THREE.Vector3());
    const raiz = new THREE.Group();
    raiz.add(original);
    original.position.set(-eje.x, 0, -eje.z);
    const base = new THREE.Group();
    base.add(raiz);

    const piezas = {};
    for (const [id, [y0, y1]] of Object.entries(CORTES)) {
        const planos = [new THREE.Plane(new THREE.Vector3(0, 1, 0), -y0), new THREE.Plane(new THREE.Vector3(0, -1, 0), y1)];
        piezas[id] = new PiezaRecortada(id, base, planos, new THREE.Vector3(0, (y0 + Math.min(y1, 12.85)) / 2, 0));
    }
    // Los 4 paneles del adaptador SLA (cuadrantes), para abrirlos como pétalos en la transposición
    const [s0, s1] = CORTES.SLA;
    const petalos = [];
    for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
        const planos = [
            new THREE.Plane(new THREE.Vector3(0, 1, 0), -s0), new THREE.Plane(new THREE.Vector3(0, -1, 0), s1),
            new THREE.Plane(new THREE.Vector3(sx, 0, 0), 0), new THREE.Plane(new THREE.Vector3(0, 0, sz), 0),
        ];
        const bisagra = new THREE.Vector3(sx * RADIO_SLA_BASE * 0.7071, s0, sz * RADIO_SLA_BASE * 0.7071);
        const p = new PiezaRecortada(`SLA_${sx}${sz}`, base, planos, bisagra);
        p.eje = new THREE.Vector3(-sz, 0, sx).normalize();   // tangente: el pétalo gira hacia fuera
        p.dir = new THREE.Vector3(sx, 0, sz).normalize();
        petalos.push(p);
    }
    return { piezas, petalos, mPorUnidad: SATURNO_M_POR_UNIDAD };
}

// ───────────────────────── Módulo lunar ─────────────────────────
export const LM_M_POR_UNIDAD = 1.38;   // 5,1 unidades de alto ≈ 7,0 m

export async function crearLM() {
    const gltf = await cargarGLB('/models/mod_lunar.glb');
    const escena = gltf.scene.clone(true);
    escena.updateMatrixWorld(true);
    const ascenso = new THREE.Group(), descenso = new THREE.Group();
    ascenso.name = 'etapa_ascenso'; descenso.name = 'etapa_descenso';
    const mallas = [];
    escena.traverse((m) => { if (m.isMesh) mallas.push(m); });
    for (const m of mallas) {
        const b = new THREE.Box3().setFromObject(m);
        const esAscenso = (b.min.y >= 2.3 || b.max.y >= 3.2) && !(m.name.startsWith('group75') && b.min.y < 3);
        m.castShadow = true; m.receiveShadow = true;
        const mundo = m.matrixWorld.clone();
        (esAscenso ? ascenso : descenso).add(m);
        mundo.decompose(m.position, m.quaternion, m.scale);
    }
    const grupo = new THREE.Group();
    grupo.name = 'LM_Eagle';
    grupo.add(descenso, ascenso);
    return { grupo, ascenso, descenso, mPorUnidad: LM_M_POR_UNIDAD, alto: 5.12, toberaY: 0.55 };
}

// ───────────────────────── Luna ─────────────────────────
// La textura de luna1.glb sigue la convención de Three.js: longitud 0 en +X, este hacia -Z, norte +Y.
export const LUNA_RADIO_MODELO = 1.2718640565872192;
export async function crearLuna() {
    let modelo;
    try {
        modelo = (await cargarGLB('/models/luna1.glb')).scene;
    } catch (e) {
        // Si luna1.glb falta o está dañado, la misión no se rompe: esfera con textura (misma convención +X)
        console.warn('luna1.glb no se pudo cargar, se usa una esfera con textura:', e.message);
        const tex = new THREE.TextureLoader().load('/texturas/moon_1024.jpg');
        tex.colorSpace = THREE.SRGBColorSpace;
        modelo = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 64), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
    }
    modelo.traverse((m) => {
        if (m.isMesh && m.material.map) {
            const map = m.material.map;
            map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
            m.material = new THREE.MeshStandardMaterial({ map, roughness: 1, metalness: 0 });
        }
    });
    // Cualquier modelo de Luna sirve: se centra y se escala a partir de su tamaño real,
    // para que mida LUNA_RADIO_MODELO (la escena lo pasa luego a 1737,4 km).
    const caja = new THREE.Box3().setFromObject(modelo);
    const radio = Math.max(...caja.getSize(new THREE.Vector3()).toArray()) / 2;
    modelo.position.sub(caja.getCenter(new THREE.Vector3()));
    const luna = new THREE.Group();
    luna.add(modelo);
    luna.scale.setScalar(LUNA_RADIO_MODELO / radio);
    const envoltura = new THREE.Group();   // la escena escala este grupo; el de dentro normaliza el modelo
    envoltura.add(luna);
    return envoltura;
}

// ───────────────────────── Tierra ─────────────────────────
const VERT_ATM = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vN; varying vec3 vV;
void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv;
#include <logdepthbuf_vertex>
}`;
const FRAG_ATM = /* glsl */`
#include <logdepthbuf_pars_fragment>
uniform vec3 uSol; varying vec3 vN; varying vec3 vV;
void main(){
#include <logdepthbuf_fragment>
  float f = pow(1.0 - abs(dot(vN, vV)), 3.0);
  float luz = clamp(dot(vN, uSol) * 0.8 + 0.35, 0.0, 1.0);
  gl_FragColor = vec4(vec3(0.35,0.6,1.0) * f * luz * 1.6, f * luz);
}`;

export function crearTierra(radio, maxAniso = 4) {
    const tl = new THREE.TextureLoader();
    const tex = (u, srgb = true) => { const t = tl.load(u); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; return t; };
    const grupo = new THREE.Group();
    const superficie = new THREE.Mesh(
        new THREE.SphereGeometry(radio, 128, 64),
        new THREE.MeshPhongMaterial({
            map: tex('/texturas/earth_atmos_2048.jpg'),
            specularMap: tex('/texturas/earth_specular_2048.jpg', false),
            normalMap: tex('/texturas/earth_normal_2048.jpg', false),
            normalScale: new THREE.Vector2(0.8, 0.8),
            specular: new THREE.Color(0x333333), shininess: 18,
        })
    );
    const nubes = new THREE.Mesh(
        new THREE.SphereGeometry(radio * 1.0025, 96, 48),
        new THREE.MeshLambertMaterial({ map: tex('/texturas/earth_clouds_1024.png'), transparent: true, opacity: 0.85, depthWrite: false })
    );
    const atm = new THREE.Mesh(
        new THREE.SphereGeometry(radio * 1.03, 96, 48),
        new THREE.ShaderMaterial({
            vertexShader: VERT_ATM, fragmentShader: FRAG_ATM, side: THREE.BackSide, transparent: true,
            blending: THREE.AdditiveBlending, depthWrite: false, uniforms: { uSol: { value: new THREE.Vector3(1, 0, 0) } },
        })
    );
    // halo exterior: se ve el borde azul aunque se use la cara trasera
    atm.material.side = THREE.FrontSide;
    grupo.add(superficie, nubes, atm);
    return { grupo, superficie, nubes, atm };
}

// ───────────────────────── Delta II (7925) ─────────────────────────
// delta2.glb trae 3 propulsores GEM; se clonan para llegar a los 9 del Delta II 7925
// (6 se encienden en tierra y 3 en vuelo). Escala: 40,5 unidades ≈ 39,6 m.
export const DELTA_M_POR_UNIDAD = 39.6 / 40.49;
export async function crearDelta() {
    const gltf = await cargarGLB('/models/delta2.glb');
    const raiz = gltf.scene.clone(true);
    raiz.updateMatrixWorld(true);
    const etapa1 = raiz.getObjectByName('stage_01');
    const originales = ['solid_01', 'solid_02', 'solid_03'].map((n) => raiz.getObjectByName(n));
    const eje = new THREE.Vector3(0, 1, 0);
    const gem = [...originales];
    for (const ang of [40, 80]) {
        for (const o of originales) {
            const c = o.clone(true);
            const q = new THREE.Quaternion().setFromAxisAngle(eje, ang * Math.PI / 180);
            c.position.applyQuaternion(q);
            c.quaternion.premultiply(q);
            etapa1.add(c);
            gem.push(c);
        }
    }
    raiz.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    const base = new THREE.Box3().setFromObject(raiz).min.y;
    return { raiz, gem, etapa1, etapa2: raiz.getObjectByName('stage_02'), base, mPorUnidad: DELTA_M_POR_UNIDAD };
}
