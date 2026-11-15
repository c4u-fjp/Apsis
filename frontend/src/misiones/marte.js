// Destino MARTE: un Delta II 7925 lanza un rover (Sojourner, Spirit, Opportunity) o el lander Phoenix.
// Lanzamiento en la plataforma -> al llegar al espacio, la sala de control muestra el viaje
// interplanetario (posiciones reales de SPICE + arco de Lambert) -> llegada y restos en Marte.
import misiones from '../data/marte.json';
import respaldo from '../data/efemerides_marte.json';
import { formatearMET } from '../mision/tiempo.js';
import { monotona } from '../mision/vec.js';
import { solEcuatorial, eclipticaAEcuatorial, ecuatorialALocal } from '../mision/sol.js';
import { fechaHora } from '../core/hud.js';
import { getMarsTrack } from '../api/client.js';
import { crearDelta } from '../modelos/cargador.js';
import { adaptadorDelta, SECUENCIA_DELTA } from '../modelos/vehiculos.js';
import { EscenaInterplanetaria } from '../escenas/interplanetario.js';
import { pantallaLanzamiento, viajeComenzado } from './lanzamiento.js';
import { sonido } from '../core/audio.js';
import { crearModoRestos } from './restos.js';

const $ = (id) => document.getElementById(id);
const PAD = { nombre: 'Complejo 17 · Cabo Cañaveral', lat: 28.447, lon: -80.565, azimut: 95 };
const EN_EL_ESPACIO = 205;   // s (~100 km en el perfil modelado)
// Perfil de ascenso del Delta II: modelado (aproximado), no son datos de telemetría
const ASC = [[0, 0, 0], [10, 0.12, 0], [20, 0.6, 0], [30, 1.5, 0.05], [45, 3.8, 0.6], [64, 9.5, 2.5], [90, 19, 8],
    [130, 40, 28], [170, 70, 62], [205, 100, 105], [240, 130, 150], [300, 170, 260]];
const FASES = ['PRE_LANZAMIENTO', 'DESPEGUE', 'SEPARACION_GEM', 'EN_EL_ESPACIO', 'CRUCERO_A_MARTE', 'LLEGADA_A_MARTE', 'RESTOS'];
const NOMBRE_FASE = { PRE_LANZAMIENTO: 'Cuenta regresiva', DESPEGUE: 'Despegue', SEPARACION_GEM: 'Propulsores GEM', EN_EL_ESPACIO: 'En el espacio', CRUCERO_A_MARTE: 'Crucero a Marte', LLEGADA_A_MARTE: 'Llegada a Marte', RESTOS: 'Lo que quedó allí' };

async function cargarTrack(id) {
    try {
        return { datos: await getMarsTrack(id), origen: 'SPICE en vivo (backend)' };
    } catch {
        return { datos: respaldo[id], origen: 'SPICE precalculado (backend apagado)' };
    }
}

