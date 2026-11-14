// Adaptadores de cohete para la escena de la plataforma: Saturn V (Luna) y Delta II (Marte).
// Cada adaptador expone lo mismo: raiz, alto (m), configurar(t, tiempoReal, altM, pose) y actualizarRecortes().
import * as THREE from 'three';
import { SATURNO_M_POR_UNIDAD } from './cargador.js';
import { crearLlama, animarLlama } from './efectos.js';

const sm = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };

export function adaptadorSaturno(nave, ignicion) {
    return {
        nombre: 'Saturn V', raiz: nave.raiz, alto: 110.6,
        configurar(t, tiempoReal, altM) {
            nave.configurar(t, SATURNO_M_POR_UNIDAD, tiempoReal);
            const llama = nave.llamas['S-IC'];
            const ign = t >= ignicion, arranque = sm((t - ignicion) / 6);
            llama.visible = ign;
            // en la atmósfera el chorro de los F-1 se alarga con la altura (menos presión exterior)
            llama.scale.set(1 + altM / 6000, (0.6 + 0.4 * arranque) * (1 + altM / 2500), 1 + altM / 6000);
            return ign ? arranque : 0;
        },
        actualizarRecortes() { nave.actualizarRecortes(); },
    };
}

// Secuencia (modelada) del Delta II 7925: 6 GEM en tierra, 3 en vuelo
export const SECUENCIA_DELTA = { ignicion: -2, gem6Fin: 64, gem3: 66, gem3Fin: 130 };

export function adaptadorDelta(d) {
    const esc = d.mPorUnidad;
    const S = SECUENCIA_DELTA;
    // llamas (en unidades del modelo): motor principal RS-27 y una por propulsor
    d.raiz.updateMatrixWorld(true);
    const principal = crearLlama({ radio: 1.1, largo: 9, intensidad: 1.0 });
    principal.position.set(0, d.base + 0.3, 0);
    d.raiz.add(principal);
    const llamasGem = d.gem.map((g) => {
        const b = new THREE.Box3().setFromObject(g);
        const l = crearLlama({ radio: 0.55, largo: 6, intensidad: 0.9 });
        const centro = b.getCenter(new THREE.Vector3());
        l.position.set(centro.x, b.min.y, centro.z);
        d.raiz.add(l);
        return l;
    });
    const pivote = new THREE.Group();          // la base del cohete en el origen
    d.raiz.position.y = -d.base;
    pivote.add(d.raiz);
    pivote.scale.setScalar(esc);
    const raiz = new THREE.Group();
    raiz.add(pivote);
    // estado de cada GEM en el ensamblaje (para soltarlos)
    const inicial = d.gem.map((g) => ({ obj: g, padre: g.parent, pos: g.position.clone(), quat: g.quaternion.clone() }));
    const escena = { suelto: new THREE.Group() };
    raiz.add(escena.suelto);
    const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();

    return {
        nombre: 'Delta II 7925', raiz, alto: 39.6,
        configurar(t, tiempoReal, altM, pose) {
            const enc = t >= S.ignicion;
            animarLlama(principal, tiempoReal, enc, 1 + altM / 9000);
            d.gem.forEach((g, i) => {
                const tierra = i < 6;
                const t0 = tierra ? 0 : S.gem3, t1 = tierra ? S.gem6Fin : S.gem3Fin;
                const tSep = t1 + 2;
                animarLlama(llamasGem[i], tiempoReal, t >= t0 && t < t1, 1 + altM / 9000);
                const ini = inicial[i];
                if (t < tSep || !pose) {
                    if (g.parent !== ini.padre) ini.padre.add(g);
                    g.position.copy(ini.pos); g.quaternion.copy(ini.quat); g.visible = true;
                    return;
                }
                // propulsor suelto: trayectoria balística desde el instante de separación (función pura de t)
                const dt = t - tSep;
                if (dt > 90) { g.visible = false; return; }
                const p0 = pose(tSep), p1 = pose(tSep + 0.5);
                const vel = p1.pos.clone().sub(p0.pos).multiplyScalar(2);
                // posición mundial del propulsor en la separación
                if (g.parent !== ini.padre) ini.padre.add(g);
                g.position.copy(ini.pos); g.quaternion.copy(ini.quat);
                raiz.position.copy(p0.pos); raiz.quaternion.copy(p0.quat); raiz.updateMatrixWorld(true);
                g.updateMatrixWorld(true);
                g.matrixWorld.decompose(_p, _q, _s);
                const lateral = new THREE.Vector3(_p.x - p0.pos.x, 0, _p.z - p0.pos.z).normalize().multiplyScalar(6);
                const mundo = _p.clone().addScaledVector(vel.add(lateral), dt).add(new THREE.Vector3(0, -4.9 * dt * dt, 0));
                const giro = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.6 * dt, 0.2 * dt, 0.4 * dt));
                // devolver a coordenadas de la raíz (que el llamador coloca en la pose actual)
                const ahora = pose(t);
                raiz.position.copy(ahora.pos); raiz.quaternion.copy(ahora.quat); raiz.updateMatrixWorld(true);
                escena.suelto.add(g);
                _m.copy(escena.suelto.matrixWorld).invert();
                g.position.copy(mundo.applyMatrix4(_m));
                g.quaternion.copy(ahora.quat.clone().invert().multiply(_q).multiply(giro));
                g.scale.copy(_s);
                g.visible = true;
            });
            return enc ? sm((t - S.ignicion) / 2.5) : 0;
        },
        actualizarRecortes() {},
    };
}
