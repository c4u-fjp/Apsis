// Panel de telemetría dentro de las gafas (Quest 2): el HTML no se ve en VR, así que se dibuja en un
// lienzo (mismo estilo que el monitor del Control de Misión de nasa_space_apps). Abajo muestra la
// velocidad de la simulación y la guía de los mandos, que cambia cuando se pilota el LM a mano.
import * as THREE from 'three';
import { formatearMET } from '../mision/tiempo.js';
import { t } from '../i18n/index.js';

const W = 1024, H = 600;

export function crearPanelVR() {
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const malla = new THREE.Mesh(
        new THREE.PlaneGeometry(0.62, 0.62 * H / W),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false })
    );
    malla.renderOrder = 50;
    malla.position.set(0, -0.36, -0.8);
    malla.rotation.x = -0.5;
    malla.visible = false;
    let ultimo = 0, warpPrevio = null, tCambio = 0;

    // fila de la guía: [tecla, texto]
    function guia(y, filas) {
        ctx.font = 'bold 24px Courier New, monospace';
        let x = 28;
        for (const [tecla, texto] of filas) {
            const wt = ctx.measureText(tecla).width + 16;
            ctx.fillStyle = '#4af626'; ctx.fillRect(x, y - 24, wt, 32);
            ctx.fillStyle = '#041006'; ctx.fillText(tecla, x + 8, y);
            x += wt + 8;
            ctx.font = '24px Courier New, monospace';
            ctx.fillStyle = '#cfe';
            ctx.fillText(texto, x, y);
            x += ctx.measureText(texto).width + 22;
            ctx.font = 'bold 24px Courier New, monospace';
        }
    }

    return {
        malla,
        colocarEn(rig) { rig.add(malla); },
        actualizar(s, visible) {
            malla.visible = visible;
            if (!visible) return;
            const ahora = performance.now();
            if (s.warp !== warpPrevio) { warpPrevio = s.warp; tCambio = ahora; }
            if (ahora - ultimo < 150) return;
            ultimo = ahora;
            const V = '#4af626';
            ctx.clearRect(0, 0, W, H);
            ctx.fillStyle = 'rgba(4,10,6,0.9)'; ctx.fillRect(0, 0, W, H);
            ctx.strokeStyle = V; ctx.lineWidth = 4; ctx.strokeRect(4, 4, W - 8, H - 8);
            const mision = (document.getElementById('titulo-panel')?.textContent ?? 'APSIS').split(' · ')[0];
            ctx.fillStyle = V; ctx.font = 'bold 38px Courier New, monospace';
            ctx.fillText(`${mision} · ${t(s.fase.nombre).toUpperCase()}`.slice(0, 44), 28, 56);
            ctx.font = '32px Courier New, monospace';
            ctx.fillStyle = '#fff';
            ctx.fillText(formatearMET(s.t), 28, 104);

            // velocidad de la simulación, destacada un momento cuando cambia
            const reciente = ahora - tCambio < 1200;
            ctx.font = 'bold 34px Courier New, monospace';
            const txtWarp = s.pausado ? t('PAUSA') : `×${s.warp}`;
            const xw = 560;
            ctx.fillStyle = reciente ? '#ffb020' : '#fff';
            ctx.fillText(`◀  ${txtWarp}  ▶`, xw, 104);
            ctx.font = '20px Courier New, monospace'; ctx.fillStyle = 'rgba(207,238,221,0.8)';
            ctx.fillText(s.auto ? t('VELOCIDAD: MODO HISTORIA') : t('VELOCIDAD: MANUAL'), xw, 132);

            ctx.font = '30px Courier New, monospace'; ctx.fillStyle = V;
            if (s.lm) {
                const l = s.lm;
                ctx.fillText(`ALT ${l.alt.toFixed(0)} m   VV ${l.vv.toFixed(1)}   VH ${l.vh.toFixed(1)} m/s`, 28, 180);
                ctx.fillText(`${t('COMB')} ${l.fuelS.toFixed(0)} s   ${t('MODO')} ${l.modo}   ${l.rod ?? ''}   DIST ${l.dist.toFixed(0)} m`, 28, 224);
            } else if (s.tel) {
                ctx.fillText(`ALT ${s.tel.alt.toFixed(s.tel.alt < 100 ? 1 : 0)} km   VEL ${s.tel.vel.toFixed(3)} km/s`, 28, 180);
                if (s.tel.distLuna) ctx.fillText(`${t('A LA LUNA')} ${Math.max(0, s.tel.distLuna).toFixed(0)} km`, 28, 224);
            }
            if (s.siguiente) {
                ctx.fillStyle = '#ffb020';
                ctx.fillText(`> ${s.siguiente.titulo} ${t('en')} ${formatearMET(s.siguiente.t - s.t).replace('T+', '')}`.slice(0, 54), 28, 276);
            }

            // guía de los mandos
            ctx.fillStyle = 'rgba(74,246,38,0.35)'; ctx.fillRect(20, 310, W - 40, 2);
            const pilotando = s.lm && s.lm.modo !== 'AUTO';
            const enPlataforma = !document.getElementById('lanzamiento')?.classList.contains('oculto');
            if (enPlataforma) {   // la pantalla de lanzamiento es HTML y no se ve en VR: el botón va aquí
                const cohete = document.getElementById('lz-cohete')?.textContent ?? '';
                ctx.fillStyle = '#ffb020'; ctx.fillRect(20, 322, W - 40, 110);
                ctx.fillStyle = '#140a00'; ctx.font = 'bold 44px Courier New, monospace';
                ctx.fillText(t('A o GATILLO IZQ · ¡LANZAR {cohete}!', { cohete }).slice(0, 40), 40, 392);
                guia(470, [[t('STICK IZQ ↓'), t('cambiar destino')], [t('GATILLO IZQ'), t('lanzar')]]);
            } else if (s.inicio) {
                ctx.fillStyle = '#fff'; ctx.font = 'bold 26px Courier New, monospace';
                ctx.fillText(t('ELIGE DESTINO'), 28, 348);
                guia(400, [[t('GATILLO IZQ'), t('la Luna · Apollo 11')], ['A', t('Marte · Spirit')]]);
            } else if (pilotando) {
                ctx.fillStyle = '#ffb020'; ctx.font = 'bold 24px Courier New, monospace';
                ctx.fillText(t('PILOTAJE MANUAL DEL LM'), 28, 348);
                guia(396, [[t('GATILLO DER'), t('empuje')], [t('STICK DER ←→'), t('inclinar')]]);
                guia(442, [[t('STICK IZQ ↑↓'), t('velocidad de descenso')], ['A', t('modo AUTO/P66/directo')]]);
            } else {
                guia(352, [[t('STICK IZQ ←→'), t('velocidad −/+')], ['↑↓', t('evento sig./ant.')], [t('CLIC'), t('pausa')]]);
                guia(398, [[t('STICK DER ←→'), t('girar')], ['↑↓', t('acercar/alejar')], [t('CLIC o B'), t('vista')]]);
                guia(444, [[t('GATILLO IZQ'), t('siguiente')], ['A', t('modo')], ['X', t('control de misión')]]);
            }
            ctx.fillStyle = '#ff7a5c'; ctx.fillRect(20, 500, W - 40, 74);
            ctx.fillStyle = '#140604'; ctx.font = 'bold 30px Courier New, monospace';
            ctx.fillText(t('Y  ·  SALIR DE VR (volver a la pantalla normal)'), 40, 548);
            tex.needsUpdate = true;
        },
    };
}
