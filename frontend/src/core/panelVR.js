// Panel de telemetría dentro de las gafas (Quest 2): el HTML no se ve en VR, así que se dibuja en un
// lienzo (mismo estilo que el monitor del Control de Misión de nasa_space_apps).
import * as THREE from 'three';
import { formatearMET } from '../mision/tiempo.js';

export function crearPanelVR() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 420;
    const ctx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const malla = new THREE.Mesh(
        new THREE.PlaneGeometry(0.62, 0.254),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false })
    );
    malla.renderOrder = 50;
    malla.position.set(0, -0.32, -0.8);
    malla.rotation.x = -0.45;
    malla.visible = false;
    let ultimo = 0;

    return {
        malla,
        colocarEn(rig) { rig.add(malla); },
        actualizar(s, visible) {
            malla.visible = visible;
            if (!visible) return;
            const ahora = performance.now();
            if (ahora - ultimo < 200) return;
            ultimo = ahora;
            const V = '#4af626';
            ctx.fillStyle = 'rgba(4,10,6,0.88)'; ctx.fillRect(0, 0, 1024, 420);
            ctx.strokeStyle = V; ctx.lineWidth = 4; ctx.strokeRect(4, 4, 1016, 412);
            ctx.fillStyle = V; ctx.font = 'bold 40px Courier New, monospace';
            ctx.fillText(`APOLLO 11 · ${s.fase.nombre.toUpperCase()}`, 28, 60);
            ctx.font = '34px Courier New, monospace';
            ctx.fillStyle = '#fff';
            ctx.fillText(`${formatearMET(s.t)}   ×${s.warp}${s.pausado ? '  PAUSA' : ''}`, 28, 112);
            ctx.fillStyle = V;
            if (s.lm) {
                const l = s.lm;
                ctx.fillText(`ALT ${l.alt.toFixed(0)} m   VV ${l.vv.toFixed(1)}   VH ${l.vh.toFixed(1)} m/s`, 28, 170);
                ctx.fillText(`COMB ${l.fuelS.toFixed(0)} s   MODO ${l.modo}   ${l.rod ?? ''}`, 28, 222);
                ctx.fillText(`DIST ${l.dist.toFixed(0)} m`, 28, 274);
            } else if (s.tel) {
                ctx.fillText(`ALT ${s.tel.alt.toFixed(s.tel.alt < 100 ? 1 : 0)} km   VEL ${s.tel.vel.toFixed(3)} km/s`, 28, 170);
                ctx.fillText(`A LA LUNA ${Math.max(0, s.tel.distLuna).toFixed(0)} km`, 28, 222);
            }
            if (s.siguiente) {
                ctx.fillStyle = '#ffb020';
                ctx.fillText(`> ${s.siguiente.titulo} en ${formatearMET(s.siguiente.t - s.t).replace('T+', '')}`.slice(0, 52), 28, 330);
            }
            ctx.fillStyle = 'rgba(74,246,38,0.7)'; ctx.font = '26px Courier New, monospace';
            ctx.fillText('Gatillo izq: siguiente · A: modo · B: cámara · X: sala', 28, 390);
            tex.needsUpdate = true;
        },
    };
}
