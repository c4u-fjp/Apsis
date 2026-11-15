// Abandoned but not Forgotten · Apsis
//
// Flujo: sala de Control de Misión (elegir destino) -> pantalla de lanzamiento (Saturn V o Delta II)
//        -> despegue siguiendo al cohete -> al llegar al espacio, la sala de control con la trayectoria
//        hacia la Luna o Marte -> los restos que quedaron allí.
//
// Este archivo es el "armazón": renderer, entrada, HUD, sala de control, plataforma y bucle.
// Cada destino es un controlador en src/misiones/ (lunar.js, marte.js) que se carga al elegirlo.
import './style.css';
import './portada.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/800.css';
import '@fontsource/montserrat/500.css';
import '@fontsource/montserrat/700.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createRenderer, handleResize, startLoop } from './core/renderer.js';
import { createInput } from './core/input.js';
import { crearHUD } from './core/hud.js';
import { crearPanelVR } from './core/panelVR.js';
import { crearModoCardboard } from './core/modoCardboard.js';
import { construirSala, pantallaGiganteTarget } from './escenas/centroControl.js';
import { EscenaPlataforma } from './escenas/plataforma.js';
import { crearEstrellas, texturaMarte } from './modelos/efectos.js';
import marte from './data/marte.json';
import { sonido } from './core/audio.js';

const $ = (id) => document.getElementById(id);

function progreso(f, txt) {
    $('carga').classList.remove('fuera');
    $('carga-barra').style.width = `${Math.round(f * 100)}%`;
    if (txt) $('carga-texto').textContent = txt;
}

