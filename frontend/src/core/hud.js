// Panel de telemetría y registro de eventos (evolución de nasa_space_apps/core/hud.js).
import { formatearMET, relojGMT } from '../mision/tiempo.js';
import { t, isEnglish } from '../i18n/index.js';

const MESES = isEnglish
    ? ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
    : ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
export function fechaHora(ms) {
    const d = new Date(ms), p = (n) => String(n).padStart(2, '0');
    return `${p(d.getUTCDate())} ${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

const $ = (id) => document.getElementById(id);
const set = (el, v) => { const shown = t(v); if (el && el.textContent !== shown) el.textContent = shown; };
const num = (v, d = 0) => v.toLocaleString(isEnglish ? 'en-US' : 'es-MX', { minimumFractionDigits: d, maximumFractionDigits: d });

export function crearHUD() {
    const el = {
        fase: $('hud-fase'), met: $('reloj-mision'), gmt: $('reloj-gmt'), alt: $('hud-altitud'), altEt: $('hud-alt-et'),
        vel: $('hud-velocidad'), velEt: $('hud-vel-et'), luna: $('hud-luna'), lunaEt: $('hud-luna-et'), config: $('hud-config'), sig: $('hud-siguiente'),
        log: $('event-log'), warp: $('hud-warp'), banner: $('banner'), aviso: $('aviso'), fuente: $('hud-fuente'),
        lm: $('hud-lm'), epilogo: $('epilogo'), pausa: $('btn-pausa'), historia: $('btn-historia'),
    };
    let tBanner = null;

    function registrar(texto, clase = '') {
        const li = document.createElement('li');
        li.textContent = texto;
        if (clase) li.className = clase;
        el.log.prepend(li);
        while (el.log.children.length > 40) el.log.lastElementChild.remove();
    }

    return {
        el,
        registrar,
        evento(e) {
            const abandonado = e.texto?.startsWith('ABANDONADA');
            registrar(`[${formatearMET(e.t)}] ${e.titulo}${e.texto ? ' — ' + e.texto : ''}`, abandonado ? 'abandonado' : 'importante');
        },
        banner(titulo, sub = '', ms = 4500) {
            el.banner.innerHTML = '';
            const t = document.createElement('div');
            t.textContent = titulo;
            el.banner.append(t);
            if (sub) { const s = document.createElement('small'); s.textContent = sub; el.banner.append(s); }
            el.banner.classList.add('visible');
            clearTimeout(tBanner);
            tBanner = setTimeout(() => el.banner.classList.remove('visible'), ms);
        },
        aviso(texto) {
            el.aviso.textContent = texto ?? '';
            el.aviso.classList.toggle('visible', !!texto);
        },
        // estado: { t, fase, tel, config, siguiente, warp, pausado, auto }
        actualizar(s) {
            set(el.fase, s.fase.nombre.toUpperCase());
            set(el.met, formatearMET(s.t));
            set(el.gmt, s.gmt ?? relojGMT(s.t));
            if (s.tel) {
                const lunar = s.tel.cuerpo === 'LUNA';
                set(el.altEt, lunar ? 'ALTITUD LUNAR (km):' : 'ALTITUD (km):');
                set(el.velEt, lunar ? 'VEL. RESP. LUNA (km/s):' : 'VEL. INERCIAL (km/s):');
                set(el.alt, s.tel.alt < 100 ? num(s.tel.alt, 2) : num(s.tel.alt, 0));
                set(el.vel, num(s.tel.vel, 3));
                set(el.luna, num(Math.max(0, s.tel.distLuna), 0));
                set(el.lunaEt, 'DIST. A LA LUNA (km):');
                if (s.tel.et) {   // otras misiones ponen sus propias etiquetas
                    set(el.altEt, s.tel.et.alt); set(el.velEt, s.tel.et.vel); set(el.lunaEt, s.tel.et.dist);
                    set(el.luna, num(Math.max(0, s.tel.dist), 0));
                }
            }
            set(el.config, s.config ?? '—');
            if (s.siguiente) {
                const falta = s.siguiente.t - s.t;
                const txt = `${s.siguiente.titulo}  ·  en ${formatearMET(falta).replace('T+', '')}`;
                set(el.sig, txt);
            } else set(el.sig, '—');
            set(el.warp, s.pausado ? 'PAUSA' : `×${num(s.warp, s.warp < 1 ? 1 : 0)}`);
            set(el.pausa, s.pausado ? '▶' : '⏸');
            el.historia.classList.toggle('activo', s.auto);
        },
        fuente(t) { set(el.fuente, `EFEMÉRIDES: ${t}`); },
    };
}
