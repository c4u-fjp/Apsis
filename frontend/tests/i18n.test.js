// Idiomas: toda frase que el código pasa por t()/tr() y todo texto de los datos debe tener traducción al inglés.
// Si añades un texto nuevo en español, añade su traducción en src/i18n/en.js (o en.datos.json para los datos).
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import en from '../src/i18n/en.js';
import enDatos from '../src/i18n/en.datos.json';
import apollo from '../src/data/apollo11.json';
import marte from '../src/data/marte.json';
import restos from '../src/data/restos.json';

const dic = { ...enDatos, ...en };
const archivos = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? archivos(p) : p.endsWith('.js') ? [p] : []; });

describe('i18n', () => {
    it('cada t("…") del código tiene traducción al inglés', () => {
        const faltan = [];
        for (const f of archivos(join(__dirname, '../src'))) {
            if (f.includes('/i18n/')) continue;
            const src = readFileSync(f, 'utf8');
            for (const m of src.matchAll(/\btr?\((['`])((?:(?!\1)[^\\]|\\.)*)\1/g)) {
                const k = m[2].replace(/\\'/g, "'");
                if (k.includes('${')) continue;
                if (!(k in dic)) faltan.push(`${f.split('/src/')[1]}: ${k}`);
            }
        }
        expect(faltan).toEqual([]);
    });

    it('los textos de los datos tienen traducción (salvo nombres propios)', () => {
        const CODIGOS = new Set(['id', 'tipo', 'modelo', 'estado', 'escena', 'grupo', 'get', 'inicio', 'plataforma', 'lanzamiento_utc', 'llegada_utc', 'fin_simulacion', 'url', 'llegada_nota', 'pista', 'archivo', 'unidad', 'ascenso_columnas', 'nombre']);
        const faltan = [];
        const rec = (o, k) => {
            if (typeof o === 'string') {
                // frases (con artículos/preposiciones en español) sin traducir
                if (!CODIGOS.has(k) && /\b(de|del|la|el|los|las|que|en|con|para|por|sigue|quedó)\b/.test(o) && !(o in dic)) faltan.push(o);
            } else if (Array.isArray(o)) o.forEach((v) => rec(v, k));
            else if (o && typeof o === 'object') for (const [kk, v] of Object.entries(o)) rec(v, kk);
        };
        [apollo, marte, restos].forEach((d) => rec(d));
        expect(faltan).toEqual([]);
    });

    it('las variables {x} se conservan en la traducción', () => {
        for (const [es, tr] of Object.entries(dic)) {
            const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
            expect(vars(tr), es).toBe(vars(es));
        }
    });
});