async function iniciar() {
    const contenedor = $('monitor-3d');
    const renderer = createRenderer(contenedor);
    const hud = crearHUD();
    const input = createInput(renderer);

    // ── Sala de Control de Misión (de nasa_space_apps): fondo del inicio y vista de seguimiento ──
    const sceneSala = new THREE.Scene();
    sceneSala.background = new THREE.Color(0x070b0d);
    const camSala = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camSala.position.set(0, 1.6, 1.2);
    const rigSala = new THREE.Group();
    sceneSala.add(rigSala);
    const ctrlSala = new OrbitControls(camSala, renderer.domElement);
    Object.assign(ctrlSala, { enableDamping: true, enablePan: false, minDistance: 1.5, maxDistance: 4.5, minAzimuthAngle: -1, maxAzimuthAngle: 1, minPolarAngle: 0.8, maxPolarAngle: 1.8 });
    ctrlSala.target.set(0, 1.4, -2);
    ctrlSala.enabled = false;
    const sala = construirSala(sceneSala, []);

    const panelVR = crearPanelVR();
    const plataforma = new EscenaPlataforma({ renderer });
    const camaras = new Set([camSala, plataforma.camera]);
    const ajustar = handleResize(renderer, contenedor, () => [...camaras]);

    const base = {
        renderer, contenedor, hud, input, sala, sceneSala, camSala, rigSala, ctrlSala, panelVR, plataforma, progreso,
        vista: 'escena', cardboard: null,
        registrarCamara(c) { camaras.add(c); ajustar(); },
        pantallaCompleta(v) { document.body.classList.toggle('pantalla-completa', v); requestAnimationFrame(ajustar); },
        controles(escenas, activa) {
            const libre = !renderer.xr.isPresenting && !base.cardboard?.activo;
            for (const e of escenas) e.controls.enabled = libre && base.vista === 'escena' && e === activa;
            ctrlSala.enabled = libre && base.vista === 'sala';
            $('btn-sala').classList.toggle('activo', base.vista === 'sala');
        },
        // Dibuja la escena activa directamente o en la pantalla gigante de la sala
        render(escena, estadoSala = null, tReal = 0) {
            escena.antesDeRender?.();
            if (base.vista === 'sala') {
                if (estadoSala) sala.actualizar(estadoSala);
                sala.animar(tReal);
                if (ctrlSala.enabled) ctrlSala.update();
                pantalla(escena.scene, escena.camera);
                camSala.userData.qBase = null;
                base.cardboard.render(sceneSala, camSala);
            } else {
                escena.camera.userData.qBase = escena.camera.quaternion.clone();
                base.cardboard.render(escena.scene, escena.camera);
            }
        },
        volverAlInicio() { mostrarInicio(); },
    };

    function pantalla(scene, cam) {
        const aspecto = cam.aspect;
        cam.aspect = 16 / 9; cam.updateProjectionMatrix();
        const xr = renderer.xr.enabled, previo = renderer.getRenderTarget();
        renderer.xr.enabled = false;
        renderer.setRenderTarget(pantallaGiganteTarget);
        renderer.render(scene, cam);
        renderer.setRenderTarget(previo);
        renderer.xr.enabled = xr;
        cam.aspect = aspecto; cam.updateProjectionMatrix();
    }

    base.cardboard = crearModoCardboard({
        renderer, contenedor,
        alEntrarCardboard: () => modo?.controles?.(), alSalirCardboard: () => modo?.controles?.(),
    });
    renderer.xr.addEventListener('sessionstart', () => {
        rigSala.add(camSala);
        camSala.position.set(0, 0, 0);
        camSala.quaternion.identity();
        rigSala.position.set(0, 1.0, 1.2);
        modo?.controles?.();
    });
    renderer.xr.addEventListener('sessionend', () => {
        rigSala.remove(camSala);
        sceneSala.add(camSala);
        camSala.position.set(0, 1.6, 1.2);
        modo?.controles?.();
    });

    // ── Vista previa del destino en la pantalla gigante (inicio) ──
    const previa = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 5000) };
    previa.camera.position.set(0, 0, 4.2);
    previa.scene.add(crearEstrellas(2000, 1500), new THREE.AmbientLight(0x303040, 0.8));
    const luzPrevia = new THREE.DirectionalLight(0xffffff, 3);
    luzPrevia.position.set(-3, 1.5, 3);
    previa.scene.add(luzPrevia);
    const texLuna = new THREE.TextureLoader().load('/texturas/moon_1024.jpg');
    texLuna.colorSpace = THREE.SRGBColorSpace;
    const esfera = new THREE.Mesh(new THREE.SphereGeometry(1.2, 64, 32), new THREE.MeshStandardMaterial({ map: texLuna, roughness: 1 }));
    previa.scene.add(esfera);
    const mapas = { luna: texLuna, marte: texturaMarte() };
    let destinoPrevio = 'luna';

    // ── Pantalla de inicio ──
    let modo = null;          // controlador de la misión en curso (o null en el inicio)
    const inicio = $('inicio');
    const rovers = $('lista-rovers');
    const CAPTION = {
        luna: ['LA LUNA', '384 400 KM DE LA TIERRA', 'APOLLO 11 · 1969'],
        marte: ['MARTE', '55 A 400 MILLONES DE KM', 'ROVERS 1996 – 2007'],
    };
    const caption = (d) => {
        destinoPrevio = d;
        const [a, b, c] = CAPTION[d];
        const el = $('caption-destino');
        el.querySelector('span').textContent = a;
        const smalls = el.querySelectorAll('small');
        smalls[0].textContent = b; smalls[1].textContent = c;
        inicio.querySelectorAll('.room').forEach((r) => r.classList.toggle('activo', r.dataset.destino === d));
    };
    for (const m of marte.misiones) {
        const b = document.createElement('button');
        b.textContent = `${m.rover.split(' ')[0].toUpperCase()} · ${m.lanzamiento_utc.slice(0, 4)}`;
        b.title = m.nombre;
        b.onclick = (e) => { e.stopPropagation(); elegir('marte', m.id); };
        rovers.append(b);
    }
    inicio.querySelector('[data-destino="luna"]').onclick = () => elegir('luna');
    inicio.querySelectorAll('.room').forEach((d) => {
        d.addEventListener('pointerenter', () => caption(d.dataset.destino));
        d.addEventListener('focusin', () => caption(d.dataset.destino));
    });
    caption('luna');

    function mostrarInicio() {
        modo?.salir();
        modo = null;
        base.vista = 'sala';
        hud.el.epilogo.classList.add('oculto');
        $('lanzamiento').classList.add('oculto');
        inicio.classList.remove('oculto');
        document.body.classList.add('en-inicio');
        $('mision-num').textContent = 'MISIÓN 001';
        base.pantallaCompleta(true);
        panelVR.colocarEn(rigSala);
        ctrlSala.enabled = false;
        $('carga').classList.add('fuera');
    }

    async function elegir(destino, id) {
        sonido.preparar();            // el clic del usuario permite cargar y reproducir audio
        inicio.classList.add('oculto');
        document.body.classList.remove('en-inicio');
        progreso(0.02, destino === 'luna' ? 'Preparando el Saturn V…' : 'Preparando el Delta II…');
        try {
            const mod = destino === 'luna' ? await import('./misiones/lunar.js') : await import('./misiones/marte.js');
            modo = await mod.crearMision(base, id);
            $('carga').classList.add('fuera');
            modo.entrar();
        } catch (e) {
            console.error(e);
            progreso(0, `Error al cargar: ${e.message}`);
        }
    }

    // ── Acciones: siempre van al controlador activo ──
    input.onAccion((a) => {
        if (modo) { modo.accion(a); return; }
        if (a === 'siguiente') elegir('luna');        // en VR: gatillo izquierdo = Luna, A = Marte
        if (a === 'modo') elegir('marte', 'spirit');
    });
    for (const [id, a] of [['btn-pausa', 'pausa'], ['btn-siguiente', 'siguiente'], ['btn-anterior', 'anterior'], ['btn-rapido', 'masRapido'],
        ['btn-lento', 'masLento'], ['btn-historia', 'historia'], ['btn-camara', 'camara'], ['btn-sala', 'sala']]) {
        $(id).addEventListener('click', () => modo?.accion(a));
    }
    $('btn-sonido-panel').addEventListener('click', () => {
        const on = sonido.alternar();
        $('btn-sonido-panel').textContent = on ? '♪ ON' : '♪ OFF';
        $('sonido-estado').textContent = on ? 'ON' : 'OFF';
    });
    const slider = $('time-slider');
    base.arrastrando = false;
    slider.addEventListener('pointerdown', () => { base.arrastrando = true; });
    addEventListener('pointerup', () => { base.arrastrando = false; });
    slider.addEventListener('input', () => modo?.deslizador?.(Number(slider.value) / 1000));

    // ── Bucle ──
    const reloj = new THREE.Clock();
    let tReal = 0;
    startLoop(renderer, () => {
        const dt = Math.min(reloj.getDelta(), 0.1);
        tReal += dt;
        base.entrada = input.poll(dt);
        if (modo) { modo.frame(dt, tReal); return; }
        // inicio: la sala de control con el destino girando en la pantalla gigante
        esfera.material.map = mapas[destinoPrevio];
        esfera.rotation.y += dt * 0.15;
        sala.actualizar({
            etapaActual: 'SELECCIÓN DE DESTINO', fases: ['SELECCIÓN DE DESTINO', 'LUNA · APOLLO 11', 'MARTE · DELTA II'], tituloEtapas: 'DESTINOS',
            altitud: 0, velocidad: 0, progreso: 0, met: 'T-  :  :  ', reloj: new Date().toISOString().slice(0, 19).replace('T', ' '),
        });
        sala.animar(tReal);
        camSala.position.set(-1.6 + Math.sin(tReal * 0.08) * 0.25, 1.5, 1.6);
        camSala.lookAt(-4.2, 2.6, -9);
        pantalla(previa.scene, previa.camera);
        camSala.userData.qBase = null;
        base.cardboard.render(sceneSala, camSala);
        panelVR.actualizar({ t: 0, fase: { nombre: 'Elige destino' }, warp: 1, pausado: false, siguiente: { titulo: 'Gatillo izq.: Luna · A: Marte', t: 0 } }, renderer.xr.isPresenting);
    });

    // Enlace directo: ?destino=luna|marte&mision=spirit  (y para la Luna, ?t=102:33:05)
    const q = new URLSearchParams(location.search);
    if (q.has('t') && !q.has('destino')) q.set('destino', 'luna');
    if (q.has('restos') && !q.has('destino')) q.set('destino', 'luna');
    if (q.has('destino')) elegir(q.get('destino'), q.get('mision') ?? 'spirit');
    else mostrarInicio();
    window.apsis = { base, sonido, get modo() { return modo; } };
}

iniciar().catch((e) => {
    console.error(e);
    progreso(0, `Error al cargar: ${e.message}`);
});
