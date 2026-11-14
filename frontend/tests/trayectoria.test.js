// Pruebas de la mecánica de la misión: si alguien cambia la trayectoria o los datos, esto avisa.
import { describe, it, expect } from 'vitest';
import datos from '../src/data/apollo11.json';
import respaldo from '../src/data/efemerides_apollo11.json';
import { Efemerides } from '../src/mision/efemerides.js';
import { Trayectoria } from '../src/mision/trayectoria.js';
import { Cronologia } from '../src/mision/cronologia.js';
import { getASegundos, formatearMET } from '../src/mision/tiempo.js';
import { len, sub } from '../src/mision/vec.js';

const efem = new Efemerides(respaldo);
const tray = new Trayectoria(datos, efem);

describe('tiempo', () => {
    it('convierte GET', () => {
        expect(getASegundos('102:45:39.9')).toBeCloseTo(369939.9);
        expect(getASegundos('-000:00:08.9')).toBeCloseTo(-8.9);
        expect(formatearMET(369939.9)).toBe('T+102:45:39');
    });
});

describe('cronología', () => {
    const c = new Cronologia(datos);
    it('eventos ordenados y fases válidas', () => {
        for (let i = 1; i < c.eventos.length; i++) expect(c.eventos[i].t).toBeGreaterThanOrEqual(c.eventos[i - 1].t);
        for (const f of c.fases) expect(['plataforma', 'espacio', 'superficie']).toContain(f.escena);
    });
});

describe('trayectoria', () => {
    it('órbita de aparcamiento a ~191 km y 7,8 km/s', () => {
        const tel = tray.telemetria(3000);
        expect(tel.alt).toBeGreaterThan(185); expect(tel.alt).toBeLessThan(197);
        expect(tel.vel).toBeCloseTo(7.8, 1);
    });
    it('TLI cercana a la real (10,83 km/s)', () => {
        expect(len(tray.v1)).toBeGreaterThan(10.7);
        expect(len(tray.v1)).toBeLessThan(10.95);
    });
    it('nunca atraviesa la Tierra ni la Luna', () => {
        for (let t = tray.tTLI; t < tray.tLOI; t += 600) expect(len(tray.posicion(t))).toBeGreaterThan(6378);
        for (let t = tray.tAprox; t < tray.tP64; t += 60) expect(len(sub(tray.posicion(t), efem.luna(t)))).toBeGreaterThan(1737.4);
    });
    it('sin saltos entre tramos', () => {
        for (const tb of [tray.park.t0, tray.tTLI, tray.tAprox, tray.tLOI, tray.tDOI, tray.tPDI]) {
            expect(len(sub(tray.posicion(tb - 0.01), tray.posicion(tb + 0.01)))).toBeLessThan(1);
        }
    });
});
