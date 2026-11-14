import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Reutilizado de nasa_space_apps: la pantalla gigante muestra la escena activa del simulador.
export const pantallaGiganteTarget = new THREE.WebGLRenderTarget(1280, 720, { samples: 4 });

// ───────────── utilidades ─────────────
function mulberry32(a) { // aleatorio con semilla: la sala se ve igual en cada carga
    return () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const rnd = mulberry32(1969);

function lienzo(w, h) {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    const textura = new THREE.CanvasTexture(canvas);
    textura.colorSpace = THREE.SRGBColorSpace; // sin esto los colores se ven lavados
    textura.anisotropy = 4;
    return { canvas, ctx, textura };
}

function repetir(tex, x, y) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(x, y);
    return tex;
}

function texturaSuelo() {
    const { ctx, textura } = lienzo(128, 128);
    ctx.fillStyle = '#242b2e'; ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 500; i++) {
        ctx.fillStyle = `rgba(255,255,255,${rnd() * 0.04})`;
        ctx.fillRect(rnd() * 128, rnd() * 128, 2, 2);
    }
    ctx.strokeStyle = '#161b1d'; ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, 128, 128);
    return repetir(textura, 8, 8);
}

function texturaTecho() { // el famoso techo de paneles luminosos
    const { ctx, textura } = lienzo(128, 128);
    ctx.fillStyle = '#9d977f'; ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#fff3cf'; ctx.fillRect(10, 10, 108, 108);
    ctx.strokeStyle = '#6f6a58'; ctx.lineWidth = 4; ctx.strokeRect(10, 10, 108, 108);
    return repetir(textura, 8, 7);
}

function texturaPanel() { // botones y luces de la consola
    const { ctx, textura } = lienzo(256, 96);
    ctx.fillStyle = '#1f2a29'; ctx.fillRect(0, 0, 256, 96);
    const paleta = ['#d63a2f', '#e8a317', '#3fcf5b', '#d9d9d9', '#3d8bff'];
    for (let fila = 0; fila < 5; fila++) {
        for (let c = 0; c < 22; c++) {
            ctx.fillStyle = rnd() > 0.35 ? paleta[Math.floor(rnd() * paleta.length)] : '#33403e';
            ctx.fillRect(8 + c * 11, 8 + fila * 17, 8, 11);
        }
    }
    return textura;
}

function texturaDatos() { // pantallas CRT con datos que se desplazan
    const { ctx, textura } = lienzo(128, 256);
    ctx.fillStyle = '#031006'; ctx.fillRect(0, 0, 128, 256);
    ctx.fillStyle = '#3cff6a'; ctx.font = '10px monospace';
    for (let y = 12; y < 256; y += 12) {
        const linea = Array.from({ length: 4 }, () => Math.floor(rnd() * 255).toString(16).toUpperCase().padStart(2, '0')).join(' ');
        ctx.fillText(linea, 6, y);
    }
    return repetir(textura, 1, 0.5);
}

// ───────────── geometrías y materiales compartidos ─────────────
const G = {
    cuerpo: new THREE.BoxGeometry(1.8, 0.78, 0.8),
    panel: new THREE.PlaneGeometry(1.7, 0.45),
    crt: new THREE.BoxGeometry(0.55, 0.42, 0.42),
    crtPantalla: new THREE.PlaneGeometry(0.45, 0.32),
    lampara: new THREE.SphereGeometry(0.025, 8, 6),
    asiento: new THREE.CylinderGeometry(0.23, 0.23, 0.06, 12),
    poste: new THREE.CylinderGeometry(0.04, 0.04, 0.45, 6),
    respaldo: new THREE.BoxGeometry(0.5, 0.55, 0.07),
    torso: new THREE.CylinderGeometry(0.17, 0.2, 0.55, 10),
    hombros: new THREE.BoxGeometry(0.46, 0.12, 0.2),
    cabeza: new THREE.SphereGeometry(0.11, 10, 8),
    pelo: new THREE.SphereGeometry(0.115, 10, 8, 0, Math.PI * 2, 0, Math.PI / 1.9)
};
const M = {
    consola: new THREE.MeshStandardMaterial({ color: 0x3f5f57, roughness: 0.55 }),
    madera: new THREE.MeshStandardMaterial({ color: 0x6e472b, roughness: 0.6 }),
    crt: new THREE.MeshStandardMaterial({ color: 0x1a1d1c, roughness: 0.8 }),
    silla: new THREE.MeshStandardMaterial({ color: 0x15191a, roughness: 0.9 }),
    camisa: new THREE.MeshStandardMaterial({ color: 0xe9e9e4, roughness: 0.9 }),
    piel: new THREE.MeshStandardMaterial({ color: 0xd2a581, roughness: 0.8 }),
    pelo: new THREE.MeshStandardMaterial({ color: 0x1b1410, roughness: 1 })
};

