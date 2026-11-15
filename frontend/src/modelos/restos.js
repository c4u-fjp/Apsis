// Modelos procedurales (en metros) de lo que quedó en la Luna, en Marte y en sus órbitas.
// Son simplificados pero a escala: sirven para reconocer cada objeto y su tamaño relativo.
// crearModelo(tipo, opciones) devuelve un THREE.Group con la base en y = 0.
import * as THREE from 'three';
import { cargarGLB } from './cargador.js';

const mats = new Map();
function mat(nombre) {
    if (mats.has(nombre)) return mats.get(nombre);
    const P = {
        oro: { color: 0xc9a040, metalness: 0.7, roughness: 0.35 },
        plata: { color: 0xc8c8c8, metalness: 0.8, roughness: 0.3 },
        blanco: { color: 0xe6e6e2, roughness: 0.6 },
        gris: { color: 0x8a8a86, metalness: 0.3, roughness: 0.6 },
        oscuro: { color: 0x2a2a2a, roughness: 0.7 },
        panel: { color: 0x1b2a55, metalness: 0.4, roughness: 0.35 },
        naranja: { color: 0xc8662a, roughness: 0.7 },
        airbag: { color: 0xd6cdb8, roughness: 0.95 },
        quemado: { color: 0x3a2a20, roughness: 0.9 },
        tela: { color: 0xf0ece4, roughness: 0.95, side: THREE.DoubleSide },
        polvo: { color: 0xb08a66, roughness: 1 },
        cristal: { color: 0x8899aa, metalness: 0.9, roughness: 0.15 },
    }[nombre];
    const m = new THREE.MeshStandardMaterial(P);
    mats.set(nombre, m);
    return m;
}

const caja = (x, y, z, m) => new THREE.Mesh(new THREE.BoxGeometry(x, y, z), mat(m));
const cil = (r1, r2, h, m, seg = 16) => new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat(m));
const en = (obj, x, y, z, rx = 0, ry = 0, rz = 0) => { obj.position.set(x, y, z); obj.rotation.set(rx, ry, rz); return obj; };

// Barra entre dos puntos
function barra(a, b, r, m) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const c = cil(r, r, A.distanceTo(B), m, 6);
    c.position.copy(A).add(B).multiplyScalar(0.5);
    c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
    return c;
}

function rueda(r, ancho, m = 'gris') {
    const w = cil(r, r, ancho, m, 14);
    w.rotation.x = Math.PI / 2;
    return w;
}

// Patas con plato (LM, Surveyor, Viking, Phoenix...): n patas desde un radio interior a uno exterior
function patas(g, n, rIn, yIn, rOut, rPlato, m = 'plata', fase = 0) {
    for (let i = 0; i < n; i++) {
        const a = fase + (i / n) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
        g.add(barra([c * rIn, yIn, s * rIn], [c * rOut, 0.12, s * rOut], 0.05, m));
        g.add(en(cil(rPlato, rPlato * 0.8, 0.1, m), c * rOut, 0.05, s * rOut));
    }
}

