import { describe, it, expect } from 'vitest';
import datos from '../src/data/apollo11.json';
import { createLM, step, guiadoAuto } from '../src/simulation/descent.js';

describe('alunizaje automático (P64 -> P66)', () => {
    it('aterriza en Base Tranquilidad con combustible', () => {
        const m = datos.lm_p64;
        const lm = createLM({ x: -7653, y: 2300, vx: 120, vy: -40.7, angle: -0.6, dryMass: m.dryMass, fuel: m.fuel });
        for (let t = 0; t < 600 && lm.status === 'descending'; t += 1 / 60) step(lm, guiadoAuto(lm, { x: 0, h: 30 }), 1 / 60);
        expect(lm.status).toBe('landed');
        expect(Math.abs(lm.x)).toBeLessThan(5);
        expect(lm.fuel).toBeGreaterThan(100);
    });
    it('sin empuje se estrella', () => {
        const lm = createLM({ y: 200, vy: -5 });
        for (let i = 0; i < 6000 && lm.status === 'descending'; i++) step(lm, { throttle: 0, rotate: 0 }, 1 / 60);
        expect(lm.status).toBe('crashed');
    });
});