// ───────────── construcción de la sala ─────────────
export function construirSala(sceneSala, NOMBRES_ETAPAS) {
    sceneSala.fog = new THREE.Fog(0x070b0d, 10, 26);

    // Luces propias de la sala
    sceneSala.add(new THREE.HemisphereLight(0xcfe0ff, 0x1a1208, 0.55));
    const luzTecho = new THREE.PointLight(0xfff0d0, 45, 20, 2);
    luzTecho.position.set(0, 6.5, -2);
    sceneSala.add(luzTecho);
    const luzPantalla = new THREE.PointLight(0x7dffa8, 8, 12, 2);
    luzPantalla.position.set(0, 3.6, -7.5);
    sceneSala.add(luzPantalla);

    const sala = new THREE.Group();     // todo lo "decorativo" (se puede reemplazar por un GLB)
    const pantallas = new THREE.Group(); // lo que muestra datos
    sceneSala.add(sala, pantallas);

    const matSuelo = new THREE.MeshStandardMaterial({ map: texturaSuelo(), roughness: 0.9 });
    const matPared = new THREE.MeshStandardMaterial({ color: 0x35454a, roughness: 0.85 });
    const caja = (w, h, d, mat, x, y, z) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.set(x, y, z);
        sala.add(m);
        return m;
    };

    // Suelo escalonado: la plataforma del usuario y tres filas más bajas hacia la pantalla
    const FONDO = -1.3;
    const niveles = [
        { zMin: -1.65, zMax: 4.0, top: 0 },
        { zMin: -3.25, zMax: -1.65, top: -0.3 },
        { zMin: -4.85, zMax: -3.25, top: -0.6 },
        { zMin: -6.45, zMax: -4.85, top: -0.9 },
        { zMin: -9.4, zMax: -6.45, top: -1.2 }
    ];
    for (const n of niveles) {
        const h = n.top - FONDO;
        caja(16.4, h, n.zMax - n.zMin, matSuelo, 0, n.top - h / 2, (n.zMin + n.zMax) / 2);
    }

    // Paredes y techo
    const ALTO = 7.6;
    const plano = (w, h, mat, x, y, z, ry = 0, rx = 0) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
        m.position.set(x, y, z); m.rotation.set(rx, ry, 0);
        sala.add(m);
        return m;
    };
    plano(16.4, ALTO + 1.3, matPared, 0, (ALTO + FONDO) / 2, -9.4);                  // frente
    plano(13.4, ALTO + 1.3, matPared, 0, (ALTO + FONDO) / 2, 4.0, Math.PI);           // fondo
    plano(13.4, ALTO + 1.3, matPared, -8.2, (ALTO + FONDO) / 2, -2.7, Math.PI / 2);   // izquierda
    plano(13.4, ALTO + 1.3, matPared, 8.2, (ALTO + FONDO) / 2, -2.7, -Math.PI / 2);   // derecha
    plano(16.4, 13.4, new THREE.MeshBasicMaterial({ map: texturaTecho(), color: 0xc9c2a6 }), 0, ALTO, -2.7, 0, Math.PI / 2);

    // Placas en las paredes
    const rotulo = lienzo(1024, 256);
    rotulo.ctx.fillStyle = '#1d2a2d'; rotulo.ctx.fillRect(0, 0, 1024, 256);
    rotulo.ctx.strokeStyle = '#b9b08a'; rotulo.ctx.lineWidth = 6; rotulo.ctx.strokeRect(12, 12, 1000, 232);
    rotulo.ctx.fillStyle = '#e6dfc0'; rotulo.ctx.textAlign = 'center';
    rotulo.ctx.font = 'bold 54px Georgia, serif';
    rotulo.ctx.fillText('MISSION OPERATIONS', 512, 105);
    rotulo.ctx.fillText('CONTROL ROOM', 512, 170);
    rotulo.ctx.font = '28px Georgia, serif';
    rotulo.ctx.fillText('MANNED SPACECRAFT CENTER · HOUSTON', 512, 220);
    rotulo.textura.needsUpdate = true;
    plano(5, 1.25, new THREE.MeshBasicMaterial({ map: rotulo.textura }), 8.15, 3.8, -3.5, -Math.PI / 2);

    const cita = lienzo(1024, 384);
    cita.ctx.fillStyle = '#1d2a2d'; cita.ctx.fillRect(0, 0, 1024, 384);
    cita.ctx.strokeStyle = '#b9b08a'; cita.ctx.lineWidth = 6; cita.ctx.strokeRect(12, 12, 1000, 360);
    cita.ctx.fillStyle = '#e6dfc0'; cita.ctx.textAlign = 'center';
    cita.ctx.font = 'italic 46px Georgia, serif';
    cita.ctx.fillText('“Houston, Tranquility Base here.', 512, 150);
    cita.ctx.fillText('The Eagle has landed.”', 512, 215);
    cita.ctx.font = '30px Georgia, serif';
    cita.ctx.fillText('20 de julio de 1969', 512, 300);
    cita.textura.needsUpdate = true;
    plano(4, 1.5, new THREE.MeshBasicMaterial({ map: cita.textura }), -8.15, 3.8, -3.5, Math.PI / 2);

    // ───── Consolas con operadores ─────
    const texPanel = texturaPanel();
    const matPanel = new THREE.MeshBasicMaterial({ map: texPanel });
    const texCRT = [texturaDatos(), texturaDatos(), texturaDatos()];
    const matCRT = texCRT.map((t) => new THREE.MeshBasicMaterial({ map: t }));
    const lamparas = [];
    const colores = [0xff3b30, 0xffb020, 0x3cff6a];

    function crearConsola(conOperador) {
        const g = new THREE.Group();
        const parte = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };

        parte(G.cuerpo, M.consola, 0, 0.39, -0.45);
        const panel = parte(G.panel, matPanel, 0, 0.8, -0.2);
        panel.rotation.x = -Math.PI / 2 + 0.5; // inclinado hacia el operador

        for (let i = 0; i < 4; i++) {
            const mat = new THREE.MeshBasicMaterial({ color: colores[i % 3] });
            lamparas.push({ mat, base: new THREE.Color(colores[i % 3]), fase: rnd() * 6, vel: 1 + rnd() * 3 });
            parte(G.lampara, mat, -0.6 + i * 0.4, 0.86, -0.1);
        }
        for (const x of [-0.5, 0.5]) {
            parte(G.crt, M.crt, x, 0.99, -0.62);
            parte(G.crtPantalla, matCRT[Math.floor(rnd() * 3)], x, 0.99, -0.405);
        }
        parte(G.poste, M.silla, 0, 0.24, 0.35);
        parte(G.asiento, M.silla, 0, 0.48, 0.35);
        parte(G.respaldo, M.silla, 0, 0.82, 0.62);

        if (conOperador) {
            parte(G.torso, M.camisa, 0, 0.82, 0.38);
            parte(G.hombros, M.camisa, 0, 1.06, 0.38);
            parte(G.cabeza, M.piel, 0, 1.27, 0.38);
            const pelo = parte(G.pelo, M.pelo, 0, 1.285, 0.38);
            pelo.rotation.x = -0.15;
        }
        return g;
    }

    const filas = [
        { z: -2.45, y: -0.3 },
        { z: -4.05, y: -0.6 },
        { z: -5.65, y: -0.9 }
    ];
    const xs = [-5.3, -3.3, -1.3, 1.3, 3.3, 5.3];
    for (const f of filas) {
        for (const x of xs) {
            const c = crearConsola(rnd() > 0.3);
            c.position.set(x, f.y, f.z);
            sala.add(c);
        }
    }

    // Escritorio del usuario (puesto desde donde miras)
    caja(3.0, 0.82, 1.0, M.consola, 0, 0.41, -0.85);
    caja(3.3, 0.06, 1.15, M.madera, 0, 0.85, -0.8);

    // ───── Pantallas con datos ─────
    const pantalla = (w, h, tex, x, y, z) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
        m.position.set(x, y, z);
        pantallas.add(m);
        return m;
    };
    const marco = (w, h, x, y, z) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: 0x1a3a22 }));
        m.position.set(x, y, z);
        pantallas.add(m);
    };

    marco(10.4, 6.0, 0, 3.6, -9.05);
    pantalla(10, 5.625, pantallaGiganteTarget.texture, 0, 3.6, -9);

    const lienzoTrayectoria = lienzo(512, 384);
    const lienzoEtapas = lienzo(512, 384);
    marco(2.8, 2.15, -6.75, 3.6, -9.05); pantalla(2.6, 1.95, lienzoTrayectoria.textura, -6.75, 3.6, -9);
    marco(2.8, 2.15, 6.75, 3.6, -9.05);  pantalla(2.6, 1.95, lienzoEtapas.textura, 6.75, 3.6, -9);

    const relojGMT = lienzo(384, 144);
    const relojMET = lienzo(384, 144);
    pantalla(2.6, 0.98, relojGMT.textura, -2.0, 6.85, -9);
    pantalla(2.6, 0.98, relojMET.textura, 2.0, 6.85, -9);

    // Monitor de telemetría sobre tu escritorio
    const monitor = lienzo(512, 384);
    const monitorMesh = pantalla(0.75, 0.55, monitor.textura, -0.6, 1.2, -0.9);
    monitorMesh.rotation.y = 0.25;
    monitorMesh.rotation.x = -0.1;

    // ───── Dibujo de las pantallas ─────
    const VERDE = '#4af626';
    function reloj(l, titulo, texto) {
        const { ctx, canvas, textura } = l;
        ctx.fillStyle = '#050805'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#2d8a1c'; ctx.lineWidth = 4; ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
        ctx.fillStyle = '#7bd96a'; ctx.font = '22px Courier New, monospace'; ctx.textAlign = 'left';
        ctx.fillText(titulo, 16, 32);
        ctx.fillStyle = '#ff5a2a'; ctx.font = 'bold 54px Courier New, monospace'; ctx.textAlign = 'center';
        ctx.fillText(texto, canvas.width / 2, 108);
        textura.needsUpdate = true;
    }

    function dibujarTrayectoria(estado) {
        const { ctx, canvas, textura } = lienzoTrayectoria;
        ctx.fillStyle = '#041008'; ctx.fillRect(0, 0, 512, 384);
        ctx.strokeStyle = VERDE; ctx.lineWidth = 3; ctx.strokeRect(6, 6, 500, 372);
        ctx.fillStyle = VERDE; ctx.font = 'bold 24px Courier New, monospace'; ctx.textAlign = 'left';
        ctx.fillText('TRAYECTORIA', 22, 40);

        const A = { x: 70, y: 290 }, B = { x: 440, y: 290 }, C = { x: 255, y: 90 };
        ctx.strokeStyle = '#1f6d14'; ctx.lineWidth = 1;
        for (let i = 1; i < 8; i++) { ctx.beginPath(); ctx.moveTo(20 + i * 59, 60); ctx.lineTo(20 + i * 59, 360); ctx.stroke(); }
        ctx.setLineDash([8, 8]); ctx.strokeStyle = VERDE; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.quadraticCurveTo(C.x, C.y - 70, B.x, B.y); ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#2b78ff'; ctx.beginPath(); ctx.arc(A.x, A.y, 30, 0, 7); ctx.fill();
        ctx.fillStyle = '#c9c9c9'; ctx.beginPath(); ctx.arc(B.x, B.y, 11, 0, 7); ctx.fill();
        ctx.fillStyle = VERDE; ctx.font = '18px Courier New, monospace'; ctx.textAlign = 'center';
        ctx.fillText('TIERRA', A.x, A.y + 52); ctx.fillText('LUNA', B.x, B.y + 32);

        const p = Math.min(1, Math.max(0, estado.progreso / 100));
        const px = (1 - p) ** 2 * A.x + 2 * (1 - p) * p * C.x + p * p * B.x;
        const py = (1 - p) ** 2 * A.y + 2 * (1 - p) * p * (C.y - 70) + p * p * B.y;
        ctx.fillStyle = '#ffb020'; ctx.beginPath(); ctx.arc(px, py, 7, 0, 7); ctx.fill();
        ctx.strokeStyle = '#ffb020'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, 13, 0, 7); ctx.stroke();
        ctx.fillStyle = VERDE; ctx.textAlign = 'left'; ctx.font = '20px Courier New, monospace';
        ctx.fillText(`${estado.progreso}%  ${estado.altitud.toLocaleString()} km`, 22, 362);
        textura.needsUpdate = true;
    }

    function dibujarEtapas(estado) {
        const { ctx, textura } = lienzoEtapas;
        ctx.fillStyle = '#041008'; ctx.fillRect(0, 0, 512, 384);
        ctx.strokeStyle = VERDE; ctx.lineWidth = 3; ctx.strokeRect(6, 6, 500, 372);
        ctx.fillStyle = VERDE; ctx.font = 'bold 24px Courier New, monospace'; ctx.textAlign = 'left';
        ctx.fillText(estado.tituloEtapas ?? 'SECUENCIA DE MISIÓN', 22, 40);
        const lista = estado.fases ?? NOMBRES_ETAPAS;
        const actual = lista.indexOf(estado.etapaActual);
        const desde = Math.max(0, Math.min(lista.length - 8, actual - 3)); // ventana de 8 fases
        ctx.font = '19px Courier New, monospace';
        lista.slice(desde, desde + 8).forEach((n, k) => {
            const i = desde + k;
            const y = 82 + k * 38;
            if (i === actual) { ctx.fillStyle = '#17501a'; ctx.fillRect(16, y - 22, 480, 32); }
            ctx.fillStyle = i < actual ? '#2d8a1c' : i === actual ? '#ffb020' : '#3b6b34';
            ctx.fillText(`${i < actual ? '✔' : i === actual ? '▶' : '·'} ${n.replace(/_/g, ' ')}`, 28, y);
        });
        textura.needsUpdate = true;
    }

    function dibujarMonitor(estado) {
        const { ctx, canvas, textura } = monitor;
        ctx.fillStyle = '#071108'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = VERDE; ctx.lineWidth = 4; ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
        ctx.fillStyle = VERDE; ctx.textAlign = 'left';
        ctx.font = 'bold 28px Courier New, monospace'; ctx.fillText('TELEMETRÍA HOUSTON', 30, 55);
        ctx.font = '22px Courier New, monospace';
        ctx.fillText(`FASE: ${estado.etapaActual.replace(/_/g, ' ')}`, 30, 115);
        ctx.fillText(`ALTITUD: ${estado.altitud.toLocaleString()} ${estado.unidadAlt ?? 'km'}`, 30, 165);
        ctx.fillText(`VEL: ${estado.velocidad.toLocaleString()} ${estado.unidadVel ?? 'km/h'}`, 30, 215);
        ctx.fillText(`PROGRESO: ${estado.progreso} %`, 30, 265);
        ctx.fillText(`MET: ${estado.met}`, 30, 315);
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; // líneas de barrido
        for (let y = 0; y < canvas.height; y += 4) ctx.fillRect(0, y, canvas.width, 2);
        textura.needsUpdate = true;
    }

    // ───── Sala externa opcional (GLB descargado) ─────
    // Si pones un modelo en /public/models/sala_control.glb reemplaza la sala procedural
    // (las pantallas y el monitor se mantienen). Ajusta escala/posición según el modelo.
    new GLTFLoader().loadAsync('/models/sala_control.glb').then((gltf) => {
        sala.visible = false;
        sceneSala.add(gltf.scene);
    }).catch(() => { /* no existe: se queda la sala procedural */ });

    // ───── API que usa main.js ─────
    return {
        actualizar(estado) {
            dibujarMonitor(estado);
            dibujarTrayectoria(estado);
            dibujarEtapas(estado);
            reloj(relojGMT, 'GMT', estado.reloj.split(' ')[1]);
            reloj(relojMET, 'MET', estado.met);
        },
        animar(t) {
            for (const l of lamparas) {
                l.mat.color.copy(l.base).multiplyScalar(0.25 + 0.75 * Math.abs(Math.sin(t * l.vel + l.fase)));
            }
            texCRT[0].offset.y = (t * 0.05) % 1;
            texCRT[1].offset.y = (t * 0.08) % 1;
            texCRT[2].offset.y = (t * 0.03) % 1;
        }
    };
}