const D = {
    // ───── Luna ─────
    lm_descenso() {   // ~4,2 m de ancho, patas a 9,4 m
        const g = new THREE.Group();
        const cuerpo = cil(2.1, 2.1, 1.6, 'oro', 8);
        cuerpo.position.y = 1.55; cuerpo.rotation.y = Math.PI / 8;
        g.add(cuerpo, en(cil(1.95, 1.95, 0.06, 'oscuro', 8), 0, 2.38, 0, 0, Math.PI / 8));
        g.add(en(cil(0.5, 0.8, 0.6, 'oscuro'), 0, 0.5, 0));   // tobera del motor de descenso
        patas(g, 4, 1.9, 1.6, 4.6, 0.45, 'plata', Math.PI / 4);
        g.add(en(caja(0.7, 0.05, 1.2, 'plata'), -2.6, 1.2, 0, 0, 0, -0.9));   // escalerilla (frente oeste)
        return g;
    },
    etapa_ascenso() { // en órbita
        const g = new THREE.Group();
        g.add(en(cil(1.4, 1.4, 2.2, 'plata', 8), 0, 1.1, 0), en(caja(2.4, 1.4, 1.6, 'gris'), 0.4, 1.4, 0));
        g.add(en(caja(0.9, 0.9, 0.6, 'oscuro'), -1.5, 1.6, 0));
        g.add(barra([0, 2.2, 0], [0.6, 3.2, 0.6], 0.04, 'plata'), en(cil(0.45, 0.05, 0.2, 'blanco'), 0.6, 3.3, 0.6));
        return g;
    },
    bandera({ caida = false } = {}) {
        const c = document.createElement('canvas'); c.width = 190; c.height = 100;
        const x = c.getContext('2d');
        for (let i = 0; i < 13; i++) { x.fillStyle = i % 2 ? '#fff' : '#b22234'; x.fillRect(0, (i * 100) / 13, 190, 100 / 13 + 0.5); }
        x.fillStyle = '#3c3b6e'; x.fillRect(0, 0, 76, 54);
        const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
        const g = new THREE.Group(), asta = new THREE.Group();
        asta.add(en(cil(0.02, 0.02, 2.4, 'blanco', 6), 0, 1.2, 0));
        asta.add(en(new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.8), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8 })), 0.75, 1.95, 0));
        if (caida) asta.rotation.x = -1.45;
        g.add(asta);
        return g;
    },
    easep() {
        const g = new THREE.Group();
        g.add(en(caja(0.6, 0.45, 0.5, 'oro'), 0, 0.25, 0));
        for (const s of [-1, 1]) g.add(en(caja(0.9, 0.03, 0.6, 'panel'), s * 0.8, 0.35, 0));
        return g;
    },
    lrrr() {
        const g = new THREE.Group();
        g.add(en(caja(0.46, 0.05, 0.46, 'cristal'), 0, 0.45, 0, 0, 0, 0.35), en(cil(0.02, 0.02, 0.45, 'blanco', 6), 0, 0.22, 0));
        return g;
    },
    alsep() {   // estación central + RTG + experimentos alrededor
        const g = new THREE.Group();
        g.add(en(caja(0.7, 0.4, 0.5, 'plata'), 0, 0.3, 0), en(caja(0.8, 0.02, 0.6, 'oro'), 0, 0.55, 0, -0.3));
        g.add(barra([0.2, 0.5, 0], [0.2, 1.3, 0], 0.02, 'blanco'), en(cil(0.12, 0.02, 0.5, 'blanco'), 0.2, 1.5, 0, 0, 0, 0.8));
        const rtg = en(cil(0.2, 0.2, 0.45, 'oscuro', 8), 3, 0.35, 1);
        for (let i = 0; i < 8; i++) rtg.add(en(caja(0.02, 0.4, 0.18, 'oscuro'), Math.cos(i * 0.785) * 0.25, 0, Math.sin(i * 0.785) * 0.25, 0, -i * 0.785));
        g.add(rtg);
        for (const [x, z] of [[-4, 2], [2, -5], [-3, -4]]) g.add(en(caja(0.4, 0.3, 0.4, 'oro'), x, 0.15, z), en(caja(0.5, 0.02, 0.5, 'blanco'), x, 0.32, z));
        return g;
    },
    camara_tv() {
        const g = new THREE.Group();
        for (let i = 0; i < 3; i++) { const a = i * 2.09; g.add(barra([Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4], [0, 1.2, 0], 0.015, 'plata')); }
        g.add(en(caja(0.25, 0.18, 0.4, 'gris'), 0, 1.3, 0));
        return g;
    },
    bolsas() {   // mochilas PLSS, botas y bolsas de basura que se tiraron por la escotilla
        const g = new THREE.Group();
        g.add(en(caja(0.66, 0.5, 0.25, 'blanco'), 0, 0.13, 0, -1.4, 0.4), en(caja(0.66, 0.5, 0.25, 'blanco'), 1.1, 0.13, 0.6, -1.5, -0.6));
        g.add(en(caja(0.35, 0.18, 0.15, 'tela'), -0.6, 0.09, 0.8, 0, 0.7), en(caja(0.35, 0.18, 0.15, 'tela'), -0.4, 0.09, 1.1, 0, 1.1));
        g.add(en(new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), mat('tela')), 0.5, 0.2, -0.7));
        return g;
    },
    placa() {
        const g = new THREE.Group();
        g.add(en(cil(0.04, 0.04, 0.01, 'plata', 20), 0, 0.01, 0), en(cil(0.02, 0.02, 0.005, 'oro', 12), 0.12, 0.005, 0.05), en(cil(0.02, 0.02, 0.005, 'oro', 12), -0.08, 0.005, 0.1));
        g.add(en(caja(0.08, 0.004, 0.06, 'blanco'), 0.05, 0.005, -0.1, 0, 0.4));
        return g;
    },
    lrv() {   // Lunar Roving Vehicle: 3,1 m de largo
        const g = new THREE.Group();
        g.add(en(caja(3.0, 0.12, 1.2, 'plata'), 0, 0.55, 0));
        for (const x of [-1.1, 1.1]) for (const z of [-0.9, 0.9]) {
            g.add(en(rueda(0.41, 0.23, 'plata'), x, 0.41, z));
            g.add(en(caja(0.9, 0.04, 0.3, 'gris'), x, 0.86, z, 0, 0, 0));   // guardabarros
        }
        for (const z of [-0.3, 0.3]) g.add(en(caja(0.5, 0.05, 0.5, 'oscuro'), 0.1, 0.75, z), en(caja(0.05, 0.5, 0.5, 'oscuro'), -0.15, 1.0, z));
        g.add(en(caja(0.3, 0.3, 0.5, 'blanco'), 1.2, 0.85, 0));
        g.add(barra([1.3, 0.9, 0.4], [1.3, 2.0, 0.4], 0.02, 'plata'));
        const antena = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.25, 16, 1, true), mat('oro'));
        g.add(en(antena, 1.3, 2.05, 0.4, Math.PI));
        g.add(en(caja(0.15, 0.12, 0.25, 'gris'), 1.55, 1.1, -0.35));   // cámara de TV
        return g;
    },
    surveyor() {   // ~3 m de alto, patas a 4,3 m
        const g = new THREE.Group();
        g.add(en(cil(0.55, 0.55, 0.5, 'blanco', 3), 0, 0.9, 0));
        patas(g, 3, 0.55, 0.9, 2.15, 0.3, 'plata', Math.PI / 2);
        g.add(barra([0, 1.1, 0], [0, 3.0, 0], 0.04, 'plata'));
        g.add(en(caja(0.9, 0.02, 1.1, 'panel'), 0.3, 3.0, 0, 0.6), en(caja(0.6, 0.02, 0.6, 'blanco'), -0.35, 2.7, 0.2, -0.5));
        g.add(en(caja(0.5, 0.35, 0.4, 'blanco'), 0.5, 1.25, 0.4), en(caja(0.4, 0.3, 0.3, 'oro'), -0.5, 1.25, -0.3));
        g.add(en(cil(0.12, 0.12, 0.4, 'gris'), 0.3, 1.5, -0.5));   // cámara (la del Surveyor 3 la trajo Apollo 12)
        return g;
    },
    lander_sovietico() {   // etapa de aterrizaje de Luna 17/21 con las rampas desplegadas
        const g = new THREE.Group();
        g.add(en(cil(1.6, 1.6, 0.12, 'gris', 12), 0, 1.05, 0));
        for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.785; g.add(en(new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10), mat('plata')), Math.cos(a) * 0.85, 0.65, Math.sin(a) * 0.85)); }
        patas(g, 4, 1.2, 0.8, 2.0, 0.3, 'gris', 0);
        for (const s of [-1, 1]) for (const z of [-0.4, 0.4]) g.add(en(caja(2.4, 0.04, 0.35, 'plata'), s * 2.3, 0.55, z, 0, 0, s * 0.42));
        return g;
    },
    lunokhod() {   // ~2,3 m de largo, ocho ruedas
        const g = new THREE.Group();
        const cuba = cil(0.75, 0.6, 1.9, 'oro', 16);
        cuba.rotation.z = Math.PI / 2; cuba.scale.set(1, 1, 0.55); cuba.position.y = 0.85;
        g.add(cuba);
        const tapa = en(caja(1.9, 0.04, 1.5, 'panel'), 0, 1.25, -0.75, 1.1);   // tapa abierta (paneles solares)
        g.add(tapa);
        for (const x of [-0.75, -0.25, 0.25, 0.75]) for (const z of [-0.8, 0.8]) g.add(en(rueda(0.25, 0.2, 'gris'), x, 0.25, z));
        g.add(barra([0.6, 1.2, 0.4], [0.7, 1.9, 0.4], 0.02, 'plata'), en(new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.4, 10), mat('plata')), 0.7, 2.0, 0.4));
        g.add(en(caja(0.12, 0.2, 0.3, 'cristal'), 1.05, 0.95, 0));   // retrorreflector francés
        return g;
    },

    // ───── Marte ─────
    pathfinder_lander({ escala = 1, mastil = true } = {}) {   // pétalos abiertos con airbags desinflados
        const g = new THREE.Group();
        g.add(en(cil(0.55, 0.55, 0.35, 'blanco', 3), 0, 0.2, 0));
        for (let i = 0; i < 3; i++) {
            const a = i * 2.094 + Math.PI / 3;
            const p = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.04, 3), mat('panel'));
            p.position.set(Math.cos(a) * 0.8, 0.06, Math.sin(a) * 0.8);
            p.rotation.y = -a + Math.PI;
            g.add(p);
            for (let k = 0; k < 4; k++) {
                const b = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), mat('airbag'));
                const aa = a + (k - 1.5) * 0.45;
                b.position.set(Math.cos(aa) * 1.4, 0.14, Math.sin(aa) * 1.4);
                b.scale.set(1.1, 0.4, 0.9);
                g.add(b);
            }
        }
        if (mastil) { g.add(barra([0, 0.35, 0], [0, 1.2, 0], 0.03, 'blanco')); g.add(en(caja(0.18, 0.2, 0.14, 'gris'), 0, 1.3, 0)); }
        g.add(en(caja(0.9, 0.02, 0.3, 'tela'), 1.35, 0.1, 0.2, 0, 0.3, 0.15));   // rampa
        g.scale.setScalar(escala);
        return g;
    },
    sojourner() {   // 0,65 m de largo
        const g = new THREE.Group();
        g.add(en(caja(0.5, 0.15, 0.4, 'oro'), 0, 0.2, 0), en(caja(0.65, 0.015, 0.48, 'panel'), 0, 0.3, 0));
        for (const x of [-0.25, 0, 0.25]) for (const z of [-0.24, 0.24]) g.add(en(rueda(0.065, 0.08), x, 0.065, z));
        g.add(barra([0.25, 0.3, 0.15], [0.25, 0.45, 0.15], 0.005, 'plata'));
        return g;
    },
    mer({ atrapado = false } = {}) {   // Spirit / Opportunity: 1,6 m de largo, 1,5 m de alto
        const g = new THREE.Group();
        g.add(en(caja(1.0, 0.4, 0.8, 'blanco'), 0, 0.55, 0));
        const deck = new THREE.Shape([[-0.8, -0.5], [0.8, -0.5], [0.8, 0.5], [0.2, 1.15], [-0.6, 1.15], [-0.8, 0.5]].map(([x, y]) => new THREE.Vector2(x, y)));
        for (const s of [1, -1]) {
            const ala = new THREE.Mesh(new THREE.ExtrudeGeometry(deck, { depth: 0.02, bevelEnabled: false }), mat(atrapado ? 'polvo' : 'panel'));
            ala.rotation.x = -Math.PI / 2; ala.scale.y = s; ala.position.y = 0.78;
            g.add(ala);
        }
        g.add(barra([0.4, 0.78, 0.25], [0.4, 1.45, 0.25], 0.03, 'blanco'), en(caja(0.12, 0.12, 0.32, 'gris'), 0.42, 1.5, 0.25));
        g.add(en(cil(0.14, 0.14, 0.02, 'gris'), -0.3, 0.95, -0.25, 0.3, 0, 0.2));
        for (const x of [-0.6, 0, 0.6]) for (const z of [-0.6, 0.6]) {
            g.add(en(rueda(0.13, 0.16, 'gris'), x, 0.13, z));
            g.add(barra([x, 0.13, z * 0.8], [x * 0.5, 0.45, z * 0.6], 0.02, 'plata'));
        }
        if (atrapado) { g.rotation.z = 0.08; g.position.y = -0.12; }
        return g;
    },
    escudo({ escala = 1 } = {}) {   // escudo térmico (MER/Pathfinder: 2,65 m de diámetro), arrugado tras el impacto
        const geo = new THREE.ConeGeometry(1.32, 0.5, 32, 3, true);
        const p = geo.attributes.position;
        let a = 13;
        for (let i = 0; i < p.count; i++) { a = (a * 16807) % 2147483647; const r = a / 2147483647; p.setY(i, p.getY(i) + (r - 0.5) * 0.18); }
        geo.computeVertexNormals();
        const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x3a2a20, roughness: 0.9, side: THREE.DoubleSide }));
        m.rotation.set(Math.PI + 0.5, 0, 0.3); m.position.y = 0.5;
        const g = new THREE.Group(); g.add(m); g.scale.setScalar(escala);
        return g;
    },
    coraza_paracaidas({ radioParacaidas = 6 } = {}) {   // coraza trasera volcada y el paracaídas extendido
        const g = new THREE.Group();
        g.add(en(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1.3, 1.0, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0xdedad2, roughness: 0.7, side: THREE.DoubleSide })), 0, 0.95, 0, 0, 0, 1.25));
        const geo = new THREE.CircleGeometry(radioParacaidas, 24, 0, Math.PI * 1.6);
        geo.rotateX(-Math.PI / 2);
        const p = geo.attributes.position;
        for (let i = 0; i < p.count; i++) p.setY(i, 0.08 + 0.12 * Math.sin(p.getX(i) * 1.3) * Math.cos(p.getZ(i) * 1.1));
        geo.computeVertexNormals();
        const tela = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xf2eee6, roughness: 0.95, side: THREE.DoubleSide }));
        tela.position.set(radioParacaidas + 5, 0, 2);
        g.add(tela);
        for (const z of [-0.6, 0, 0.6]) g.add(barra([1, 0.1, z], [6, 0.05, 2 + z * 3], 0.01, 'blanco'));
        return g;
    },
    phoenix() {   // plataforma de 1,5 m, paneles de 1,8 m; uno quedó roto por el hielo
        const g = new THREE.Group();
        g.add(en(cil(0.75, 0.75, 0.35, 'oro', 10), 0, 1.0, 0));
        patas(g, 3, 0.6, 0.9, 1.1, 0.2, 'plata', 0.3);
        const panel = (roto) => {
            const p = new THREE.Mesh(new THREE.CircleGeometry(0.9, 10), new THREE.MeshStandardMaterial({ color: 0x1b2a55, metalness: 0.4, roughness: 0.4, side: THREE.DoubleSide }));
            p.rotation.x = -Math.PI / 2;
            if (roto) { p.rotation.x = -Math.PI / 2 + 0.6; p.rotation.y = 0.2; }
            return p;
        };
        g.add(en(panel(false), 0, 1.15, 1.6));
        const roto = panel(true); roto.position.set(0, 0.75, -1.55); g.add(roto);
        g.add(barra([0.6, 1.1, 0], [1.8, 1.4, 0.2], 0.04, 'blanco'), barra([1.8, 1.4, 0.2], [2.3, 0.1, 0.3], 0.04, 'blanco'), en(caja(0.15, 0.2, 0.25, 'plata'), 2.3, 0.15, 0.3));
        g.add(barra([-0.3, 1.2, 0.2], [-0.3, 2.0, 0.2], 0.03, 'blanco'), en(caja(0.18, 0.15, 0.15, 'gris'), -0.3, 2.05, 0.2));
        return g;
    },
    viking() {   // cuerpo hexagonal, 3 patas, 2 RTG y antena de alta ganancia
        const g = new THREE.Group();
        g.add(en(cil(0.75, 0.75, 0.45, 'blanco', 6), 0, 0.8, 0));
        patas(g, 3, 0.7, 0.7, 1.4, 0.25, 'gris', 0);
        for (const s of [-1, 1]) g.add(en(cil(0.18, 0.18, 0.5, 'oscuro', 8), 0.3 * s, 1.25, -0.35 * s));
        g.add(barra([0, 1.0, 0.4], [0, 1.9, 0.5], 0.03, 'blanco'), en(new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.05, 0.12, 20, 1, true), mat('blanco')), 0, 2.0, 0.55, -0.9));
        g.add(barra([0.6, 0.85, 0], [1.6, 0.6, 0.2], 0.03, 'naranja'), en(cil(0.1, 0.1, 0.3, 'gris'), -0.4, 1.25, 0.4));
        return g;
    },
    insight() {   // paneles de 2,2 m; el sismómetro SEIS va aparte bajo su cúpula
        const g = new THREE.Group();
        g.add(en(cil(0.78, 0.78, 0.3, 'blanco', 12), 0, 0.95, 0));
        patas(g, 3, 0.6, 0.85, 1.0, 0.2, 'plata', 0.5);
        for (const s of [-1, 1]) {
            const p = new THREE.Mesh(new THREE.CircleGeometry(1.1, 10), new THREE.MeshStandardMaterial({ color: 0x223060, metalness: 0.4, roughness: 0.5, side: THREE.DoubleSide }));
            p.rotation.x = -Math.PI / 2; p.position.set(0, 1.05, s * 1.85); g.add(p);
        }
        g.add(barra([0.6, 1.1, 0], [1.4, 1.5, 0], 0.04, 'naranja'), barra([1.4, 1.5, 0], [1.8, 0.6, 0], 0.04, 'naranja'));
        return g;
    },
    sismometro_cupula() {
        const g = new THREE.Group();
        g.add(en(new THREE.Mesh(new THREE.SphereGeometry(0.36, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat('blanco')), 0, 0, 0));
        g.add(en(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.02, 24), mat('oro')), 0, 0.01, 0));
        return g;
    },
    topo() {
        const g = new THREE.Group();
        g.add(en(caja(0.3, 0.4, 0.3, 'oro'), 0, 0.2, 0), barra([0, 0.05, 0.15], [-1.2, 0.02, 0.6], 0.01, 'blanco'));
        return g;
    },
    roca({ tam = 0.5 } = {}) {
        const m = new THREE.Mesh(new THREE.DodecahedronGeometry(tam, 0), new THREE.MeshStandardMaterial({ color: 0x6e5a4a, roughness: 1, flatShading: true }));
        m.scale.set(1.2, 0.7, 1); m.position.y = tam * 0.35;
        const g = new THREE.Group(); g.add(m);
        return g;
    },
    zanja() {
        const g = new THREE.Group();
        g.add(en(new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.3), new THREE.MeshStandardMaterial({ color: 0x3a2a22, roughness: 1 })), 0, 0.015, 0, -Math.PI / 2));
        g.add(en(new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.18), new THREE.MeshStandardMaterial({ color: 0xe8eef2, roughness: 0.6 })), 0.05, 0.02, 0.02, -Math.PI / 2));
        return g;
    },
    marca() { return new THREE.Group(); },   // solo etiqueta (p. ej. un cráter)
    perseverance() { const g = D.mer(); g.scale.setScalar(1.6); return g; },   // respaldo si no carga el .glb
    ingenuity() {
        const g = new THREE.Group();
        g.add(en(caja(0.14, 0.14, 0.14, 'oro'), 0, 0.18, 0));
        for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.785; g.add(barra([0, 0.15, 0], [Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2], 0.008, 'gris')); }
        g.add(barra([0, 0.25, 0], [0, 0.45, 0], 0.01, 'gris'), en(caja(1.2, 0.01, 0.06, 'oscuro'), 0, 0.4, 0), en(caja(1.2, 0.01, 0.06, 'oscuro'), 0, 0.44, 0, 0, 1.2));
        g.add(en(caja(0.18, 0.01, 0.12, 'panel'), 0, 0.47, 0));
        return g;
    },
    fragmento() {   // trozo de pala de rotor
        const g = new THREE.Group();
        g.add(en(caja(0.3, 0.01, 0.07, 'oscuro'), 0, 0.01, 0, 0, 0.5, 0.05));
        return g;
    },

    // ───── En órbita ─────
    orbitador({ alas = 2, color = 'oro' } = {}) {
        const g = new THREE.Group();
        g.add(caja(1.5, 1.5, 1.5, color));
        for (let i = 0; i < alas; i++) g.add(en(caja(0.05, 1.4, 4, 'panel'), 0, 0, (i ? -1 : 1) * 2.8));
        g.add(en(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.1, 0.3, 18, 1, true), mat('blanco')), 1.1, 0, 0, 0, 0, Math.PI / 2));
        return g;
    },
};

