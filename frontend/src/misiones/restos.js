// Modo "Lo que quedó allí": se activa al llegar al destino (Luna o Marte). Envuelve la escena de restos
// con su panel lateral (sitios, ficha del objeto seleccionado, leyenda) y conecta HUD, VR y botones.
import { EscenaRestos } from '../escenas/restos.js';
import DATOS_ES from '../data/restos.json';
import { fechaHora } from '../core/hud.js';
import { t as tr, localizar, LOCALE } from '../i18n/index.js';

const $ = (id) => document.getElementById(id);
const DATOS = localizar(DATOS_ES);
const ESTADO = { abandonada: tr('ABANDONADA'), incierta: tr('DESTINO INCIERTO'), activa: tr('EN SERVICIO'), destruida: tr('DESTRUIDA') };

function el(tag, cls, txt) { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }

export function crearModoRestos(base, { cuerpo, sitio, lanzamientoMs, lunaModelo, cargarLM, alRepetir }) {
    const d = DATOS[cuerpo];
    const escena = new EscenaRestos({ renderer: base.renderer, hud: base.hud, cuerpo, sitio, lunaModelo, cargarLM });
    base.registrarCamara(escena.camera);

    // ── panel ──
    let panel = $('restos');
    if (!panel) { panel = el('aside', 'oculto'); panel.id = 'restos'; $('monitor-3d').append(panel); }
    panel.innerHTML = '';
    const cab = el('div', 'r-cab');
    cab.append(el('small', null, tr('ABANDONADO, PERO NO OLVIDADO')));
    const titulo = el('h3'); cab.append(titulo);
    const niveles = el('div', 'r-niveles');
    const bOrb = el('button', null, `◯ ${tr('ÓRBITA')}`), bSup = el('button', null, `▼ ${tr('SUPERFICIE')}`);
    niveles.append(bOrb, bSup);
    const ficha = el('div', 'r-ficha');
    const sitiosEl = el('div', 'r-sitios');
    const leyenda = el('div', 'r-leyenda');
    const botones = el('div', 'r-botones');
    const bRep = el('button', null, `↺ ${tr('Repetir el viaje')}`), bIni = el('button', null, `⌂ ${tr('Inicio')}`);
    botones.append(bRep, bIni);
    panel.append(cab, niveles, ficha, sitiosEl, leyenda, botones);

    for (const s of d.sitios.filter((x) => x.superficie)) {
        const b = el('button', s.id === sitio ? 'mision' : '', s.nombre.split(' · ').pop());
        b.title = s.nombre;
        b.onclick = () => { if (escena.nivel === 'superficie') { escena.subir().then(() => escena.bajar(s)); } else escena.bajar(s); };
        sitiosEl.append(b);
    }
    bOrb.onclick = () => escena.subir();
    bSup.onclick = () => {
        if (escena.nivel === 'superficie') return;
        const s = (escena.seleccion?.clase === 'sitio' && escena.seleccion.superficie) ? d.sitios.find((x) => x.id === escena.seleccion.id) : d.sitios.find((x) => x.id === sitio);
        escena.bajar(s);
    };
    bRep.onclick = () => alRepetir?.();
    bIni.onclick = () => base.volverAlInicio();

    function pintarLeyenda() {
        leyenda.innerHTML = '';
        const item = (cls, txt) => { const s = el('span', cls, txt); leyenda.append(s); };
        if (escena.nivel === 'orbita') {
            item('ab', tr('abandonada')); item('in', tr('destino incierto')); item('ac', tr('en servicio'));
            item('si', tr('sitio (se puede bajar)')); item('ot', tr('otro sitio'));
        } else {
            item('si', tr('en el sitio')); item('le', tr('lejos (distancia comprimida)'));
        }
    }

    function fichaGeneral() {
        ficha.innerHTML = '';
        if (escena.nivel === 'orbita') {
            const abandonadas = d.orbita.filter((o) => o.estado !== 'activa').length;
            ficha.append(el('h4', null, `${tr(d.nombre)} · ${tr('ÓRBITA')}`));
            ficha.append(el('p', null, tr('{a} naves abandonadas o de destino incierto y {s} en servicio. Pulsa una nave o un sitio para ver su historia; acércate (rueda o pellizco) a un sitio verde para bajar a la superficie.', { a: abandonadas, s: d.orbita.length - abandonadas })));
            if (cuerpo === 'marte') ficha.append(el('p', 'nota', d.transporte.crucero));
            ficha.append(el('h5', null, tr('LO QUE NO ESTÁ AQUÍ')));
            const ul = el('ul'); for (const x of d.lejos) ul.append(el('li', null, x)); ficha.append(ul);
            ficha.append(el('p', 'nota', tr('Altitudes comprimidas (escala logarítmica) y orientación de las órbitas ilustrativa. Los tamaños de las naves están muy exagerados.')));
        } else {
            const s = escena.sitioActual;
            ficha.append(el('h4', null, s.nombre.toUpperCase()));
            ficha.append(el('p', null, `${s.resumen} (${Math.abs(s.lat).toFixed(3)}°${s.lat >= 0 ? 'N' : 'S'} ${Math.abs(s.lon).toFixed(3)}°${s.lon >= 0 ? 'E' : tr('O')})`));
            const ul = el('ul');
            for (const o of s.objetos) {
                const li = el('li', o.distancia ? 'lejos' : '', o.nombre + (o.distancia ? ` (${o.distancia})` : ''));
                li.onclick = () => escena.seleccionar(escena.pickSup.find((p) => p.userData.info.nombre === o.nombre)?.userData.info);
                ul.append(li);
            }
            ficha.append(ul);
            if (cuerpo === 'marte') ficha.append(el('p', 'nota', d.transporte.entrada));
            ficha.append(el('p', 'nota', tr('Arrastra para girar, rueda para acercarte. Aléjate del todo para volver a la órbita.')));
        }
    }

    function fichaDe(info) {
        if (!info) { fichaGeneral(); return; }
        ficha.innerHTML = '';
        const volver = el('button', 'r-volver', `← ${tr('todo')}`); volver.onclick = () => escena.seleccionar(null);
        ficha.append(volver);
        ficha.append(el('h4', null, info.nombre.toUpperCase()));
        if (info.clase === 'orbita' || info.clase === 'transporte') {
            const est = el('div', `r-estado ${info.estado}`, ESTADO[info.estado] ?? info.estado);
            ficha.append(est);
            if (info.anio) ficha.append(el('p', 'dato', tr('Llegó en {anio} · órbita real: {p} × {a} km, inclinación {i}°', { anio: info.anio, p: info.peri_km.toLocaleString(LOCALE), a: info.apo_km.toLocaleString(LOCALE), i: info.inc })));
            ficha.append(el('p', null, info.texto));
        } else if (info.clase === 'sitio') {
            ficha.append(el('p', 'dato', `${info.anio} · ${Math.abs(info.lat).toFixed(2)}°${info.lat >= 0 ? 'N' : 'S'} ${Math.abs(info.lon).toFixed(2)}°${info.lon >= 0 ? 'E' : tr('O')}`));
            ficha.append(el('p', null, info.resumen ?? info.texto));
            if (info.superficie) {
                const b = el('button', 'r-bajar', `▼ ${tr('Bajar a la superficie')}`);
                b.onclick = () => escena.bajar(d.sitios.find((x) => x.id === info.id));
                ficha.append(b);
            } else ficha.append(el('p', 'nota', tr('Este sitio solo se muestra en el mapa.')));
        } else {
            if (info.distancia) ficha.append(el('div', 'r-estado lejos', info.distancia.toUpperCase()));
            if (info.texto) ficha.append(el('p', null, info.texto));
        }
    }

    escena.alCambiar = (nivel, s) => {
        titulo.textContent = nivel === 'orbita' ? `${tr(d.nombre)} · ${tr('LO QUE ORBITA')}` : `${tr(d.nombre)} · ${s.nombre.split(' · ')[0].toUpperCase()}`;
        bOrb.classList.toggle('activo', nivel === 'orbita');
        bSup.classList.toggle('activo', nivel === 'superficie');
        for (const b of sitiosEl.children) b.classList.toggle('activo', nivel === 'superficie' && b.title === s?.nombre);
        pintarLeyenda();
        fichaGeneral();
        base.hud.registrar(nivel === 'orbita' ? `[RESTOS] ${tr('Vista orbital')}: ${tr(d.nombre)}` : `[RESTOS] ${tr('Superficie')}: ${s.nombre}`, 'importante');
    };
    escena.alSeleccionar = fichaDe;

    let ayudaPrevia = null, ultimoHUD = 0;
    const modo = {
        escena,
        activo: false,
        entrar() {
            modo.activo = true;
            base.vista = 'escena';
            base.hud.el.epilogo.classList.add('oculto');
            base.hud.el.lm.classList.add('oculto');
            base.input.mostrarTactil(false);
            panel.classList.remove('oculto');
            document.body.classList.add('modo-restos');
            ayudaPrevia = $('ayuda').textContent;
            $('ayuda').textContent = tr('Arrastra: girar · rueda/pellizco: acercar · clic: ¿qué es? · N/B: siguiente/anterior · C: control de misión · ↑ aléjate para volver a la órbita');
            escena.entrar();
            base.panelVR.colocarEn(escena.rig);
            base.hud.banner(`${tr(d.nombre)}: ${tr('LO QUE QUEDÓ ALLÍ')}`, tr('Naves abandonadas en órbita y restos en la superficie'), 5000);
        },
        salir() {
            if (!modo.activo) return;
            modo.activo = false;
            escena.salir();
            panel.classList.add('oculto');
            document.body.classList.remove('modo-restos');
            if (ayudaPrevia != null) $('ayuda').textContent = ayudaPrevia;
        },
        accion(a) {
            if (a === 'siguiente') escena.ciclar(1);
            else if (a === 'anterior') { if (escena.nivel === 'superficie') escena.ciclar(-1); else escena.ciclar(-1); }
            else if (a === 'modo' || a === 'aceptar') { if (escena.nivel === 'orbita') { const s = escena.seleccion?.clase === 'sitio' ? d.sitios.find((x) => x.id === escena.seleccion.id) : d.sitios.find((x) => x.id === sitio); escena.bajar(s); } else escena.subir(); }
            else if (a === 'camara') escena.cambiarCamara();
            else if (a === 'sala') { base.vista = base.vista === 'sala' ? 'escena' : 'sala'; base.panelVR.colocarEn(base.vista === 'sala' ? base.rigSala : escena.rig); }
        },
        frame(dt, tReal) {
            escena.actualizar(0, dt, 0, tReal);
            const ahora = Date.now();
            const t = (ahora - lanzamientoMs) / 1000;
            const alt = escena.altitudCamara();
            const resumen = {
                t, fase: { id: 'RESTOS', nombre: escena.nivel === 'orbita' ? tr('Restos · órbita') : tr('Restos · superficie') },
                tel: {
                    alt: alt.unidad === 'km' ? alt.km : alt.m / 1000, vel: 0, distLuna: 0,
                    dist: escena.nivel === 'orbita' ? d.orbita.filter((o) => o.estado !== 'activa').length : (escena.sitioActual?.objetos.length ?? 0),
                    et: { alt: 'ALTURA DE LA VISTA (km):', vel: '—', dist: escena.nivel === 'orbita' ? 'NAVES ABANDONADAS:' : 'OBJETOS EN EL SITIO:' },
                },
                config: escena.seleccion?.nombre?.toUpperCase() ?? (escena.nivel === 'orbita' ? tr(d.nombre) : escena.sitioActual?.nombre.toUpperCase()),
                siguiente: null, warp: 1, pausado: false, auto: false, gmt: `${tr('HOY')} ${fechaHora(ahora).slice(0, 11)}`,
            };
            let estadoSala = null;
            if (tReal - ultimoHUD > 0.25) {
                ultimoHUD = tReal;
                base.hud.actualizar(resumen);
                estadoSala = {
                    etapaActual: escena.nivel === 'orbita' ? 'ÓRBITA' : 'SUPERFICIE', fases: ['LLEGADA', 'ÓRBITA', 'SUPERFICIE'], tituloEtapas: tr('LO QUE QUEDÓ ALLÍ'),
                    altitud: Math.round(alt.unidad === 'km' ? alt.km : alt.m), unidadAlt: alt.unidad, velocidad: 0, unidadVel: 'km/h', progreso: 100,
                    met: tr('HOY'), reloj: new Date(ahora).toISOString().slice(0, 19).replace('T', ' '),
                };
            }
            base.panelVR.actualizar({ ...resumen, siguiente: { titulo: tr('Gatillo: siguiente · A: bajar/subir'), t } }, base.renderer.xr.isPresenting);
            base.render(escena, estadoSala, tReal);
        },
    };
    return modo;
}
