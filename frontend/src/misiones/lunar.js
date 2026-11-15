// Destino LUNA: Apollo 11 completo (lanzamiento -> órbita -> TLI -> Luna -> alunizaje -> restos).
// Al llegar al espacio (~100 km) la vista pasa a la sala de control con la trayectoria hacia la Luna.
import * as THREE from 'three';
import datos from '../data/apollo11.json';
import { Cronologia } from '../mision/cronologia.js';
import { RelojMision } from '../mision/reloj.js';
import { cargarEfemerides } from '../mision/efemerides.js';
import { Trayectoria } from '../mision/trayectoria.js';
import { getASegundos, formatearMET, isoUTC, LANZAMIENTO_MS } from '../mision/tiempo.js';
import { ecuatorialALocal } from '../mision/sol.js';
import { fechaHora } from '../core/hud.js';
import { crearSaturno, crearLM, crearLuna, LM_M_POR_UNIDAD } from '../modelos/cargador.js';
import { NaveApollo } from '../modelos/nave.js';
import { adaptadorSaturno } from '../modelos/vehiculos.js';
import { EscenaEspacio } from '../escenas/espacio.js';
import { EscenaSuperficie } from '../escenas/superficie.js';
import { pantallaLanzamiento, viajeComenzado } from './lanzamiento.js';
import { sonido, CONTEO_T0 } from '../core/audio.js';
import { crearModoRestos } from './restos.js';

const $ = (id) => document.getElementById(id);
const FIN_PLATAFORMA = 75;      // s: a partir de aquí el ascenso se sigue en la escena a escala real
const EN_EL_ESPACIO = 215;      // s: ~100 km de altura -> vista de la sala de control
const BANNERS = new Set(['despegue', 'sepS1', 'les', 'sepS2', 'orbita', 'tli', 'tliFin', 'acople', 'extraccion', 'honda', 'equigravisfera', 'loi1', 'loi2', 'desacople', 'doi', 'pdi', 'p64', 'paso', 'despegueLunar']);

