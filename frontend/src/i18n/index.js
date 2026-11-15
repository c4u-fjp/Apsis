// Idiomas de Apsis. El texto base está en español y sirve de clave:
//   t('Cuenta regresiva')                       -> "Countdown" en inglés
//   t('Llegada en {dias} días', { dias: 207 })  -> con variables entre llaves
// Si una frase no está en el diccionario se muestra en español (nunca se rompe nada).
// Los datos (src/data/*.json) se traducen al importarlos con localizar(); el HTML con traducirDOM().
// Para añadir un idioma: crea xx.js (interfaz) y xx.datos.json (datos) y añádelo a IDIOMAS y DICCIONARIOS.
import en from './en.js';
import enDatos from './en.datos.json';

export const IDIOMAS = [
    { id: 'es', nombre: 'Español', corto: 'ES' },
    { id: 'en', nombre: 'English', corto: 'EN' },
];
const DICCIONARIOS = { en: { ...enDatos, ...en } };
const CLAVE = 'apsis-idioma';

function detectar() {
    const ids = IDIOMAS.map((i) => i.id);
    if (typeof location === 'undefined') return 'es';   // pruebas (Node)
    const q = new URLSearchParams(location.search).get('lang');
    if (ids.includes(q)) return q;
    try { const g = localStorage.getItem(CLAVE); if (ids.includes(g)) return g; } catch { /* sin almacenamiento */ }
    const nav = (globalThis.navigator?.language || 'es').slice(0, 2);
    return ids.includes(nav) ? nav : 'en';
}

export const idioma = detectar();
export const LOCALE = { es: 'es-MX', en: 'en-US' }[idioma] ?? 'es-MX';
const dic = DICCIONARIOS[idioma] ?? null;
const yaTraducidos = new Set(dic ? Object.values(dic) : []);
const faltan = new Set();

export function t(texto, vars) {
    let s = texto;
    if (dic) {
        if (texto in dic) s = dic[texto];
        else if (import.meta.env?.DEV && !yaTraducidos.has(texto) && /[a-záéíóúñ]{3}/i.test(texto) && texto !== texto.toUpperCase()) faltan.add(texto);
    }
    if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
    return s;
}

// Traduce todas las cadenas de un objeto de datos (copia profunda); ids, tipos y fechas no están en el
// diccionario, así que se quedan igual.
// Campos con códigos internos que nunca se traducen (p. ej. estado: 'abandonada' se usa en la lógica)
const CODIGOS = new Set(['id', 'tipo', 'modelo', 'estado', 'escena', 'grupo', 'clase', 'get', 'inicio', 'plataforma',
    'lanzamiento_utc', 'llegada_utc', 't0_utc', 'fin_simulacion', 'url', 'pista', 'archivo', 'unidad']);
export function localizar(datos) {
    if (!dic) return datos;
    const rec = (o) => {
        if (typeof o === 'string') return dic[o] ?? o;
        if (Array.isArray(o)) return o.map(rec);
        if (o && typeof o === 'object') { const r = {}; for (const [k, v] of Object.entries(o)) r[k] = CODIGOS.has(k) ? v : rec(v); return r; }
        return o;
    };
    return rec(datos);
}

// Traduce los textos y atributos del HTML estático (una vez, al arrancar)
export function traducirDOM(raiz = globalThis.document?.body) {
    if (!raiz) return;
    document.documentElement.lang = idioma;
    if (!dic) return;
    const andar = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
    const nodos = [];
    while (andar.nextNode()) nodos.push(andar.currentNode);
    for (const n of nodos) {
        const limpio = n.nodeValue.replace(/\s+/g, ' ').trim();
        if (limpio && dic[limpio]) n.nodeValue = n.nodeValue.replace(/\S[\s\S]*\S|\S/, dic[limpio]);
    }
    for (const el of raiz.querySelectorAll('[title],[aria-label]')) {
        for (const a of ['title', 'aria-label']) { const v = el.getAttribute(a); if (v && dic[v]) el.setAttribute(a, dic[v]); }
    }
    document.title = t(document.title);
}

// Cambia de idioma: se guarda y se recarga la página (así se redibuja todo, también los paneles de VR)
export function cambiarIdioma(nuevo) {
    if (nuevo === idioma) return;
    try { localStorage.setItem(CLAVE, nuevo); } catch { /* sin almacenamiento */ }
    const u = new URL(location.href);
    u.searchParams.delete('lang');
    location.replace(u.href);
}

// Para el equipo: en desarrollo, apsisFaltan() en la consola lista las frases sin traducir
if (import.meta.env?.DEV && typeof window !== 'undefined') window.apsisFaltan = () => [...faltan];
