// Efectos visuales compartidos. El resplandor y el humo vienen de nasa_space_apps/escenas/lanzamiento.js.
import * as THREE from 'three';

// Resplandor que siempre se ve aunque la nave sea diminuta (de lanzamiento.js: crearMarcador)
let texResplandor = null;
export function texturaResplandor() {
    if (texResplandor) return texResplandor;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,230,150,1)');
    grad.addColorStop(0.3, 'rgba(255,170,60,0.6)');
    grad.addColorStop(1, 'rgba(255,170,60,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    texResplandor = new THREE.CanvasTexture(c);
    texResplandor.colorSpace = THREE.SRGBColorSpace;
    return texResplandor;
}

// Mancha blanca suave (humo, polvo): el color lo pone cada partícula
let texSuave = null;
export function texturaSuave() {
    if (texSuave) return texSuave;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    texSuave = new THREE.CanvasTexture(c);
    return texSuave;
}

export function crearMarcador(color = 0xffffff) {
    return new THREE.Sprite(new THREE.SpriteMaterial({
        map: texturaResplandor(), color, depthWrite: false, depthTest: false,
        blending: THREE.AdditiveBlending, transparent: true,
    }));
}

// Etiqueta de texto en un sprite (funciona también dentro de las gafas VR)
export function crearEtiqueta(texto, { color = '#4af626', tam = 34 } = {}) {
    const c = document.createElement('canvas');
    const g = c.getContext('2d');
    g.font = `bold ${tam}px Courier New, monospace`;
    c.width = Math.ceil(g.measureText(texto).width) + 24;
    c.height = tam + 20;
    g.font = `bold ${tam}px Courier New, monospace`;
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = color;
    g.textBaseline = 'middle';
    g.fillText(texto, 12, c.height / 2);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true, sizeAttenuation: false }));
    s.scale.set(0.05 * c.width / c.height, 0.05, 1);
    s.renderOrder = 10;
    return s;
}

// Estrellas en una esfera "infinita" (se mueve con la cámara). De lanzamiento.js: crearEstrellas
export function crearEstrellas(n = 4000, radio = 1000, soloArriba = false) {
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
        const u = soloArriba ? 0.02 + Math.random() * 0.98 : Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
        pos.set([radio * s * Math.cos(a), radio * u, radio * s * Math.sin(a)], i * 3);
        const b = 0.45 + Math.random() * 0.55, tinte = Math.random();
        col.set([b * (tinte > 0.8 ? 1 : 0.9), b * 0.95, b * (tinte < 0.2 ? 1 : 0.88)], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const p = new THREE.Points(geo, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, depthWrite: false, fog: false }));
    p.frustumCulled = false;
    p.renderOrder = -10;
    return p;
}

