import { describe, it, expect } from 'vitest';
import ef from '../src/data/efemerides_marte.json';
import md from '../src/data/marte.json';
import { lambert, kepler } from '../src/mision/trayectoria.js';
import { sub, len } from '../src/mision/vec.js';
import { MU_SOL } from '../src/escenas/interplanetario.js';

describe('viajes a Marte (Lambert con posiciones SPICE)', () => {
    for (const m of md.misiones) it(m.id, () => {
        const d = ef[m.id], t0 = Date.parse(d.t0_utc + 'Z'), L = Date.parse(m.lanzamiento_utc), A = Date.parse(m.llegada_utc);
        const pos = (c, t) => { const x = (t + (L - t0) / 1000) / d.step_s, i = Math.floor(x), f = x - i; return d.samples[i][c].map((v, k) => v + (d.samples[i + 1][c][k] - v) * f); };
        const T = (A - L) / 1000, r1 = pos('tierra', 0), r2 = pos('marte', T);
        const v1 = lambert(r1, r2, T, [0, 0, 1], MU_SOL);
        const vT = sub(pos('tierra', 43200), pos('tierra', -43200)).map((v) => v / 86400);
        expect(len(sub(v1, vT))).toBeLessThan(6);                 // exceso hiperbólico realista (km/s)
        expect(len(sub(kepler(r1, v1, T, MU_SOL), r2))).toBeLessThan(1000);
    });
});