export async function crearMision(base, id = 'spirit') {
    const { renderer, hud, plataforma } = base;
    const m = misiones.misiones.find((x) => x.id === id) ?? misiones.misiones[1];
    base.progreso(0.15, 'Efemérides de la Tierra y Marte…');
    const { datos, origen } = await cargarTrack(m.id);
    hud.fuente(origen);
    base.progreso(0.4, 'Delta II…');
    const delta = await crearDelta();
    const inter = new EscenaInterplanetaria({ renderer });
    inter.configurarMision(datos, m);
    base.registrarCamara(inter.camera);

    const lanz = Date.parse(m.lanzamiento_utc);
    const ms = (t) => lanz + t * 1000;
    const alt = monotona(ASC.map((a) => a[0]), ASC.map((a) => a[1]));
    const rng = monotona(ASC.map((a) => a[0]), ASC.map((a) => a[2]));
    plataforma.configurarMision({
        vehiculo: adaptadorDelta(delta), altKm: alt, rangoKm: rng, azimut: PAD.azimut, alabeoDeg: 0,
        nocheCine: !new URLSearchParams(location.search).has('luzReal'),
        solLocal: (t) => ecuatorialALocal(solEcuatorial(ms(t)), ms(t), PAD.lat, PAD.lon),
        astroLocal: (t) => {
            const g = inter.pos('marte', t).map((v, k) => v - inter.pos('tierra', t)[k]);
            return ecuatorialALocal(eclipticaAEcuatorial(g), ms(t), PAD.lat, PAD.lon);
        },
    });
    const escenas = [plataforma, inter];

    let t = -12, pausado = true, estado = 'preparacion', activa = plataforma, pantalla = null;
    let warpManual = null, tCrucero = 0, ultimoHUD = 0, tPrevio = t, eventosVistos = new Set();
    const D = inter.duracion;
    let restos = null;
    const controles = () => (restos?.activo ? base.controles([...escenas, restos.escena], restos.escena) : base.controles(escenas, activa));
    const vista = (sala) => { base.vista = sala ? 'sala' : 'escena'; base.panelVR.colocarEn(sala ? base.rigSala : activa.rig); controles(); };

    const fase = () => t < 0 ? 'PRE_LANZAMIENTO' : t < SECUENCIA_DELTA.gem6Fin ? 'DESPEGUE' : t < EN_EL_ESPACIO ? 'SEPARACION_GEM'
        : t < EN_EL_ESPACIO + 3600 ? 'EN_EL_ESPACIO' : t < D ? 'CRUCERO_A_MARTE' : estado === 'restos' ? 'RESTOS' : 'LLEGADA_A_MARTE';

    const EVENTOS = [
        [SECUENCIA_DELTA.ignicion, 'Ignición del RS-27', 'Motor principal de la primera etapa'],
        [0, '¡Despegue!', `${m.nombre} rumbo a Marte`],
        [SECUENCIA_DELTA.gem6Fin + 2, 'Separación de 6 propulsores GEM', 'ABANDONADOS: caen al Atlántico'],
        [SECUENCIA_DELTA.gem3, 'Ignición de los 3 GEM restantes', 'Se encienden en vuelo'],
        [SECUENCIA_DELTA.gem3Fin + 2, 'Separación de los últimos GEM', 'ABANDONADOS: caen al Atlántico'],
        [EN_EL_ESPACIO, 'En el espacio', 'Control de Misión · trayectoria hacia Marte'],
        [D, 'Llegada a Marte', `${m.sitio}`],
    ];

    function despegar() { estado = 'ascenso'; plataforma.preparacion = false; t = -10; tPrevio = t; pausado = false; }

    function aEspacio() {
        sonido.reproducir('espacio');
        viajeComenzado(`Control de Misión sigue a ${m.rover} rumbo a Marte en la pantalla principal.`);
        estado = 'crucero';
        activa = inter;
        tCrucero = 0;
        vista(true);
        base.pantallaCompleta(false);
    }

    // Al llegar: zoom a Marte con lo que orbita y, más cerca, la superficie con lo que quedó
    function abrirRestos() {
        if (restos?.activo) return;
        estado = 'restos';
        restos ??= crearModoRestos(base, {
            cuerpo: 'marte', sitio: m.id, lanzamientoMs: lanz,
            alRepetir: () => { cerrarRestos(); estado = 'crucero'; t = EN_EL_ESPACIO; tCrucero = 0; activa = inter; eventosVistos = new Set([...eventosVistos].filter((x) => x <= EN_EL_ESPACIO)); vista(true); },
        });
        $('fundido').classList.add('negro');
        setTimeout(() => { restos.entrar(); controles(); $('fundido').classList.remove('negro'); }, 480);
    }
    function cerrarRestos() {
        if (!restos?.activo) return;
        restos.salir();
        base.vista = 'escena';
        base.panelVR.colocarEn(activa.rig);
        controles();
    }

    // Epílogo clásico (texto), se conserva por si se quiere mostrar sin el explorador 3D
    function mostrarRestos() {
        estado = 'restos';
        const el = hud.el.epilogo;
        el.innerHTML = '';
        const add = (tag, txt, cls) => { const e = document.createElement(tag); e.textContent = txt; if (cls) e.className = cls; el.append(e); return e; };
        add('h2', `${m.rover.toUpperCase()} · ${m.sitio.toUpperCase()}`);
        add('p', `Llegada: ${fechaHora(Date.parse(m.llegada_utc)).slice(0, 11)} tras ${Math.round(D / 86400)} días de viaje.` +
            (m.lat !== null ? ` Coordenadas: ${Math.abs(m.lat)}°${m.lat >= 0 ? 'N' : 'S'} ${Math.abs(m.lon)}°${m.lon >= 0 ? 'E' : 'O'}.` : ''));
        add('p', m.historia, 'historia');
        add('h4', 'LO QUE SIGUE ALLÍ');
        const ul = add('ul', '');
        for (const r of m.restos) { const li = document.createElement('li'); li.textContent = r; ul.append(li); }
        add('p', `Último contacto: ${m.ultimo_contacto}. Abandonado, pero no olvidado.`);
        const b = add('div', ''); b.className = 'botones';
        const boton = (txt, f) => { const x = document.createElement('button'); x.textContent = txt; x.onclick = () => { el.classList.add('oculto'); f(); }; b.append(x); };
        boton('Volver al inicio', () => base.volverAlInicio());
        boton('Repetir el viaje', () => { estado = 'crucero'; t = EN_EL_ESPACIO; tCrucero = 0; eventosVistos = new Set([...eventosVistos].filter((x) => x <= EN_EL_ESPACIO)); });
        boton('Seguir mirando', () => {});
        el.classList.remove('oculto');
    }

    function warp() {
        if (pausado) return 0;
        if (warpManual) return warpManual;
        if (estado === 'crucero') return 600 * Math.pow(2, Math.min(9, tCrucero * 2.2));   // rampa hasta ~3,5 días/s
        if (estado === 'restos' || estado === 'llegada') return 0;
        return t < 30 ? 1 : 3;
    }

    const acciones = {
        pausa: () => { if (estado !== 'preparacion') pausado = !pausado; },
        espacio: () => acciones.pausa(),
        siguiente: () => {
            if (estado === 'preparacion') $('btn-lanzar').click();
            else if (estado === 'ascenso') { t = EN_EL_ESPACIO; }
            else if (estado === 'crucero') { t = D - 3 * 86400; }
        },
        anterior: () => { if (estado === 'crucero' || estado === 'restos') { estado = 'crucero'; hud.el.epilogo.classList.add('oculto'); t = EN_EL_ESPACIO; tCrucero = 0; } },
        masRapido: () => { warpManual = Math.min(4e6, ((warpManual ?? warp()) || 1) * 3); },
        masLento: () => { warpManual = Math.max(1, ((warpManual ?? warp()) || 1) / 3); },
        historia: () => { warpManual = null; },
        camara: () => { $('btn-camara').textContent = `CÁMARA: ${String(activa.cambiarCamara()).toUpperCase()}`; },
        sala: () => vista(base.vista !== 'sala'),
    };

    return {
        controles,
        depurar: { inter, get restos() { return restos; } },
        entrar() {
            base.vista = 'escena';
            hud.el.log.innerHTML = '';
            $('titulo-panel').textContent = `${m.rover.toUpperCase()} · FLIGHT DYNAMICS`;
            hud.registrar(`[SYS] ${m.nombre} · Delta II 7925 · ${m.plataforma}`);
            hud.registrar(`[SYS] Transferencia de ${Math.round(D / 86400)} días · posiciones reales de la Tierra y Marte (SPICE)`);
            plataforma.preparacion = true;
            plataforma.entrar(t);
            base.panelVR.colocarEn(plataforma.rig);
            controles();
            base.pantallaCompleta(true);
            pantalla = pantallaLanzamiento({
                eyebrow: `${m.nombre.toUpperCase()} · DELTA II`,
                titulo: ['RUMBO A', 'MARTE'],
                descripcion: `${fechaHora(lanz)} UTC. Un Delta II con nueve propulsores sólidos lleva a ${m.rover} hacia ${m.sitio}. ${m.historia}`,
                cohete: 'DELTA II', coheteSub: 'DELTA 7925 · 9 GEM-40', plataforma: `${m.plataforma} · CABO CAÑAVERAL`, mision: m.rover.split(' ')[0].toUpperCase(),
                alLanzar: despegar,
                alVolver: () => base.volverAlInicio(),
            });
            const q = new URLSearchParams(location.search);
            if (q.has('restos')) { despegar(); pantalla.ocultar(); pantalla = null; base.pantallaCompleta(false); t = D; estado = 'llegada'; activa = inter; abrirRestos(); return; }
            if (q.has('t')) { despegar(); t = Number(q.get('t')); pausado = q.has('pausa'); pantalla.ocultar(); pantalla = null; base.pantallaCompleta(false); if (t >= EN_EL_ESPACIO) aEspacio(); }
        },
        salir() { restos?.salir(); sonido.parar(); pantalla?.ocultar(); plataforma.preparacion = false; hud.el.epilogo.classList.add('oculto'); base.vista = 'escena'; },
        accion(a) {
            if (restos?.activo) { restos.accion(a); return; }
            acciones[a]?.();
        },
        deslizador(f) {
            if (estado === 'preparacion') return;
            if (restos?.activo) { cerrarRestos(); estado = 'crucero'; }
            t = f < 0.15 ? -10 + (EN_EL_ESPACIO + 10) * (f / 0.15) : EN_EL_ESPACIO + (D - EN_EL_ESPACIO) * ((f - 0.15) / 0.85);
            hud.el.epilogo.classList.add('oculto');
            if (t >= EN_EL_ESPACIO && estado === 'ascenso') aEspacio();
            else if (t >= EN_EL_ESPACIO) { estado = 'crucero'; activa = inter; } else { estado = 'ascenso'; activa = plataforma; }
        },

        frame(dt, tReal) {
            if (restos?.activo) { restos.frame(dt, tReal); return; }
            const tAntes = t;
            t = Math.min(estado === 'crucero' || estado === 'restos' ? D : Infinity, t + dt * warp());
            if (estado === 'crucero') tCrucero += dt;
            if (pantalla && estado !== 'preparacion') {
                pantalla.cuenta(t, SECUENCIA_DELTA.ignicion);
                if (t > 6) { pantalla.ocultar(); pantalla = null; base.pantallaCompleta(false); }
            }
            for (const [te, titulo, texto] of EVENTOS) {
                if (tAntes < te && t >= te && !eventosVistos.has(te)) {
                    eventosVistos.add(te);
                    hud.registrar(`[${formatearMET(te)}] ${titulo} — ${texto}`, texto.startsWith('ABANDONADO') ? 'abandonado' : 'importante');
                    hud.banner(titulo, texto);
                }
            }
            if (estado === 'ascenso' && t >= EN_EL_ESPACIO) aEspacio();
            if (estado === 'crucero' && t >= D) {
                estado = 'llegada';
                sonido.reproducir('aterrizaje');
                sonido.reproducir('eagle', { retraso: 3.5 });
                setTimeout(abrirRestos, 2500);
            }
            sonido.sincronizar('despegue', t, SECUENCIA_DELTA.ignicion, { tiempoReal: estado === 'ascenso' && !pausado && warp() <= 3 });

            activa.actualizar(t, dt, Math.max(0, t - tPrevio), tReal);
            tPrevio = t;

            // Telemetría
            let tel;
            if (activa === plataforma) {
                const p = plataforma.pose(t);
                const v = plataforma.pose(t + 0.5).pos.sub(plataforma.pose(t - 0.5).pos).length();
                tel = { alt: p.alt / 1000, vel: v / 1000, distLuna: 0, dist: 0, et: { alt: 'ALTITUD (km):', vel: 'VELOCIDAD (km/s):', dist: 'DIST. A MARTE (km):' } };
                tel.dist = inter.telemetria(0).distMarte;
            } else {
                const x = inter.telemetria(t);
                tel = { alt: x.distTierra, vel: x.vel, distLuna: 0, dist: x.distMarte, et: { alt: 'DIST. A LA TIERRA (km):', vel: 'VEL. RESP. AL SOL (km/s):', dist: 'DIST. A MARTE (km):' } };
            }
            const f = fase();
            const resumen = {
                t, fase: { id: f, nombre: NOMBRE_FASE[f] }, tel, config: f === 'DESPEGUE' || f === 'PRE_LANZAMIENTO' ? 'DELTA II + 9 GEM' : t < EN_EL_ESPACIO ? 'DELTA II' : m.rover.toUpperCase(),
                siguiente: EVENTOS.map(([te, titulo]) => ({ t: te, titulo })).find((e) => e.t > t + 0.05) ?? null,
                warp: Math.round(warp()), pausado, auto: !warpManual, gmt: fechaHora(ms(t)),
            };
            let estadoSala = null;
            if (tReal - ultimoHUD > 0.1) {
                ultimoHUD = tReal;
                hud.actualizar(resumen);
                if (!base.arrastrando) $('time-slider').value = Math.round((t < EN_EL_ESPACIO ? 0.15 * Math.max(0, t + 10) / (EN_EL_ESPACIO + 10) : 0.15 + 0.85 * (t - EN_EL_ESPACIO) / (D - EN_EL_ESPACIO)) * 1000);
                estadoSala = {
                    etapaActual: f, fases: FASES, tituloEtapas: 'VIAJE A MARTE',
                    altitud: Math.round(tel.alt), unidadAlt: 'km', velocidad: Math.round(tel.vel * 3600), unidadVel: 'km/h',
                    progreso: Math.round(Math.max(0, Math.min(1, t / D)) * 1000) / 10,
                    met: formatearMET(t), reloj: new Date(ms(t)).toISOString().slice(0, 19).replace('T', ' '),
                };
            }
            base.panelVR.actualizar(resumen, renderer.xr.isPresenting);
            base.render(activa, estadoSala, tReal);
        },
    };
}