export function crearModelo(tipo, opciones = {}) {
    const f = D[tipo] ?? D.marca;
    const g = f(opciones);
    g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    return g;
}

// ───── Modelos 3D reales (public/models) ─────
// Si un .glb no carga, se usa el modelo procedural de arriba. Cada uno se normaliza a su tamaño real
// (metros), con la base en y = 0 y centrado en X/Z.

export const REALES = {
    lrv: { url: '/models/buggy_lunar.glb', eje: 'z', medida: 3.1, rotY: Math.PI / 2 },   // Lunar Roving Vehicle: 3,1 m de largo
    mer: { url: '/models/mer.glb', eje: 'y', medida: 1.5, desplegar: true, ocultar: ['_root'] },   // Spirit / Opportunity: 1,5 m de alto
    perseverance: { url: '/models/perseverance.glb', eje: 'z', medida: 3.0 },   // 3 m de largo
    ingenuity: { url: '/models/ingenuity.glb', eje: 'y', medida: 0.49 },       // 49 cm de alto
};
const plantillas = new Map();

async function plantilla(tipo) {
    if (!plantillas.has(tipo)) {
        plantillas.set(tipo, (async () => {
            const cfg = REALES[tipo];
            const gltf = await cargarGLB(cfg.url);
            const escena = gltf.scene.clone(true);
            if (cfg.desplegar && gltf.animations.length) {
                // el modelo viene plegado (como viajó dentro del lander): se reproducen sus animaciones hasta el final
                const mezcla = new THREE.AnimationMixer(escena);
                let fin = 0;
                for (const clip of gltf.animations) {
                    const a = mezcla.clipAction(clip);
                    a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; a.play();
                    fin = Math.max(fin, clip.duration);
                }
                mezcla.setTime(fin);
            }
            escena.traverse((o) => {
                if (o.isMesh && cfg.ocultar?.includes(o.name)) o.geometry = new THREE.BufferGeometry();   // cubo auxiliar del modelo
                if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
            });
            escena.updateMatrixWorld(true);
            const caja = new THREE.Box3().setFromObject(escena);
            const tam = caja.getSize(new THREE.Vector3());
            escena.scale.setScalar(cfg.medida / tam[cfg.eje]);
            const caja2 = new THREE.Box3().setFromObject(escena);
            const c = caja2.getCenter(new THREE.Vector3());
            escena.position.set(-c.x, -caja2.min.y, -c.z);
            const g = new THREE.Group();
            g.add(escena);
            g.rotation.y = cfg.rotY ?? 0;
            const final = new THREE.Group();
            final.add(g);
            return final;
        })());
    }
    return plantillas.get(tipo);
}

// Precarga los modelos reales que necesita una lista de tipos (los que fallen se ignoran)
export async function precargarReales(tipos) {
    const usados = [...new Set(tipos)].filter((t) => REALES[t]);
    await Promise.all(usados.map((t) => plantilla(t).catch((e) => { console.warn(`Modelo ${t} no disponible, se usa el procedural:`, e.message); plantillas.set(t, Promise.resolve(null)); })));
}

// Igual que crearModelo, pero con el .glb real si ya está precargado
export async function crearModeloReal(tipo, opciones = {}) {
    const p = REALES[tipo] ? await plantilla(tipo).catch(() => null) : null;
    if (!p) return crearModelo(tipo, opciones);
    const g = p.clone(true);
    if (opciones.atrapado) { g.rotation.z = 0.08; g.position.y = -0.12; }   // Spirit, hundido en la arena de "Troy"
    return g;
}