// Llama de motor: cono aditivo con parpadeo. Apunta hacia -Y desde su origen (la tobera).
const VERT_LLAMA = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
#include <logdepthbuf_vertex>
}`;
const FRAG_LLAMA = /* glsl */`
#include <logdepthbuf_pars_fragment>
uniform float uTiempo; uniform float uIntensidad; uniform vec3 uColorA; uniform vec3 uColorB;
varying vec2 vUv;
void main(){
#include <logdepthbuf_fragment>
  float y = 1.0 - vUv.y;           // 1 en la tobera, 0 en la punta
  float ruido = 0.85 + 0.15*sin(uTiempo*55.0 + y*40.0) * sin(uTiempo*31.0 + vUv.x*25.0);
  float borde = 1.0 - abs(vUv.x - 0.5) * 2.0;
  float a = pow(y, 1.6) * ruido * uIntensidad * (0.35 + 0.65*borde);
  gl_FragColor = vec4(mix(uColorB, uColorA, y), a);
}`;

export function crearLlama({ radio = 1, largo = 6, colorA = 0xfff2c0, colorB = 0xff6a10, intensidad = 1 } = {}) {
    const geo = new THREE.ConeGeometry(radio, largo, 20, 1, true);
    geo.rotateX(Math.PI);           // base del cono (ancha) en la tobera, punta hacia -Y
    geo.translate(0, -largo / 2, 0);
    const mat = new THREE.ShaderMaterial({
        vertexShader: VERT_LLAMA, fragmentShader: FRAG_LLAMA, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        uniforms: { uTiempo: { value: 0 }, uIntensidad: { value: intensidad }, uColorA: { value: new THREE.Color(colorA) }, uColorB: { value: new THREE.Color(colorB) } },
    });
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    const brillo = crearMarcador(colorA);
    brillo.material.depthTest = true;
    brillo.scale.setScalar(radio * 5);
    m.add(brillo);
    m.userData.brillo = brillo;
    m.userData.intensidadBase = intensidad;
    m.visible = false;
    return m;
}

export function animarLlama(llama, tiempo, encendida, escalaLargo = 1) {
    llama.visible = encendida;
    if (!encendida) return;
    llama.material.uniforms.uTiempo.value = tiempo;
    llama.scale.set(1, escalaLargo * (0.95 + 0.05 * Math.sin(tiempo * 40)), 1);
}

// Humo / polvo: anillo de partículas reutilizable (de lanzamiento.js, generalizado).
// Cada partícula guarda posición y velocidad; las posiciones pueden ser absolutas (km) o locales (m).
export class Particulas {
    constructor({ n = 1500, tam = 0.12, color = 0xbbbbbb, aditivo = false, vida = 6, atenuar = true, mapa = null } = {}) {
        this.n = n; this.vida = vida; this.i = 0;
        this.pos = new Float32Array(n * 3).fill(1e9);
        this.vel = new Float32Array(n * 3);
        this.edad = new Float32Array(n).fill(1e9);
        this.col = new Float32Array(n * 3);
        this.geo = new THREE.BufferGeometry();
        this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
        this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
        this.base = new THREE.Color(color);
        this.puntos = new THREE.Points(this.geo, new THREE.PointsMaterial({
            size: tam, sizeAttenuation: atenuar, vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false,
            map: mapa ?? (aditivo ? texturaResplandor() : texturaSuave()), blending: aditivo ? THREE.AdditiveBlending : THREE.NormalBlending,
        }));
        this.puntos.frustumCulled = false;
    }

    emitir(x, y, z, vx, vy, vz) {
        const k = this.i;
        this.i = (this.i + 1) % this.n;
        this.pos.set([x, y, z], k * 3);
        this.vel.set([vx, vy, vz], k * 3);
        this.edad[k] = 0;
    }

    // arrastre: fracción de velocidad que se pierde por segundo (0 en el vacío)
    actualizar(dt, { arrastre = 0, gravedad = 0 } = {}) {
        const f = Math.max(0, 1 - arrastre * dt);
        for (let k = 0; k < this.n; k++) {
            const e = (this.edad[k] += dt);
            const j = k * 3;
            if (e > this.vida) { this.pos[j + 1] = 1e9; continue; }
            this.vel[j] *= f; this.vel[j + 1] = this.vel[j + 1] * f - gravedad * dt; this.vel[j + 2] *= f;
            this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt;
            const a = 1 - e / this.vida;
            this.col[j] = this.base.r * a; this.col[j + 1] = this.base.g * a; this.col[j + 2] = this.base.b * a;
        }
        this.geo.attributes.position.needsUpdate = true;
        this.geo.attributes.color.needsUpdate = true;
    }

    vaciar() { this.edad.fill(1e9); this.pos.fill(1e9); this.geo.attributes.position.needsUpdate = true; }
}

// Fundido a negro que funciona también en VR (esfera pegada a la cámara)
export function crearFundido() {
    const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 16, 8),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false, depthWrite: false })
    );
    m.renderOrder = 999;
    m.frustumCulled = false;
    m.visible = false;
    return m;
}

// Textura procedural de Marte (equirectangular): sin dependencias de mapas con licencia dudosa.
let texMarte = null;
export function texturaMarte() {
    if (texMarte) return texMarte;
    const W = 1024, H = 512;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const img = g.createImageData(W, H);
    let a = 4242;
    const rnd = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
    const N = 64, rejilla = Array.from({ length: N * N }, rnd);
    const ruido = (x, y) => {   // ruido de valor periódico en x
        const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
        const v = (i, j) => rejilla[((j % N + N) % N) * N + ((i % N + N) % N)];
        const s = (t) => t * t * (3 - 2 * t);
        const a1 = v(xi, yi) + (v(xi + 1, yi) - v(xi, yi)) * s(fx), b1 = v(xi, yi + 1) + (v(xi + 1, yi + 1) - v(xi, yi + 1)) * s(fx);
        return a1 + (b1 - a1) * s(fy);
    };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const u = (x / W) * 16, v = (y / H) * 8;
        let f = 0, amp = 0.5, fr = 1;
        for (let o = 0; o < 5; o++) { f += amp * ruido(u * fr, v * fr); amp *= 0.5; fr *= 2; }
        const lat = 90 - (y / H) * 180;
        const oscuro = Math.max(0, Math.min(1, (f - 0.48) * 4)) * (Math.abs(lat) < 50 ? 1 : 0.4);
        let r = 190 - 80 * oscuro + 25 * (f - 0.5), gg = 105 - 45 * oscuro + 15 * (f - 0.5), b = 70 - 30 * oscuro;
        const casquete = Math.abs(lat) > 80 - 6 * f ? 1 : 0;
        if (casquete) { r = 240; gg = 236; b = 230; }
        const k = (y * W + x) * 4;
        img.data[k] = r; img.data[k + 1] = gg; img.data[k + 2] = b; img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    texMarte = new THREE.CanvasTexture(c);
    texMarte.colorSpace = THREE.SRGBColorSpace;
    return texMarte;
}
