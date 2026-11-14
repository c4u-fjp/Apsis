// Cámara orbital sencilla (ratón, rueda y pellizco táctil) que trabaja en un marco local arbitrario:
// la escena decide los ejes (p. ej. "arriba" = radial) y aquí solo se guardan distancia y ángulos.
import * as THREE from 'three';

export class Orbita {
    constructor(dom) {
        this.dom = dom;
        this.enabled = false;
        this.r = 1; this.az = 0; this.el = 0.2;
        this.minR = 1e-4; this.maxR = 1e7;
        this.minEl = -1.45; this.maxEl = 1.45;
        this.interactuo = false;
        const punteros = new Map();
        let distPrevia = 0;
        dom.addEventListener('pointerdown', (e) => {
            if (!this.enabled) return;
            punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
            dom.setPointerCapture?.(e.pointerId);
            if (punteros.size === 2) { const [a, b] = [...punteros.values()]; distPrevia = Math.hypot(a.x - b.x, a.y - b.y); }
        });
        dom.addEventListener('pointermove', (e) => {
            if (!this.enabled || !punteros.has(e.pointerId)) return;
            const p = punteros.get(e.pointerId);
            const dx = e.clientX - p.x, dy = e.clientY - p.y;
            p.x = e.clientX; p.y = e.clientY;
            if (punteros.size === 1) {
                this.az -= dx * 0.006;
                this.el = Math.min(this.maxEl, Math.max(this.minEl, this.el + dy * 0.006));
            } else if (punteros.size === 2) {
                const [a, b] = [...punteros.values()];
                const d = Math.hypot(a.x - b.x, a.y - b.y);
                if (distPrevia > 0) this._zoom(distPrevia / d);
                distPrevia = d;
            }
            this.interactuo = true;
        });
        const fin = (e) => { punteros.delete(e.pointerId); distPrevia = 0; };
        dom.addEventListener('pointerup', fin);
        dom.addEventListener('pointercancel', fin);
        dom.addEventListener('wheel', (e) => {
            if (!this.enabled) return;
            e.preventDefault();
            this._zoom(Math.exp(e.deltaY * 0.0012));
            this.interactuo = true;
        }, { passive: false });
    }

    _zoom(f) { this.r = Math.min(this.maxR, Math.max(this.minR, this.r * f)); }

    fijar(v) {
        this.r = Math.max(1e-9, v.length());
        this.el = Math.asin(Math.max(-1, Math.min(1, v.y / this.r)));
        this.az = Math.atan2(v.x, v.z);
        this.interactuo = false;
    }

    leer(out = new THREE.Vector3()) {
        const c = Math.cos(this.el);
        return out.set(this.r * c * Math.sin(this.az), this.r * Math.sin(this.el), this.r * c * Math.cos(this.az));
    }
}
