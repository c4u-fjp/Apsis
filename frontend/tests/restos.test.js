// Integridad de los datos del explorador de restos (src/data/restos.json)
import { describe, it, expect } from 'vitest';
import datos from '../src/data/restos.json';
import { radioVisual } from '../src/escenas/restos.js';

const TIPOS = new Set(['lm_descenso', 'etapa_ascenso', 'bandera', 'easep', 'lrrr', 'alsep', 'camara_tv', 'bolsas', 'placa', 'lrv', 'surveyor',
    'lander_sovietico', 'lunokhod', 'pathfinder_lander', 'sojourner', 'mer', 'escudo', 'coraza_paracaidas', 'phoenix', 'viking', 'insight',
    'sismometro_cupula', 'topo', 'roca', 'zanja', 'marca', 'orbitador', 'perseverance', 'ingenuity', 'fragmento']);

describe.each(['luna', 'marte'])('restos: %s', (cuerpo) => {
    const d = datos[cuerpo];
    it('órbitas válidas', () => {
        for (const o of d.orbita) {
            expect(['abandonada', 'incierta', 'activa']).toContain(o.estado);
            expect(o.apo_km).toBeGreaterThanOrEqual(o.peri_km);
            expect(o.peri_km).toBeGreaterThan(0);
            expect(TIPOS.has(o.modelo)).toBe(true);
            expect(o.texto.length).toBeGreaterThan(20);
        }
    });
    it('sitios con coordenadas y objetos conocidos', () => {
        const ids = new Set();
        for (const s of d.sitios) {
            expect(ids.has(s.id)).toBe(false); ids.add(s.id);
            expect(Math.abs(s.lat)).toBeLessThanOrEqual(90);
            expect(Math.abs(s.lon)).toBeLessThanOrEqual(180);
            if (s.superficie) {
                expect(s.objetos.length).toBeGreaterThan(0);
                for (const o of s.objetos) expect(TIPOS.has(o.tipo), o.tipo).toBe(true);
            }
        }
    });
});

it('los sitios de las misiones de Marte existen en el explorador', async () => {
    const marte = (await import('../src/data/marte.json')).default;
    for (const m of marte.misiones) expect(datos.marte.sitios.some((s) => s.id === m.id && s.superficie)).toBe(true);
    expect(datos.luna.sitios.some((s) => s.id === 'apollo11' && s.superficie)).toBe(true);
});

it('la altitud se comprime de forma monótona', () => {
    expect(radioVisual(0)).toBe(10);
    expect(radioVisual(100)).toBeLessThan(radioVisual(1000));
    expect(radioVisual(77000)).toBeLessThan(20);
});
