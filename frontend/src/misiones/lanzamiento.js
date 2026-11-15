// Pantalla de lanzamiento (diseño de saturno_v_lanzamiento_web): texto a la izquierda, cohete 3D a la
// derecha, botón LANZAR y sonido; luego cuenta regresiva grande, destello y vibración en la ignición.
import { sonido } from '../core/audio.js';

const $ = (id) => document.getElementById(id);
const body = document.body;

$('btn-sonido').addEventListener('click', () => {
    const on = sonido.alternar();
    $('sonido-estado').textContent = on ? 'ON' : 'OFF';
    $('btn-sonido').setAttribute('aria-pressed', String(on));
});

// datos: { eyebrow, titulo:[línea1, línea2], descripcion, cohete, coheteSub, plataforma, mision, alLanzar, alVolver }
export function pantallaLanzamiento(d) {
    const el = $('lanzamiento');
    $('lz-eyebrow').textContent = d.eyebrow;
    $('lz-titulo').innerHTML = '';
    $('lz-titulo').append(d.titulo[0], document.createElement('br'));
    const em = document.createElement('em'); em.textContent = d.titulo[1]; $('lz-titulo').append(em);
    $('lz-desc').textContent = d.descripcion;
    $('lz-cohete').textContent = d.cohete;
    $('lz-cohete-sub').textContent = d.coheteSub;
    $('lz-plataforma').textContent = d.plataforma;
    $('lz-preflight').textContent = `${d.cohete} 3D · LISTO PARA LANZAR`;
    $('mision-num').textContent = d.mision;
    const lanzar = $('btn-lanzar');
    lanzar.disabled = false;
    lanzar.onclick = () => {
        lanzar.disabled = true;
        body.classList.add('lanzado');
        el.querySelector('.hero-copy').style.opacity = '0';
        el.querySelector('.rocket-caption').style.opacity = '0';
        d.alLanzar();
    };
    $('btn-volver').onclick = d.alVolver;
    el.querySelector('.hero-copy').style.opacity = '';
    el.querySelector('.rocket-caption').style.opacity = '';
    body.classList.add('en-lanzamiento');
    body.classList.remove('lanzado', 'ignited', 'ascent', 'shake');
    el.classList.remove('oculto');
    let ultimo = null, rugiendo = false;
    const hud = $('launchHud');

    return {
        // t: segundos respecto al despegue; ignicion: instante de encendido (negativo)
        cuenta(t, ignicion) {
            let n, sub, label = 'SECUENCIA DE LANZAMIENTO';
            if (t < 0) { n = String(Math.ceil(-t)).padStart(2, '0'); sub = t > ignicion ? 'IGNICIÓN' : 'CUENTA REGRESIVA'; }
            else if (t < 5) { n = '00'; sub = 'DESPEGUE'; label = 'TORRE LIBRE'; }
            else { hud.classList.remove('visible'); body.classList.remove('shake', 'ignited'); body.classList.add('ascent'); return; }
            hud.classList.add('visible');
            if (n !== ultimo) { ultimo = n; $('countNumber').textContent = n; sonido.pitido(t < 0 ? 760 : 980); }
            $('hudSub').textContent = sub; $('hudLabel').textContent = label;
            if (t > ignicion) {
                body.classList.add('ignited', 'shake');
                if (!rugiendo) { rugiendo = true; sonido.rugido(); }
            }
        },
        ocultar() {
            el.classList.add('oculto');
            hud.classList.remove('visible');
            body.classList.remove('en-lanzamiento', 'lanzado', 'ignited', 'ascent', 'shake');
        },
    };
}

// "EL VIAJE HA COMENZADO" al llegar al espacio
export function viajeComenzado(texto, ms = 6500) {
    const el = $('missionComplete');
    $('complete-texto').textContent = texto;
    el.classList.add('visible');
    setTimeout(() => el.classList.remove('visible'), ms);
}
