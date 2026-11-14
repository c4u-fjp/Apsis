import * as THREE from 'three';
import { StereoEffect } from 'three/examples/jsm/effects/StereoEffect.js';

const ZEE = new THREE.Vector3(0, 0, 1);
const Q_X90 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
const rad = THREE.MathUtils.degToRad;

// motor: { renderer, contenedor, controles(): OrbitControls activos o null }
export function crearModoCardboard(motor, { alEntrar, alSalir } = {}) {
    const efecto = new StereoEffect(motor.renderer);
    efecto.setEyeSeparation(0.064);

    const euler = new THREE.Euler();
    const q0 = new THREE.Quaternion();
    const orientacion = new THREE.Quaternion();
    const estado = { activo: false };
    let alphaInicial = null;

    function alOrientar(e) {
        if (e.alpha === null) return;
        if (alphaInicial === null) alphaInicial = e.alpha;
        const pantalla = rad(screen.orientation?.angle ?? window.orientation ?? 0);
        euler.set(rad(e.beta), rad(e.alpha - alphaInicial), -rad(e.gamma), 'YXZ');
        orientacion.setFromEuler(euler);
        orientacion.multiply(Q_X90);
        orientacion.multiply(q0.setFromAxisAngle(ZEE, -pantalla));
    }

    const panel = document.getElementById('panel-control');
    const mira = document.querySelector('.crosshair');
    const reajustar = () => window.dispatchEvent(new Event('resize'));

    async function entrar() {
        if (typeof DeviceOrientationEvent !== 'undefined' &&
            typeof DeviceOrientationEvent.requestPermission === 'function') {
            if ((await DeviceOrientationEvent.requestPermission()) !== 'granted') return;
        }
        window.addEventListener('deviceorientation', alOrientar);
        try {
            await document.documentElement.requestFullscreen();
            await screen.orientation?.lock?.('landscape');
        } catch { }

        if (panel) panel.style.display = 'none';
        if (mira) mira.style.display = 'none';
        motor.alEntrarCardboard?.();
        alphaInicial = null;
        estado.activo = true;
        reajustar();
        alEntrar?.();
    }

    function salir() {
        window.removeEventListener('deviceorientation', alOrientar);
        estado.activo = false;
        if (panel) panel.style.display = '';
        if (mira) mira.style.display = '';
        motor.alSalirCardboard?.();
        screen.orientation?.unlock?.();
        reajustar();
        alSalir?.();
    }

    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement && estado.activo) salir();
    });

    const boton = document.createElement('button');
    boton.textContent = 'MODO CARDBOARD';
    boton.style.cssText = 'position:absolute;bottom:20px;left:calc(50% + 90px);width:170px;padding:12px 6px;' +
        'font:0.8rem "Courier New",monospace;color:#4af626;background:rgba(5,10,6,.85);' +
        'border:1px solid #1a3a22;cursor:pointer;z-index:999';
    boton.addEventListener('click', () => (estado.activo ? document.exitFullscreen?.() : entrar()));
    motor.contenedor.appendChild(boton);

    return {
        get activo() { return estado.activo; },
        render(escena, camara) {
            if (!estado.activo) { motor.renderer.render(escena, camara); return; }
            // la orientación del móvil se aplica sobre la orientación base de la cámara de la escena
            camara.quaternion.copy(camara.userData.qBase ?? camara.quaternion.identity()).multiply(orientacion);
            efecto.render(escena, camara);
        }
    };
}