export async function crearMision(base) {
    const { renderer, hud, input, plataforma } = base;
    const crono = new Cronologia(datos);
    const reloj = new RelojMision(crono);
    reloj.limite = getASegundos(datos.fin_simulacion);

    base.progreso(0.08, 'Efemérides SPICE (Luna y Sol)…');
    const efem = await cargarEfemerides();
    hud.fuente(efem.origen);
    const tray = new Trayectoria(datos, efem);
    const ctx = { renderer, hud, input, crono, reloj, efem, tray, datos };
    base.progreso(0.25, 'Saturn V…');
    const [saturno, lmPila] = await Promise.all([crearSaturno(), crearLM()]);
    const nave = new NaveApollo(saturno, lmPila, crono);
    base.progreso(0.45, 'La Luna (luna1.glb)…');
    const luna = await crearLuna();
    base.progreso(0.65, 'Escenas…');
    const espacio = new EscenaEspacio(ctx);
    const superficie = new EscenaSuperficie(ctx);
    await espacio.cargar(nave, luna);
    base.progreso(0.85, 'Mar de la Tranquilidad…');
    await superficie.cargar();
    Object.defineProperty(ctx, 'entrada', { get: () => base.entrada });

    // Perfil de la plataforma: tabla real del ascenso y Sol real (SPICE)
    plataforma.configurarMision({
        vehiculo: adaptadorSaturno(nave, crono.ev.ignicion),
        altKm: tray.altAsc, rangoKm: tray.rngAsc, azimut: tray.pad.azimut_vuelo_deg,
        solLocal: (t) => ecuatorialALocal(efem.sol(t), LANZAMIENTO_MS + t * 1000, tray.pad.lat, tray.pad.lon),
        nocheCine: !new URLSearchParams(location.search).has('luzReal'),   // Apollo 11 despegó de día: ?luzReal
    });
    const escenas = [plataforma, espacio, superficie];
    for (const e of escenas) base.registrarCamara(e.camera);

    let activa = null, pendiente = null, tPrevio = reloj.t, ultimoHUD = 0, vistaAuto = false;
    let estado = 'preparacion';     // preparacion | vuelo
    let pantalla = null;

    let restos = null;          // modo "lo que quedó allí" (órbita y superficie de la Luna)
    const controles = () => (restos?.activo ? base.controles([...escenas, restos.escena], restos.escena) : base.controles(escenas, activa));

    async function cargarDescenso() {   // la etapa de descenso real (mod_lunar.glb) para Base Tranquilidad y demás sitios Apollo
        const lm = await crearLM();
        const g = new THREE.Group();
        g.add(lm.descenso);
        g.scale.setScalar(LM_M_POR_UNIDAD);
        return g;
    }
    function abrirRestos() {
        if (restos?.activo) return;
        restos ??= crearModoRestos(base, {
            cuerpo: 'luna', sitio: 'apollo11', lanzamientoMs: LANZAMIENTO_MS, lunaModelo: luna, cargarLM: cargarDescenso,
            alRepetir: () => { cerrarRestos(); saltar(crono.ev.p64 - 2); },
        });
        reloj.pausado = true;
        $('fundido').classList.add('negro');
        setTimeout(() => {
            activa?.salir();
            restos.entrar();
            controles();
            $('fundido').classList.remove('negro');
        }, 480);
    }
    function cerrarRestos() {
        if (!restos?.activo) return;
        restos.salir();
        base.vista = 'escena';
        activa.entrar(reloj.t);
        base.panelVR.colocarEn(activa.rig);
        reloj.pausado = false;
        controles();
    }
    ctx.alTerminar = abrirRestos;
    function escenaPara(t) {
        if (t < FIN_PLATAFORMA) return plataforma;
        return crono.fase(t).escena === 'superficie' ? superficie : espacio;
    }
    function activar(e, t) {
        activa?.salir();
        activa = e;
        activa.entrar(t);
        if (base.vista === 'escena') base.panelVR.colocarEn(activa.rig);
        controles();
        $('btn-camara').textContent = 'CÁMARA: AUTO';
    }
    function cambiarEscena(e, t) {
        if (pendiente) return;
        if (!activa) { activar(e, t); return; }
        pendiente = e;
        $('fundido').classList.add('negro');
        setTimeout(() => { activar(pendiente, reloj.t); pendiente = null; $('fundido').classList.remove('negro'); }, 480);
    }
    function saltar(tNuevo) {
        reloj.saltarA(Math.max(crono.inicio, tNuevo));
        const t = reloj.t;
        const obj = escenaPara(t);
        if (obj === activa && !pendiente) {
            if (activa === superficie) {
                if (t < crono.ev.alunizaje || superficie.lm?.status !== 'landed') superficie.entrar(t);
            } else activa.entrar(t);
        }
        tPrevio = t;
    }
    ctx.reiniciar = () => { hud.el.epilogo.classList.add('oculto'); base.volverAlInicio(); };

    function vistaSala(v) {
        base.vista = v ? 'sala' : 'escena';
        base.panelVR.colocarEn(v ? base.rigSala : activa.rig);
        if (!v && espacio.modo === 'mapa' && vistaAuto) { espacio.modo = 'auto'; espacio.ultimaFaseCam = null; }
        controles();
    }

    function despegar() {
        estado = 'vuelo';
        plataforma.preparacion = false;
        reloj.t = -10;
        tPrevio = reloj.t;
        reloj.pausado = false;
        reloj.modoHistoria();
    }

    const acciones = {
        pausa: () => { if (estado === 'vuelo') reloj.pausado = !reloj.pausado; },
        espacio: () => { if (estado === 'vuelo' && !(activa === superficie && superficie.relojPropio)) reloj.pausado = !reloj.pausado; },
        siguiente: () => {
            if (estado === 'preparacion') { $('btn-lanzar').click(); return; }
            if (activa === superficie && superficie.lm?.status === 'descending') { superficie.saltarAlAlunizaje(); return; }
            const e = crono.siguiente(reloj.t);
            if (e) saltar(e.t - 2);
        },
        anterior: () => {
            if (estado === 'preparacion') { base.volverAlInicio(); return; }   // VR: stick ↓ en la plataforma = cambiar destino
            const previos = crono.eventos.filter((e) => e.t < reloj.t - 4);
            if (previos.length) saltar(previos[previos.length - 1].t - 2);
        },
        masRapido: () => reloj.cambiarWarp(1),
        masLento: () => reloj.cambiarWarp(-1),
        historia: () => reloj.modoHistoria(),
        camara: () => { $('btn-camara').textContent = `CÁMARA: ${String(activa.cambiarCamara()).toUpperCase()}`; },
        sala: () => vistaSala(base.vista !== 'sala'),
        modo: () => { if (estado === 'preparacion') { $('btn-lanzar').click(); return; } if (activa === superficie) superficie.cambiarModo(); },
        reintentar: () => { if (activa === superficie) superficie.iniciar('P64'); },
    };

    // Línea de tiempo no lineal (el lanzamiento y el alunizaje ocupan más espacio)
    const ev = crono.ev;
    const NUDOS = [[0, crono.inicio], [0.07, FIN_PLATAFORMA], [0.14, ev.orbita], [0.22, ev.tliFin], [0.3, ev.extraccion],
        [0.5, ev.loi1], [0.6, ev.desacople], [0.7, ev.pdi], [0.8, ev.p64], [0.9, ev.alunizaje], [1, reloj.limite]];
    const interp = (x, a, b) => {
        for (let i = 1; i < NUDOS.length; i++) if (x <= NUDOS[i][a]) {
            const p = NUDOS[i - 1], q = NUDOS[i];
            return p[b] + (q[b] - p[b]) * ((x - p[a]) / (q[a] - p[a]));
        }
        return NUDOS[NUDOS.length - 1][b];
    };

    return {
        depurar: { espacio, superficie, plataforma, reloj, tray, nave, get restos() { return restos; } },
        controles,
        entrar() {
            base.vista = 'escena';
            hud.el.log.innerHTML = '';
            $('titulo-panel').textContent = 'APOLLO 11 · FLIGHT DYNAMICS';
            hud.registrar('[SYS] Apollo 11 · Saturn V AS-506 · LC-39A · 16 JUL 1969');
            hud.registrar(`[SYS] Velocidad tras la TLI calculada: ${Math.hypot(...tray.v1).toFixed(2)} km/s (real: 10,83 km/s).`);
            reloj.t = crono.inicio;
            reloj.pausado = true;
            plataforma.preparacion = true;
            activar(plataforma, reloj.t);
            const q = new URLSearchParams(location.search);
            if (q.has('restos')) {     // enlace directo: ?destino=luna&restos
                despegar();
                base.pantallaCompleta(false);
                saltar(crono.ev.despegueLunar + 80);
                abrirRestos();
                return;
            }
            if (q.has('t')) {          // enlace directo a un instante
                despegar();
                base.pantallaCompleta(false);
                const v = q.get('t');
                saltar(v.includes(':') ? getASegundos(v) : Number(v));
                reloj.pausado = q.has('pausa');
                vistaAuto = true;      // no forzar la sala
                if (q.has('sala')) vistaSala(true);
                return;
            }
            base.pantallaCompleta(true);
            pantalla = pantallaLanzamiento({
                eyebrow: 'MISIÓN APOLLO 11 · SATURN V',
                titulo: ['RUMBO A', 'LA LUNA'],
                descripcion: 'Todo gran viaje empieza con un lanzamiento. 16 de julio de 1969: el Saturno V lleva a Armstrong, Aldrin y Collins al Mar de la Tranquilidad, donde aún sigue la etapa de descenso de Eagle.',
                cohete: 'SATURN V', coheteSub: 'APOLLO LAUNCH VEHICLE', plataforma: 'COMPLEJO 39A · KENNEDY', mision: 'MISIÓN AS-506',
                alLanzar: despegar,
                alVolver: () => base.volverAlInicio(),
            });
        },
        salir() {
            base.input.pilotaje = false;
            restos?.salir();
            sonido.parar();
            pantalla?.ocultar();
            activa?.salir();
            plataforma.preparacion = false;
            hud.el.lm.classList.add('oculto');
            hud.aviso(null);
            base.vista = 'escena';
        },
        accion(a) {
            if (restos?.activo) { restos.accion(a); return; }
            acciones[a]?.();
        },
        deslizador(f) { if (estado === 'vuelo') { cerrarRestos(); saltar(interp(f, 0, 1)); } },

        frame(dt, tReal) {
            if (restos?.activo) { restos.frame(dt, tReal); return; }
            const tAntes = reloj.t;
            if (estado === 'vuelo') {
                if (activa.relojPropio && !pendiente) reloj.t = activa.avanzarReloj(dt, reloj);
                else reloj.avanzar(dt);
            }
            const t = reloj.t;
            base.input.pilotaje = activa === superficie && superficie.lm?.status === 'descending' && superficie.modo !== 'AUTO';

            // cuenta regresiva en pantalla y paso al vuelo
            if (pantalla && estado === 'vuelo') {
                pantalla.cuenta(t, crono.ev.ignicion, true);
                if (t > 6) { pantalla.ocultar(); pantalla = null; base.pantallaCompleta(false); }
            }
            if (t > tAntes) {
                const cruzados = crono.entre(tAntes, t);
                cruzados.forEach((e) => hud.evento(e));
                const ultimo = [...cruzados].reverse().find((e) => BANNERS.has(e.id));
                if (ultimo) hud.banner(ultimo.titulo, ultimo.texto);
                // al llegar al espacio: sala de control con la trayectoria hacia la Luna
                if (!vistaAuto && tAntes < EN_EL_ESPACIO && t >= EN_EL_ESPACIO) {
                    vistaAuto = true;
                    espacio.modo = 'mapa';
                    espacio.ultimaFaseCam = null;
                    vistaSala(true);
                    sonido.reproducir('espacio');
                    viajeComenzado('Control de Misión sigue la trayectoria hacia la Luna en la pantalla principal. Pulsa C para volver al cohete.');
                }
            }

            // Grabaciones del lanzamiento, en su sitio exacto: el "zero" del locutor cae en T-0
            const tiempoReal = estado === 'vuelo' && !reloj.pausado && reloj.warp <= 1.5;
            sonido.sincronizar('conteo', t, CONTEO_T0, { tiempoReal });
            sonido.sincronizar('despegue', t, crono.ev.ignicion, { tiempoReal });

            const objetivo = escenaPara(t);
            if (objetivo !== activa) cambiarEscena(objetivo, t);
            const fase = crono.fase(t);
            activa.actualizar(t, dt, Math.max(0, t - tPrevio), tReal, { fase });
            tPrevio = t;

            let tel;
            if (activa === superficie && superficie.lm) {
                const l = superficie.lm, h = Math.max(0, l.y - superficie.suelo(l.x));
                tel = { cuerpo: 'LUNA', alt: h / 1000, vel: Math.hypot(l.vx, l.vy) / 1000, distLuna: h / 1000 };
            } else tel = tray.telemetria(t);
            const resumen = {
                t, fase, tel, siguiente: crono.siguiente(t), warp: reloj.warp, pausado: reloj.pausado, auto: reloj.auto,
                gmt: fechaHora(LANZAMIENTO_MS + t * 1000), lm: activa === superficie ? superficie.infoVR : null,
                config: activa === superficie ? (t >= ev.despegueLunar ? 'ETAPA DE DESCENSO (abandonada)' : 'EAGLE (LM)') : espacio.etiquetaConfig(t),
            };
            let estadoSala = null;
            if (tReal - ultimoHUD > 0.1) {
                ultimoHUD = tReal;
                hud.actualizar(resumen);
                if (!base.arrastrando) $('time-slider').value = Math.round(interp(t, 1, 0) * 1000);
                estadoSala = {
                    etapaActual: fase.id, fases: crono.fases.map((f) => f.id),
                    altitud: Math.round(tel.alt * (tel.alt < 10 ? 1000 : 1)), unidadAlt: tel.alt < 10 ? 'm' : 'km',
                    velocidad: Math.round(tel.vel * 3600), unidadVel: 'km/h',
                    progreso: Math.round(Math.max(0, Math.min(1, t / ev.alunizaje)) * 1000) / 10,
                    met: formatearMET(t), reloj: isoUTC(t).replace('T', ' '),
                };
            }
            base.panelVR.actualizar(resumen, renderer.xr.isPresenting);
            base.render(activa, estadoSala, tReal);
        },
    };
}
