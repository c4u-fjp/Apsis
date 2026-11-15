// Menú de selección de misión dentro de las gafas (el HTML de la portada no se ve en VR).
// Se dibuja sobre el monitor "APSIS" del escritorio de la sala (no tapa la pantalla grande). Se elige:
//   - apuntando con cualquiera de los dos mandos (rayo) y pulsando el gatillo, o
//   - moviendo la selección con el joystick izquierdo y confirmando con A.
import * as THREE from 'three';

const W = 1024, H = 720;
const VERDE = '#4af626', AZUL = '#9ddfff';

export function crearMenuVR({ renderer, rig, padre, ancho = 0.75, opciones, alElegir, alEnfocar = () => {} }) {
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const malla = new THREE.Mesh(new THREE.PlaneGeometry(ancho, ancho * H / W),
        new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    malla.position.set(0, 0, 0.004);      // pegado a la cara del monitor
    malla.visible = false;
    padre.add(malla);

    // botones (en píxeles del lienzo)
    const luna = opciones.filter((o) => o.grupo === 'luna');
    const marte = opciones.filter((o) => o.grupo === 'marte');
    const botones = [];
    luna.forEach((o, i) => botones.push({ o, x: 40, y: 150 + i * 10, w: 450, h: 460, grande: true }));
    marte.forEach((o, i) => botones.push({ o, x: 534, y: 240 + i * 94, w: 450, h: 80 }));
    let foco = 0;              // índice seleccionado con el joystick
    const sobre = [null, null];  // botón bajo el rayo de cada mando
    let sucio = true, focoPrevio = -1;

    function dibujar() {
        if (foco !== focoPrevio) { focoPrevio = foco; alEnfocar(botones[foco].o); }
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = 'rgba(2,9,20,0.93)'; ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = '#66bdfb88'; ctx.lineWidth = 3; ctx.strokeRect(6, 6, W - 12, H - 12);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 54px "Barlow Condensed", Impact, sans-serif';
        ctx.fillText('APSIS · ELIGE TU DESTINO', 40, 82);
        ctx.fillStyle = '#8ca5ba'; ctx.font = '22px Montserrat, Arial, sans-serif';
        ctx.fillText('ABANDONED BUT NOT FORGOTTEN', 42, 118);
        // tarjeta de Marte (fondo)
        ctx.strokeStyle = '#ff9a7a88'; ctx.lineWidth = 2; ctx.strokeRect(520, 140, 478, 486);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 44px "Barlow Condensed", Impact, sans-serif';
        ctx.fillText('MARTE', 538, 192);
        ctx.fillStyle = '#abc4d8'; ctx.font = '20px Montserrat, Arial, sans-serif';
        ctx.fillText('Delta II · rovers y landers que siguen allí', 538, 222);
        botones.forEach((b, i) => {
            const activo = i === foco || sobre.includes(b);
            ctx.fillStyle = activo ? (b.o.grupo === 'luna' ? '#1d4a70' : '#5a2a1e') : 'rgba(11,27,44,0.85)';
            ctx.fillRect(b.x, b.y, b.w, b.h);
            ctx.strokeStyle = activo ? '#fff' : b.o.grupo === 'luna' ? '#66bdfb88' : '#ff9a7a88';
            ctx.lineWidth = activo ? 4 : 2;
            ctx.strokeRect(b.x, b.y, b.w, b.h);
            if (b.grande) {
                ctx.fillStyle = '#9ddfff'; ctx.font = '20px Montserrat, Arial, sans-serif';
                ctx.fillText('01 / DESTINO', b.x + 24, b.y + 40);
                ctx.fillStyle = '#fff'; ctx.font = 'bold 64px "Barlow Condensed", Impact, sans-serif';
                ctx.fillText(b.o.titulo, b.x + 24, b.y + 200);
                ctx.fillStyle = '#abc4d8'; ctx.font = '22px Montserrat, Arial, sans-serif';
                ctx.fillText(b.o.sub, b.x + 24, b.y + 240);
                ctx.fillText('Etapa de descenso de Eagle,', b.x + 24, b.y + 280);
                ctx.fillText('sismómetro y retrorreflector.', b.x + 24, b.y + 310);
                ctx.fillStyle = activo ? '#fff' : AZUL; ctx.font = 'bold 26px Montserrat, Arial, sans-serif';
                ctx.fillText('VIAJAR ↗', b.x + b.w - 150, b.y + b.h - 30);
            } else {
                ctx.fillStyle = '#fff'; ctx.font = 'bold 30px Montserrat, Arial, sans-serif';
                ctx.fillText(b.o.titulo, b.x + 22, b.y + 50);
                ctx.fillStyle = '#ffc2ad'; ctx.font = '22px Montserrat, Arial, sans-serif';
                ctx.fillText(b.o.sub, b.x + b.w - 22 - ctx.measureText(b.o.sub).width, b.y + 50);
            }
        });
        ctx.fillStyle = VERDE; ctx.font = '21px "Courier New", monospace';
        ctx.fillText('Apunta y pulsa el GATILLO  ·  o STICK IZQ + A  ·  Y: salir de VR', 40, 676);
        tex.needsUpdate = true;
        sucio = false;
    }

    // Mandos: rayo + punto donde toca el panel
    const ray = new THREE.Raycaster(), rot = new THREE.Matrix4();
    const mandos = [0, 1].map((i) => {
        const c = renderer.xr.getController(i);
        const linea = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]),
            new THREE.LineBasicMaterial({ color: 0x9ddfff, transparent: true, opacity: 0.8 }));
        linea.scale.z = 3;
        const punto = new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }));
        punto.renderOrder = 61;
        c.add(linea);
        rig.add(c, punto);
        c.addEventListener('select', () => { if (malla.visible && sobre[i]) alElegir(sobre[i].o); });
        return { c, linea, punto };
    });

    function botonEn(uv) {
        const x = uv.x * W, y = (1 - uv.y) * H;
        return botones.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) ?? null;
    }

    return {
        malla, mandos,
        get visible() { return malla.visible; },
        actualizar(visible) {
            malla.visible = visible;
            for (const m of mandos) { m.linea.visible = visible; m.punto.visible = false; }
            if (!visible) return;
            rig.updateMatrixWorld(true);
            mandos.forEach((m, i) => {
                rot.identity().extractRotation(m.c.matrixWorld);
                ray.ray.origin.setFromMatrixPosition(m.c.matrixWorld);
                ray.ray.direction.set(0, 0, -1).applyMatrix4(rot);
                const hit = ray.intersectObject(malla, false)[0];
                const b = hit ? botonEn(hit.uv) : null;
                if (b !== sobre[i]) { sobre[i] = b; sucio = true; if (b) foco = botones.indexOf(b); }
                m.linea.scale.z = hit ? hit.distance : 3;
                if (hit) { m.punto.visible = true; m.punto.position.copy(rig.worldToLocal(hit.point.clone())); }
            });
            if (sucio) dibujar();
        },
        // joystick izquierdo y botón A (vienen como acciones de la entrada)
        accion(a) {
            const b = botones[foco];
            if (a === 'adelantar' || a === 'atrasar') {          // ↑ / ↓ dentro de Marte, o hacia/desde la Luna
                if (b.o.grupo === 'marte') foco = Math.max(luna.length, Math.min(botones.length - 1, foco + (a === 'atrasar' ? 1 : -1)));
            } else if (a === 'masRapido') { if (b.o.grupo === 'luna') foco = luna.length; }   // →  a Marte
            else if (a === 'masLento') { foco = 0; }                                          // ←  a la Luna
            else if (a === 'modo' || a === 'aceptar') { alElegir(b.o); return; }
            sucio = true;
        },
    };
}
